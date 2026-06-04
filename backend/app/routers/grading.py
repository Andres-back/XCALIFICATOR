import os
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.config import get_settings
from app.models.models import User, Examen, Materia, Matricula, RespuestaOnline
from app.services.nota_service import upsert_nota
from app.services.ocr_service import (
    DEFAULT_GROQ_OCR_MODEL,
    DEFAULT_OLLAMA_OCR_MODEL,
    process_exam_image,
)
from app.services.groq_service import grade_exam_with_fallback
from app.services.vision_grading_service import grade_interactive_with_vision
from app.schemas.schemas import NotaOut

router = APIRouter(prefix="/grading", tags=["Calificación Automática"])
settings = get_settings()
logger = logging.getLogger(__name__)

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}


def _build_image_ocr_config(ai_config: dict | None) -> dict:
    """Build OCR config for image uploads: forces ollama_vision -> groq_vision.

    Reads the configured ocr_model / ocr_fallback_model / ollama_url / ollama_api_key
    directly from the effective (global + profesor) config. Falls back to env vars
    (including OLLAMA_CLOUD_* for the new Ollama Cloud naming) and finally to safe
    defaults. Auto-derives a Cloud URL when the configured model looks like a
    Cloud model (:cloud suffix or known Cloud families).
    """
    cfg = dict(ai_config or {})
    configured_provider = str(cfg.get("ocr_provider") or "").strip().lower()
    configured_fallback = str(cfg.get("ocr_fallback_provider") or "").strip().lower()
    configured_model = str(cfg.get("ocr_model") or "").strip()
    configured_fallback_model = str(cfg.get("ocr_fallback_model") or "").strip()

    profesor_ollama_model = ""
    if configured_provider == "ollama_vision":
        profesor_ollama_model = configured_model
    elif configured_fallback == "ollama_vision":
        profesor_ollama_model = configured_fallback_model

    configured_groq_model = ""
    if configured_provider == "groq_vision":
        configured_groq_model = configured_model
    elif configured_fallback == "groq_vision":
        configured_groq_model = configured_fallback_model

    # 1) Ollama OCR model: use whatever the profesor/global configured.
    #    Do NOT depend on the original ocr_provider value — the user may have
    #    set ollama_vision as the model provider while keeping paddleocr as a
    #    primary tag for non-image paths.
    ocr_model = (
        profesor_ollama_model
        or str(settings.OLLAMA_CLOUD_OCR_MODEL or "").strip()
        or str(settings.OCR_OLLAMA_MODEL or "").strip()
        or DEFAULT_OLLAMA_OCR_MODEL
    )

    # 2) Fallback model (Groq vision) — keep prior precedence but always return
    #    a non-empty value so the fallback chain is always usable.
    fallback_model = (
        configured_groq_model
        or str(settings.OCR_GROQ_FALLBACK_MODEL or "").strip()
        or DEFAULT_GROQ_OCR_MODEL
    )

    # 3) Ollama URL — explicit DB value wins; then Cloud env; then local env;
    #    then auto-derive Cloud if the model is a known Cloud family.
    configured_url = str(cfg.get("ollama_url") or "").strip()
    env_local_url = str(settings.OLLAMA_URL or "").strip()
    env_cloud_url = str(settings.OLLAMA_CLOUD_URL or "").strip()

    if configured_url and configured_url != "http://host.docker.internal:11434":
        ollama_url = configured_url
    elif env_cloud_url:
        ollama_url = env_cloud_url
    elif env_local_url:
        ollama_url = env_local_url
    else:
        # Auto-derive: if the model looks like a Cloud model, default to Ollama Cloud.
        is_cloud_model = (
            ":cloud" in ocr_model.lower()
            or ocr_model.lower().startswith("qwen")
            or ocr_model.lower().startswith("deepseek")
        )
        ollama_url = "https://ollama.com" if is_cloud_model else "http://host.docker.internal:11434"

    # 4) Ollama API key — explicit DB value wins; then Cloud env; then local env.
    configured_key = str(cfg.get("ollama_api_key") or "").strip()
    ollama_api_key = (
        configured_key
        or str(settings.OLLAMA_CLOUD_API_KEY or "").strip()
        or str(settings.OLLAMA_API_KEY or "").strip()
    )

    cfg.update({
        "ocr_provider": "ollama_vision",
        "ocr_model": ocr_model,
        "ocr_fallback_provider": "groq_vision",
        "ocr_fallback_model": fallback_model,
        "ollama_url": ollama_url.rstrip("/"),
        "ollama_api_key": ollama_api_key,
    })
    return cfg


async def _assert_examen_access(
    db: AsyncSession,
    examen_id: str,
    current_user: User,
) -> tuple[Examen, Materia]:
    examen_result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = examen_result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    materia_result = await db.execute(select(Materia).where(Materia.id == examen.materia_id))
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso")

    return examen, materia


async def _assert_student_enrolled(
    db: AsyncSession,
    materia_id: str,
    estudiante_id: str,
) -> None:
    enrollment_result = await db.execute(
        select(Matricula.id).where(
            Matricula.materia_id == materia_id,
            Matricula.estudiante_id == estudiante_id,
        )
    )
    if not enrollment_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El estudiante no está inscrito en la materia del examen")

# ──────── SMART GRADING HELPERS ────────

async def _upsert_presential_ocr_submission(
    db: AsyncSession,
    *,
    estudiante_id: str,
    examen_id: str,
    captured_by: str,
    filename: str,
    content_type: str | None,
    file_size: int,
    file_url: str,
    ocr_result: dict,
    grading_result: dict,
    image_ocr_config: dict,
) -> RespuestaOnline:
    payload = {
        "tipo_entrega": "ocr_presencial",
        "origen": "profesor_foto",
        "capturado_por": captured_by,
        "archivo": {
            "nombre": filename,
            "url": file_url,
            "content_type": content_type,
            "size_bytes": file_size,
        },
        "ocr": {
            "provider_order": ["ollama_vision", "groq_vision"],
            "model": image_ocr_config.get("ocr_model"),
            "fallback_model": image_ocr_config.get("ocr_fallback_model"),
            "quality": ocr_result.get("ocr_quality"),
            "motivo": ocr_result.get("ocr_motivo"),
            "tipo_escritura": ocr_result.get("tipo_escritura"),
            "texto_extraido_preview": (ocr_result.get("texto_extraido") or "")[:600],
        },
        "preguntas": ocr_result.get("preguntas") or [],
        "calificacion": {
            "nota_total": grading_result.get("nota_total"),
            "nota_maxima": grading_result.get("nota_maxima"),
            "estado": "requiere_revision" if grading_result.get("requiere_revision_profesor") else "calificada",
        },
    }

    result = await db.execute(
        select(RespuestaOnline).where(
            RespuestaOnline.estudiante_id == estudiante_id,
            RespuestaOnline.examen_id == examen_id,
        )
    )
    respuesta = result.scalar_one_or_none()
    if respuesta is None:
        respuesta = RespuestaOnline(
            estudiante_id=estudiante_id,
            examen_id=examen_id,
            respuestas_json=payload,
        )
        db.add(respuesta)
    else:
        respuesta.respuestas_json = payload
        respuesta.enviado_at = datetime.now(timezone.utc)
    return respuesta


def _normalize(s: str) -> str:
    """Normalize a string for comparison."""
    if not s:
        return ""
    return s.strip().lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")


AUTO_GRADABLE_TYPES = {"seleccion_multiple", "verdadero_falso"}
INTERACTIVE_TYPES = {"sopa_letras", "crucigrama", "emparejar"}


def _safe_float(value, default: float = 1.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _question_sort_key(value) -> tuple[int, int | str]:
    if isinstance(value, int):
        return (0, value)
    text = str(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _has_interactive_content(examen: Examen) -> bool:
    if examen.tipo in INTERACTIVE_TYPES:
        return True
    content = examen.contenido_json if isinstance(examen.contenido_json, dict) else {}
    return any(key in content for key in INTERACTIVE_TYPES)


def _build_effective_key(examen: Examen) -> list[dict]:
    """
    Build a robust answer key using clave_respuestas first, then contenido_json as fallback.
    This allows grading even when legacy exams have incomplete clave_respuestas.
    """
    contenido = examen.contenido_json if isinstance(examen.contenido_json, dict) else {}
    preguntas = contenido.get("preguntas", []) if isinstance(contenido.get("preguntas", []), list) else []

    preguntas_map = {}
    for p in preguntas:
        if not isinstance(p, dict):
            continue
        num = p.get("numero")
        if num is None:
            continue
        preguntas_map[num] = p

    clave_raw = examen.clave_respuestas
    if isinstance(clave_raw, dict) and "preguntas" in clave_raw and isinstance(clave_raw.get("preguntas"), list):
        clave_list = [c for c in clave_raw.get("preguntas", []) if isinstance(c, dict)]
    elif isinstance(clave_raw, list):
        clave_list = [c for c in clave_raw if isinstance(c, dict)]
    elif isinstance(clave_raw, dict):
        clave_list = [clave_raw]
    else:
        clave_list = []

    merged: dict = {}

    for c in clave_list:
        num = c.get("numero")
        if num is None:
            continue
        meta = preguntas_map.get(num, {})
        opciones = c.get("opciones") if c.get("opciones") is not None else meta.get("opciones", [])
        if not isinstance(opciones, list):
            opciones = []

        merged[num] = {
            "numero": num,
            "respuesta_correcta": c.get("respuesta_correcta") or meta.get("respuesta_correcta") or "",
            "puntos": _safe_float(c.get("puntos", meta.get("puntos", 1.0)), 1.0),
            "tipo": c.get("tipo") or meta.get("tipo") or "",
            "enunciado": c.get("enunciado") or meta.get("enunciado") or meta.get("pregunta") or "",
            "opciones": opciones,
        }

    for num, meta in preguntas_map.items():
        if num in merged:
            continue
        opciones = meta.get("opciones", [])
        if not isinstance(opciones, list):
            opciones = []

        merged[num] = {
            "numero": num,
            "respuesta_correcta": meta.get("respuesta_correcta") or "",
            "puntos": _safe_float(meta.get("puntos", 1.0), 1.0),
            "tipo": meta.get("tipo") or "",
            "enunciado": meta.get("enunciado") or meta.get("pregunta") or "",
            "opciones": opciones,
        }

    return [merged[k] for k in sorted(merged.keys(), key=_question_sort_key)]


def _merge_grading_results(base: dict, extra: dict) -> dict:
    if not extra:
        return base

    base_questions = base.get("preguntas") if isinstance(base.get("preguntas"), list) else []
    extra_questions = extra.get("preguntas") if isinstance(extra.get("preguntas"), list) else []
    existing_nums = {
        str(p.get("numero")) for p in base_questions if isinstance(p, dict)
    }
    for p in extra_questions:
        if not isinstance(p, dict):
            continue
        if str(p.get("numero")) in existing_nums:
            continue
        base_questions.append(p)

    base["preguntas"] = base_questions
    base["nota_total"] = round(
        _safe_float(base.get("nota_total"), 0.0) + _safe_float(extra.get("nota_total"), 0.0),
        2,
    )
    base["nota_maxima"] = round(
        _safe_float(base.get("nota_maxima"), 0.0) + _safe_float(extra.get("nota_maxima"), 0.0),
        2,
    )
    base["tiene_preguntas_abiertas"] = bool(base.get("tiene_preguntas_abiertas")) or bool(
        extra.get("tiene_preguntas_abiertas")
    )
    if extra.get("calificacion_automatica") is False:
        base["calificacion_automatica"] = False
    return base


def _smart_grade(examen: Examen, resp_list: list[dict], clave_list: list[dict] | None = None) -> dict:
    """
    Split questions into objective (auto-graded locally) and open-ended (need LLM).
    Returns {
      "objective_results": [...],   # already graded
      "open_questions_resp": [...], # student answers for open-ended
      "open_questions_key": [...],  # answer key for open-ended
      "nota_objective": float,
      "nota_maxima_objective": float,
      "nota_maxima_open": float,
      "all_objective": bool,
    }
    """
    contenido = examen.contenido_json if isinstance(examen.contenido_json, dict) else {}
    clave_list = clave_list or _build_effective_key(examen)

    # Build lookup for question types from contenido_json
    preguntas_info = {}
    preguntas_meta = {}
    for p in contenido.get("preguntas", []):
        if not isinstance(p, dict):
            continue
        num = p.get("numero")
        if num is None:
            continue
        preguntas_info[num] = p.get("tipo", "")
        preguntas_meta[num] = p

    # Build lookup for student responses
    resp_map = {}
    for r in resp_list:
        if isinstance(r, dict):
            resp_map[r.get("numero")] = r.get("respuesta", "")

    objective_results = []
    open_questions_resp = []
    open_questions_key = []
    nota_objective = 0.0
    nota_maxima_objective = 0.0
    nota_maxima_open = 0.0

    for c in clave_list:
        if not isinstance(c, dict):
            continue
        num = c.get("numero")
        if num is None:
            continue
        meta = preguntas_meta.get(num, {})
        puntos = _safe_float(c.get("puntos", meta.get("puntos", 1.0)), 1.0)
        respuesta_correcta = str(c.get("respuesta_correcta") or meta.get("respuesta_correcta") or "")
        tipo = c.get("tipo") or preguntas_info.get(num, "") or meta.get("tipo", "")
        enunciado = c.get("enunciado") or meta.get("enunciado") or meta.get("pregunta") or ""
        opciones = c.get("opciones") if c.get("opciones") is not None else meta.get("opciones", [])
        if not isinstance(opciones, list):
            opciones = []
        respuesta_est = str(resp_map.get(num, ""))

        if tipo in AUTO_GRADABLE_TYPES and _normalize(respuesta_correcta):
            correcto = _normalize(respuesta_correcta) == _normalize(respuesta_est)
            nota_maxima_objective += puntos
            if correcto:
                nota_objective += puntos
            objective_results.append({
                "numero": num,
                "respuesta_estudiante": respuesta_est,
                "respuesta_correcta": respuesta_correcta,
                "nota": puntos if correcto else 0.0,
                "nota_maxima": puntos,
                "retroalimentacion": "Correcto" if correcto else f"Incorrecto. La respuesta correcta es: {respuesta_correcta}",
                "correcto": correcto,
                "tipo": tipo,
            })
        else:
            nota_maxima_open += puntos
            # Collect for LLM grading
            open_questions_resp.append({
                "numero": num,
                "respuesta": respuesta_est,
                "tipo": tipo,
                "enunciado": enunciado,
                "opciones": opciones,
            })
            open_questions_key.append({
                "numero": num,
                "respuesta_correcta": respuesta_correcta,
                "puntos": puntos,
                "tipo": tipo,
                "enunciado": enunciado,
                "opciones": opciones,
            })

    return {
        "objective_results": objective_results,
        "open_questions_resp": open_questions_resp,
        "open_questions_key": open_questions_key,
        "nota_objective": round(nota_objective, 2),
        "nota_maxima_objective": round(nota_maxima_objective, 2),
        "nota_maxima_open": round(nota_maxima_open, 2),
        "nota_maxima_total": round(nota_maxima_objective + nota_maxima_open, 2),
        "all_objective": len(open_questions_resp) == 0,
    }


@router.post("/upload", response_model=NotaOut)
async def grade_uploaded_exam(
    examen_id: str = Form(...),
    estudiante_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Full grading pipeline: upload image → OCR → LLM grade → save."""
    # Validate file
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (máx 10MB)")

    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido")

    # Get exam with answer key and enforce ownership
    examen, materia = await _assert_examen_access(db, examen_id, current_user)
    content = examen.contenido_json if isinstance(examen.contenido_json, dict) else {}
    has_interactive = _has_interactive_content(examen)
    effective_key = _build_effective_key(examen)
    if not effective_key and not has_interactive:
        raise HTTPException(
            status_code=400,
            detail="El examen no tiene clave de respuestas ni respuestas_correctas en contenido_json",
        )

    await _assert_student_enrolled(db, str(examen.materia_id), estudiante_id)

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (máx 10MB)")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    filename = file.filename or "upload.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Extensión de archivo no permitida")

    # Save original file
    file_id = str(uuid.uuid4())
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    ai_config = await get_profesor_ai_config(
        db,
        str(materia.profesor_id) if getattr(materia, "profesor_id", None) else None,
    )
    image_ocr_config = _build_image_ocr_config(ai_config)

    ocr_result = {"texto_extraido": "", "preguntas": [], "tipo_escritura": "desconocido"}
    grading_result = {
        "nota_total": 0.0,
        "nota_maxima": 0.0,
        "preguntas": [],
        "calificacion_automatica": True,
        "tiene_preguntas_abiertas": False,
    }
    needs_ocr = isinstance(content.get("preguntas"), list) and len(content.get("preguntas")) > 0

    if needs_ocr:
        # OCR Pipeline
        try:
            ocr_result = await process_exam_image(file_bytes, filename, image_ocr_config)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error en OCR: {str(e)}")

        # ── OCR Quality Gate ──────────────────────────────────────────────
        ocr_quality: str = ocr_result.get("ocr_quality", "alta")
        ocr_motivo: str = ocr_result.get("ocr_motivo", "")

        if ocr_quality == "baja":
            logger.warning(
                "OCR quality LOW for exam %s / student %s: %s",
                examen_id, estudiante_id, ocr_motivo,
            )
            revision_detail = {
                "requiere_revision_profesor": True,
                "motivo_revision": ocr_motivo,
                "ocr_quality": "baja",
                "ocr_provider_order": ["ollama_vision", "groq_vision"],
                "ocr_model": image_ocr_config.get("ocr_model"),
                "ocr_fallback_model": image_ocr_config.get("ocr_fallback_model"),
                "texto_extraido_preview": ocr_result["texto_extraido"][:600],
            }
            await _upsert_presential_ocr_submission(
                db,
                estudiante_id=estudiante_id,
                examen_id=examen_id,
                captured_by=str(current_user.id),
                filename=filename,
                content_type=file.content_type,
                file_size=len(file_bytes),
                file_url=f"/uploads/{file_id}{ext}",
                ocr_result=ocr_result,
                grading_result={
                    "nota_total": None,
                    "nota_maxima": 0.0,
                    "requiere_revision_profesor": True,
                },
                image_ocr_config=image_ocr_config,
            )
            nota_revision = await upsert_nota(
                db,
                estudiante_id=estudiante_id,
                examen_id=examen_id,
                nota_val=None,
                detalle_json=revision_detail,
                retroalimentacion=(
                    "Calificación pendiente de revisión manual — "
                    "el OCR no pudo leer el examen con suficiente confianza."
                ),
                imagen_procesada_url=f"/uploads/{file_id}{ext}",
                texto_extraido=ocr_result["texto_extraido"],
            )
            await db.commit()
            await db.refresh(nota_revision)
            return NotaOut.model_validate(nota_revision)

        # ── Smart Grading: auto-grade objective, LLM only for open-ended ──
        try:
            ocr_questions = ocr_result.get("preguntas", [])

            # Try smart grading if we have contenido_json with question types
            smart = _smart_grade(examen, ocr_questions, effective_key)

            if smart["all_objective"]:
                # All questions are objective — skip LLM entirely!
                logger.info(f"OCR smart grading: all {len(smart['objective_results'])} questions are objective, skipping LLM")
                grading_result = {
                    "nota_total": smart["nota_objective"],
                    "nota_maxima": smart["nota_maxima_objective"],
                    "preguntas": smart["objective_results"],
                    "calificacion_automatica": True,
                    "tiene_preguntas_abiertas": False,
                }
            elif smart["open_questions_resp"]:
                # Mix: auto-grade objective locally, LLM only for open-ended
                logger.info(
                    f"OCR smart grading: {len(smart['objective_results'])} objective auto-graded, "
                    f"{len(smart['open_questions_resp'])} open-ended sent to LLM"
                )
                llm_result = await grade_exam_with_fallback(
                    respuestas_estudiante=smart["open_questions_resp"],
                    clave_respuestas=smart["open_questions_key"],
                    provider_config=ai_config,
                )
                # Merge results
                all_preguntas = list(smart["objective_results"])
                for p in llm_result.get("preguntas", []):
                    all_preguntas.append(p)
                all_preguntas.sort(key=lambda x: _question_sort_key(x.get("numero")))

                nota_total = smart["nota_objective"] + llm_result.get("nota_total", 0)
                nota_maxima = smart["nota_maxima_objective"] + llm_result.get("nota_maxima", smart["nota_maxima_open"])

                grading_result = {
                    "nota_total": round(nota_total, 2),
                    "nota_maxima": round(nota_maxima, 2),
                    "preguntas": all_preguntas,
                    "calificacion_automatica": True,
                    "tiene_preguntas_abiertas": False,  # All graded now
                }
            else:
                # Fallback: send everything to LLM (no contenido_json types available)
                logger.info("OCR grading: no question types found, sending all to LLM")
                grading_result = await grade_exam_with_fallback(
                    respuestas_estudiante=ocr_questions,
                    clave_respuestas=effective_key,
                    provider_config=ai_config,
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error en calificación: {str(e)}")

    if has_interactive:
        try:
            vision_result = await grade_interactive_with_vision(
                file_bytes=file_bytes,
                filename=filename,
                content_type=file.content_type,
                exam_tipo=examen.tipo,
                contenido_json=content,
                clave_respuestas=examen.clave_respuestas,
                provider_config=ai_config,
            )
            if vision_result:
                grading_result = _merge_grading_results(grading_result, vision_result)
            elif not needs_ocr:
                raise HTTPException(
                    status_code=500,
                    detail="No fue posible calificar actividades interactivas con vision",
                )
        except HTTPException:
            raise
        except Exception as e:
            if not needs_ocr:
                raise HTTPException(status_code=500, detail=f"Error en calificación por visión: {str(e)}")
            logger.error(f"Vision grading failed: {e}")

    if isinstance(grading_result.get("preguntas"), list):
        grading_result["preguntas"].sort(key=lambda x: _question_sort_key(x.get("numero")) if isinstance(x, dict) else (1, ""))

    # Annotate grading result with OCR quality metadata (medium quality)
    if needs_ocr:
        grading_result["ocr_provider_order"] = ["ollama_vision", "groq_vision"]
        grading_result["ocr_model"] = image_ocr_config.get("ocr_model")
        grading_result["ocr_fallback_model"] = image_ocr_config.get("ocr_fallback_model")
        ocr_q = ocr_result.get("ocr_quality", "alta")
        if ocr_q == "media":
            grading_result["ocr_quality"] = ocr_q
            grading_result["ocr_motivo"] = ocr_result.get("ocr_motivo", "")

    await _upsert_presential_ocr_submission(
        db,
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        captured_by=str(current_user.id),
        filename=filename,
        content_type=file.content_type,
        file_size=len(file_bytes),
        file_url=f"/uploads/{file_id}{ext}",
        ocr_result=ocr_result,
        grading_result=grading_result,
        image_ocr_config=image_ocr_config,
    )

    # Save nota (single row per student+exam)
    nota = await upsert_nota(
        db,
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        nota_val=grading_result.get("nota_total"),
        detalle_json=grading_result,
        retroalimentacion="\n".join(
            f"P{p['numero']}: {p['retroalimentacion']}"
            for p in grading_result.get("preguntas", [])
        ),
        imagen_procesada_url=f"/uploads/{file_id}{ext}",
        texto_extraido=ocr_result["texto_extraido"],
    )
    await db.commit()
    await db.refresh(nota)

    return NotaOut.model_validate(nota)


@router.post("/grade-online/{examen_id}/{estudiante_id}", response_model=NotaOut)
async def grade_online_response(
    examen_id: str,
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Grade an online response that was submitted by a student (LLM-based, for open-ended questions)."""
    from app.models.models import RespuestaOnline
    from app.routers.examenes import auto_grade_objective

    # Get exam and enforce ownership
    examen, materia = await _assert_examen_access(db, examen_id, current_user)
    effective_key = _build_effective_key(examen)
    if not effective_key:
        raise HTTPException(status_code=404, detail="Examen sin clave ni respuestas_correctas configuradas")
    ai_config = await get_profesor_ai_config(
        db,
        str(materia.profesor_id) if getattr(materia, "profesor_id", None) else None,
    )


    await _assert_student_enrolled(db, str(examen.materia_id), estudiante_id)

    # Get student response
    result = await db.execute(
        select(RespuestaOnline).where(
            RespuestaOnline.examen_id == examen_id,
            RespuestaOnline.estudiante_id == estudiante_id,
        )
    )
    respuesta = result.scalar_one_or_none()
    if not respuesta:
        raise HTTPException(status_code=404, detail="Respuesta del estudiante no encontrada")

    # ── Smart Grade: keep interactive/objective grading consistent with /examenes/responder ──
    respuestas_est = respuesta.respuestas_json
    auto_result = auto_grade_objective(examen, respuestas_est)

    if isinstance(respuestas_est, dict) and "preguntas" in respuestas_est:
        resp_list = respuestas_est["preguntas"]
    elif isinstance(respuestas_est, list):
        resp_list = respuestas_est
    else:
        resp_list = [respuestas_est]

    smart = _smart_grade(examen, resp_list, effective_key)

    if auto_result and not auto_result.get("tiene_preguntas_abiertas", False):
        # Fully solved locally (objective + interactive types), no LLM needed.
        logger.info("Online smart grading: all questions auto-graded locally, skipping LLM")
        grading_result = {
            **auto_result,
            "calificacion_automatica": True,
            "tiene_preguntas_abiertas": False,
        }
    elif smart["open_questions_resp"]:
        # Mix: keep local auto-graded details and ask LLM only for pending open-ended items.
        logger.info(
            f"Online smart grading: {len(smart['objective_results'])} objective auto-graded, "
            f"{len(smart['open_questions_resp'])} open-ended sent to LLM"
        )
        llm_result = await grade_exam_with_fallback(
            respuestas_estudiante=smart["open_questions_resp"],
            clave_respuestas=smart["open_questions_key"],
            provider_config=ai_config,
        )
        if auto_result and isinstance(auto_result.get("preguntas"), list):
            base_results = [p for p in auto_result["preguntas"] if not p.get("pendiente")]
        else:
            base_results = list(smart["objective_results"])

        # Merge results
        all_preguntas = list(base_results)
        for p in llm_result.get("preguntas", []):
            all_preguntas.append(p)
        all_preguntas.sort(key=lambda x: _question_sort_key(x.get("numero")))

        nota_base = sum(_safe_float(p.get("nota"), 0.0) for p in base_results)
        nota_maxima_base = sum(_safe_float(p.get("nota_maxima"), 0.0) for p in base_results)
        nota_total = nota_base + _safe_float(llm_result.get("nota_total"), 0.0)

        llm_nota_maxima = _safe_float(llm_result.get("nota_maxima"), 0.0)
        if llm_nota_maxima <= 0:
            llm_nota_maxima = sum(_safe_float(k.get("puntos"), 0.0) for k in smart["open_questions_key"])
        nota_maxima = nota_maxima_base + llm_nota_maxima

        grading_result = {
            "nota_total": round(nota_total, 2),
            "nota_maxima": round(nota_maxima, 2),
            "preguntas": all_preguntas,
            "calificacion_automatica": True,
            "tiene_preguntas_abiertas": False,
        }
    elif auto_result:
        # If open-ended split failed, keep deterministic local result instead of losing progress.
        grading_result = {
            **auto_result,
            "calificacion_automatica": True,
            "tiene_preguntas_abiertas": auto_result.get("tiene_preguntas_abiertas", False),
        }
    else:
        # Fallback: send everything to LLM
        logger.info("Online grading: no question types found, sending all to LLM")
        grading_result = await grade_exam_with_fallback(
            respuestas_estudiante=resp_list,
            clave_respuestas=effective_key,
            provider_config=ai_config,
        )

    nota = await upsert_nota(
        db,
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        nota_val=grading_result.get("nota_total"),
        detalle_json=grading_result,
        retroalimentacion="\n".join(
            f"P{p['numero']}: {p['retroalimentacion']}"
            for p in grading_result.get("preguntas", [])
        ),
    )
    await db.commit()
    await db.refresh(nota)

    return NotaOut.model_validate(nota)

import base64
import io
import json
import os
import re
import uuid
import logging
from datetime import datetime, timezone
import fitz  # PyMuPDF
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, get_db
from app.core.dependencies import require_role, get_client_ip
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.config import get_settings, normalize_ollama_native_url
from app.models.models import User, Examen, Materia, Matricula, RespuestaOnline, OcrGradingJob, AuditLog
from app.services.nota_service import upsert_nota
from app.services.ocr_service import (
    DEFAULT_GROQ_OCR_MODEL,
    DEFAULT_OLLAMA_OCR_MODEL,
)
from app.services.groq_service import grade_exam_with_fallback
from app.services.vision_grading_service import grade_interactive_with_vision, grade_written_exam_with_vision
from app.services.open_code_service import open_code_chat_completion, _message_text
from app.schemas.schemas import NotaOut

router = APIRouter(prefix="/grading", tags=["Calificación Automática"])
settings = get_settings()
logger = logging.getLogger(__name__)

ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}


class OcrGradingJobOut(BaseModel):
    id: uuid.UUID
    examen_id: uuid.UUID
    estudiante_id: uuid.UUID
    estudiante_nombre: str | None = None
    estado: str
    filename: str
    content_type: str | None = None
    file_url: str | None = None
    file_size: int
    error_message: str | None = None
    result_json: dict | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    updated_at: datetime | None = None


async def _serialize_ocr_job(db: AsyncSession, job: OcrGradingJob) -> OcrGradingJobOut:
    estudiante_nombre = None
    student_result = await db.execute(select(User).where(User.id == job.estudiante_id))
    student = student_result.scalar_one_or_none()
    if student:
        estudiante_nombre = " ".join(
            part for part in [student.nombre, student.apellido] if part
        ).strip() or student.documento

    return OcrGradingJobOut(
        id=job.id,
        examen_id=job.examen_id,
        estudiante_id=job.estudiante_id,
        estudiante_nombre=estudiante_nombre,
        estado=job.estado,
        filename=job.filename,
        content_type=job.content_type,
        file_url=job.file_url,
        file_size=job.file_size,
        error_message=job.error_message,
        result_json=job.result_json,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        updated_at=job.updated_at,
    )


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
    configured_open_code_base_url = str(cfg.get("open_code_base_url") or "").strip()
    configured_open_code_api_key = str(cfg.get("open_code_api_key") or "").strip()
    configured_open_code_vision_model = str(cfg.get("open_code_vision_model") or "").strip()

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

    profesor_open_code_model = ""
    if configured_provider == "open_code_vision":
        profesor_open_code_model = configured_model
    elif configured_fallback == "open_code_vision":
        profesor_open_code_model = configured_fallback_model

    # 1) Ollama OCR model: use whatever the profesor/global configured.
    explicit_cloud_model = (os.getenv("OLLAMA_CLOUD_OCR_MODEL") or "").strip()
    explicit_cloud_url = (os.getenv("OLLAMA_CLOUD_URL") or "").strip()
    explicit_cloud_key = (os.getenv("OLLAMA_CLOUD_API_KEY") or "").strip()

    ocr_model = (
        profesor_ollama_model
        or explicit_cloud_model
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
    configured_cloud_url = str(cfg.get("ollama_cloud_url") or "").strip()
    is_cloud_model = (
        ":cloud" in ocr_model.lower()
        or ocr_model.lower().startswith("qwen")
        or ocr_model.lower().startswith("deepseek")
    )

    if configured_url and configured_url != "http://host.docker.internal:11434":
        ollama_url = configured_url
    elif is_cloud_model and configured_cloud_url:
        ollama_url = configured_cloud_url
    elif is_cloud_model and explicit_cloud_url:
        ollama_url = explicit_cloud_url
    elif env_local_url:
        ollama_url = env_local_url
    else:
        ollama_url = "https://ollama.com" if is_cloud_model else "http://host.docker.internal:11434"

    # 4) Ollama API key — explicit DB value wins; then Cloud env; then local env.
    configured_key = str(cfg.get("ollama_api_key") or "").strip()
    configured_cloud_key = str(cfg.get("ollama_cloud_api_key") or "").strip()
    env_local_key = str(settings.OLLAMA_API_KEY or "").strip()
    using_cloud_endpoint = "ollama.com" in ollama_url.lower()

    if using_cloud_endpoint or is_cloud_model:
        ollama_api_key = configured_cloud_key or explicit_cloud_key or configured_key or env_local_key
    else:
        ollama_api_key = configured_key or env_local_key

    open_code_base_url = configured_open_code_base_url or str(settings.OPEN_CODE_BASE_URL or "").strip()
    open_code_api_key = configured_open_code_api_key or str(settings.OPEN_CODE_API_KEY or "").strip()
    open_code_model = (
        profesor_open_code_model
        or configured_open_code_vision_model
        or str(settings.OPEN_CODE_VISION_MODEL or "").strip()
        or "Qwen3.7 Max"
    )

    open_code_ready = bool(open_code_base_url and open_code_api_key)
    use_open_code_primary = (
        (configured_provider == "open_code_vision" and open_code_ready)
        or (not configured_provider and open_code_ready)
    )

    fallback_provider = configured_fallback if configured_fallback in {"ollama_vision", "groq_vision"} else "groq_vision"
    fallback_primary_model = ocr_model if fallback_provider == "ollama_vision" else fallback_model
    fallback_secondary_provider = "groq_vision" if fallback_provider == "ollama_vision" else "ollama_vision"
    fallback_secondary_model = fallback_model if fallback_secondary_provider == "groq_vision" else ocr_model

    cfg.update({
        "ocr_provider": "open_code_vision" if use_open_code_primary else fallback_provider,
        "ocr_model": open_code_model if use_open_code_primary else fallback_primary_model,
        "ocr_fallback_provider": "ollama_vision" if use_open_code_primary else fallback_secondary_provider,
        "ocr_fallback_model": ocr_model if use_open_code_primary else fallback_secondary_model,
        "ollama_url": normalize_ollama_native_url(ollama_url),
        "ollama_api_key": ollama_api_key,
        "open_code_base_url": open_code_base_url,
        "open_code_api_key": open_code_api_key,
        "open_code_vision_model": open_code_model,
        "open_code_ready": open_code_ready,
    })
    return cfg


def _parse_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} invalido")


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
    provider_order = [
        p
        for p in [
            image_ocr_config.get("ocr_provider"),
            image_ocr_config.get("ocr_fallback_provider"),
        ]
        if p
    ]
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
            "provider_order": provider_order,
            "model": image_ocr_config.get("ocr_model"),
            "fallback_model": image_ocr_config.get("ocr_fallback_model"),
            "quality": ocr_result.get("ocr_quality"),
            "motivo": ocr_result.get("ocr_motivo"),
            "tipo_escritura": ocr_result.get("tipo_escritura"),
            "texto_extraido": ocr_result.get("texto_extraido") or "",
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


def _canonical_objective_answer(value: str, tipo: str) -> str:
    """Extract a stable answer from noisy OCR text for objective questions."""
    text = _normalize(str(value or ""))
    if not text:
        return ""

    if tipo == "seleccion_multiple":
        import re
        match = re.search(r"\b([a-h])\b", text)
        if match:
            return match.group(1)
        return text[:1]

    if tipo == "verdadero_falso":
        import re
        if re.search(r"\b(verdadero|true|v)\b", text):
            return "verdadero"
        if re.search(r"\b(falso|false|f)\b", text):
            return "falso"

    return text


AUTO_GRADABLE_TYPES = {"seleccion_multiple", "verdadero_falso"}
INTERACTIVE_TYPES = {"sopa_letras", "crucigrama", "emparejar", "unir_columnas"}


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


def _question_lookup_key(value) -> str:
    text = str(value or "").strip()
    return str(int(text)) if text.isdigit() else text.lower()


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
        preguntas_map[_question_lookup_key(num)] = p

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
        lookup_key = _question_lookup_key(num)
        meta = preguntas_map.get(lookup_key, {})
        opciones = c.get("opciones") if c.get("opciones") is not None else meta.get("opciones", [])
        if not isinstance(opciones, list):
            opciones = []

        merged[lookup_key] = {
            "numero": num,
            "respuesta_correcta": c.get("respuesta_correcta") or meta.get("respuesta_correcta") or "",
            "puntos": _safe_float(c.get("puntos", meta.get("puntos", 1.0)), 1.0),
            "tipo": c.get("tipo") or meta.get("tipo") or "",
            "enunciado": c.get("enunciado") or meta.get("enunciado") or meta.get("pregunta") or "",
            "opciones": opciones,
        }

    for lookup_key, meta in preguntas_map.items():
        if lookup_key in merged:
            continue
        num = meta.get("numero")
        opciones = meta.get("opciones", [])
        if not isinstance(opciones, list):
            opciones = []

        merged[lookup_key] = {
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
            resp_map[_question_lookup_key(r.get("numero"))] = r.get("respuesta", "")

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
        respuesta_est = str(resp_map.get(_question_lookup_key(num), ""))

        if tipo in AUTO_GRADABLE_TYPES and _normalize(respuesta_correcta):
            correcto = (
                _canonical_objective_answer(respuesta_correcta, tipo)
                == _canonical_objective_answer(respuesta_est, tipo)
            )
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




async def _process_saved_exam_upload(
    db: AsyncSession,
    *,
    examen: Examen,
    materia: Materia,
    estudiante_id: str,
    captured_by: str,
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    file_size: int,
    file_url: str,
) -> NotaOut:
    content = examen.contenido_json if isinstance(examen.contenido_json, dict) else {}
    has_interactive = _has_interactive_content(examen)
    effective_key = _build_effective_key(examen)
    if not effective_key and not has_interactive:
        raise HTTPException(
            status_code=400,
            detail="El examen no tiene clave de respuestas ni respuestas_correctas en contenido_json",
        )

    await _assert_student_enrolled(db, str(examen.materia_id), estudiante_id)

    ai_config = await get_profesor_ai_config(
        db,
        str(materia.profesor_id) if getattr(materia, "profesor_id", None) else None,
    )
    image_ocr_config = _build_image_ocr_config(ai_config)

    grading_result = {
        "nota_total": 0.0,
        "nota_maxima": 0.0,
        "preguntas": [],
        "calificacion_automatica": True,
        "tiene_preguntas_abiertas": False,
    }
    needs_ocr = isinstance(content.get("preguntas"), list) and len(content.get("preguntas")) > 0

    if needs_ocr:
        try:
            clave_map = {str(c.get("numero")): c for c in (effective_key or []) if isinstance(c, dict)}
            meta_map = {str(p.get("numero")): p for p in content.get("preguntas", []) if isinstance(p, dict)}
            preguntas_con_clave = [
                {
                    "numero": num,
                    "tipo": (clave_map.get(num) or {}).get("tipo") or (meta_map.get(num) or {}).get("tipo") or "",
                    "enunciado": (clave_map.get(num) or {}).get("enunciado") or (meta_map.get(num) or {}).get("enunciado") or "",
                    "opciones": (meta_map.get(num) or {}).get("opciones") or [],
                    "respuesta_correcta": str((clave_map.get(num) or {}).get("respuesta_correcta") or ""),
                    "puntos": float((clave_map.get(num) or {}).get("puntos") or (meta_map.get(num) or {}).get("puntos") or 1.0),
                }
                for num in dict.fromkeys(list(clave_map) + list(meta_map))
            ]
            grading_result = await grade_written_exam_with_vision(
                file_bytes=file_bytes,
                filename=filename,
                content_type=content_type,
                preguntas_con_clave=preguntas_con_clave,
                provider_config=image_ocr_config,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error en calificacion: {str(e)}")

    if has_interactive:
        try:
            vision_result = await grade_interactive_with_vision(
                file_bytes=file_bytes,
                filename=filename,
                content_type=content_type,
                exam_tipo=examen.tipo,
                contenido_json=content,
                clave_respuestas=examen.clave_respuestas,
                provider_config=image_ocr_config,
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
                raise HTTPException(status_code=500, detail=f"Error en calificacion por vision: {str(e)}")
            logger.error("Vision grading failed: %s", e)

    if isinstance(grading_result.get("preguntas"), list):
        grading_result["preguntas"].sort(
            key=lambda x: _question_sort_key(x.get("numero")) if isinstance(x, dict) else (1, "")
        )

    if needs_ocr:
        grading_result["ocr_provider_order"] = [
            image_ocr_config.get("ocr_provider"),
            image_ocr_config.get("ocr_fallback_provider"),
        ]
        grading_result["ocr_model"] = image_ocr_config.get("ocr_model")
        grading_result["ocr_fallback_model"] = image_ocr_config.get("ocr_fallback_model")

    await _upsert_presential_ocr_submission(
        db,
        estudiante_id=estudiante_id,
        examen_id=str(examen.id),
        captured_by=captured_by,
        filename=filename,
        content_type=content_type,
        file_size=file_size,
        file_url=file_url,
        ocr_result={},
        grading_result=grading_result,
        image_ocr_config=image_ocr_config,
    )

    nota = await upsert_nota(
        db,
        estudiante_id=estudiante_id,
        examen_id=str(examen.id),
        nota_val=grading_result.get("nota_total"),
        detalle_json=grading_result,
        retroalimentacion="\n".join(
            f"P{p['numero']}: {p['retroalimentacion']}"
            for p in grading_result.get("preguntas", [])
        ),
        imagen_procesada_url=file_url,
        texto_extraido="",
    )
    await db.commit()
    await db.refresh(nota)
    return NotaOut.model_validate(nota)


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

    return await _process_saved_exam_upload(
        db,
        examen=examen,
        materia=materia,
        estudiante_id=estudiante_id,
        captured_by=str(current_user.id),
        file_bytes=file_bytes,
        filename=filename,
        content_type=file.content_type,
        file_size=len(file_bytes),
        file_url=f"/uploads/{file_id}{ext}",
    )


# ─────────────────────────────────────────────────
#  MANUAL GRADE — profesor ingresa nota directamente
# ─────────────────────────────────────────────────

class ManualGradeRequest(BaseModel):
    examen_id: str
    estudiante_id: str
    nota: float
    retroalimentacion: str = ""


@router.post("/manual", response_model=NotaOut)
async def manual_grade(
    body: ManualGradeRequest,
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Ingresa o sobreescribe una nota manualmente sin OCR ni IA."""
    if body.nota < 0 or body.nota > 10:
        raise HTTPException(status_code=400, detail="La nota debe estar entre 0 y 10")

    examen, materia = await _assert_examen_access(db, body.examen_id, current_user)
    await _assert_student_enrolled(db, str(examen.materia_id), body.estudiante_id)

    nota_val = round(body.nota, 2)
    examen_json = examen.contenido_json or {}
    nota_maxima_val = float(examen_json.get("nota_maxima") or 0) or 5.0
    nota = await upsert_nota(
        db,
        estudiante_id=body.estudiante_id,
        examen_id=body.examen_id,
        nota_val=nota_val,
        detalle_json={
            "calificacion_manual": True,
            "nota_total": nota_val,
            "nota_maxima": nota_maxima_val,
            "ingresado_por": str(current_user.id),
        },
        retroalimentacion=body.retroalimentacion.strip() or None,
    )
    await db.commit()
    await db.refresh(nota)
    return NotaOut.model_validate(nota)


# ─────────────────────────────────────────────────
#  FREE GRADE — califica tarea/trabajo libre con IA
# ─────────────────────────────────────────────────

async def _extract_text_from_file(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    image_ocr_config: dict,
) -> str:
    """OCR/extract text from any file (image or PDF)."""
    from app.services.open_code_service import open_code_vision_json
    from app.services.ocr_service import normalize_image_to_png

    is_pdf = (content_type == "application/pdf") or filename.lower().endswith(".pdf")

    if is_pdf:
        doc = fitz.open(stream=io.BytesIO(file_bytes), filetype="pdf")
        try:
            pages = [page.get_text("text") for page in doc]
        finally:
            doc.close()
        return "\n\n".join(pages).strip()

    # Image — use vision
    base_url = image_ocr_config.get("open_code_base_url") or ""
    api_key = image_ocr_config.get("open_code_api_key") or ""
    model = image_ocr_config.get("open_code_vision_model") or image_ocr_config.get("ocr_model") or ""

    if not base_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Para calificar imágenes configura Open Code (Base URL + API Key) en tu perfil.",
        )

    try:
        png = normalize_image_to_png(file_bytes)
        b64 = base64.b64encode(png).decode("utf-8")
        result = await open_code_vision_json(
            image_payloads=[b64],
            prompt='Extrae TODO el texto visible tal como está escrito. Devuelve JSON: {"text": "todo el texto aquí"}.',
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.0,
            max_tokens=2000,
        )
        return str(result.get("text", "")).strip()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error extrayendo texto de imagen: {exc}") from exc


@router.post("/free-grade", response_model=NotaOut)
async def free_grade_task(
    criterios: str | None = Form(None),
    estudiante_id: str = Form(...),
    materia_id: str = Form(...),
    titulo: str = Form(default="Tarea"),
    nota_maxima: float = Form(default=5.0),
    examen_id: str | None = Form(default=None),
    file: UploadFile = File(...),
    request: Request = None,
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Califica un trabajo libre con criterios manuales o usando una actividad registrada.
    Si se envia examen_id, reutiliza titulo, criterios y nota maxima de esa actividad.
    """
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 10MB)")
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido (JPG, PNG, PDF)")

    examen = None
    criterios_clean = (criterios or "").strip()
    nota_maxima_val = float(nota_maxima or 5.0)

    if examen_id:
        examen_result = await db.execute(select(Examen).where(Examen.id == examen_id))
        examen = examen_result.scalar_one_or_none()
        if not examen:
            raise HTTPException(status_code=404, detail="Actividad no encontrada")
        materia_id = str(examen.materia_id)
        examen_data = examen.contenido_json or {}
        clave_data = examen.clave_respuestas or {}
        criterios_clean = str(examen_data.get("criterios") or clave_data.get("criterios") or "").strip()
        if not criterios_clean:
            preguntas = examen_data.get("preguntas") if isinstance(examen_data, dict) else []
            claves = clave_data.get("preguntas") if isinstance(clave_data, dict) else []
            clave_por_numero = {
                str(item.get("numero")): item
                for item in (claves or [])
                if isinstance(item, dict) and item.get("numero") is not None
            }
            lineas = []
            for pregunta in (preguntas or [])[:20]:
                if not isinstance(pregunta, dict):
                    continue
                numero = str(pregunta.get("numero") or len(lineas) + 1)
                clave = clave_por_numero.get(numero, {})
                lineas.append(
                    f"Pregunta {numero}: {pregunta.get('enunciado') or pregunta.get('pregunta') or 'Sin enunciado'}. "
                    f"Respuesta esperada: {clave.get('respuesta_correcta') or clave.get('respuesta') or 'Revisar con criterio docente'}. "
                    f"Puntos: {clave.get('puntos') or pregunta.get('puntos') or 1}."
                )
            if lineas:
                criterios_clean = "Califica segun la clave del examen generado:\n" + "\n".join(lineas)
        nota_maxima_val = float(
            examen_data.get("nota_maxima")
            or clave_data.get("nota_maxima")
            or nota_maxima
            or 5.0
        )
        titulo_clean = examen.titulo.strip()[:250] or "Tarea"
    else:
        titulo_clean = titulo.strip()[:250] or "Tarea"

    if nota_maxima_val <= 0 or nota_maxima_val > 10:
        raise HTTPException(status_code=400, detail="nota_maxima debe estar entre 0.1 y 10")
    if not criterios_clean:
        raise HTTPException(status_code=422, detail="Los criterios de calificacion no pueden estar vacios")

    materia_result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso sobre esta materia")

    await _assert_student_enrolled(db, materia_id, estudiante_id)

    if examen is None:
        tarea_result = await db.execute(
            select(Examen).where(
                Examen.materia_id == materia_id,
                Examen.tipo == "tarea",
                Examen.titulo == titulo_clean,
            ).limit(1)
        )
        examen = tarea_result.scalar_one_or_none()

    if examen is None:
        examen = Examen(
            materia_id=materia_id,
            titulo=titulo_clean,
            tipo="tarea",
            contenido_json={"criterios": criterios_clean, "nota_maxima": nota_maxima_val},
        )
        db.add(examen)
        await db.flush()

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")

    filename = file.filename or "tarea"
    ext = os.path.splitext(filename)[1].lower()
    file_id = str(uuid.uuid4())
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as fh:
        fh.write(file_bytes)
    file_url = f"/uploads/{file_id}{ext}"

    ai_config = await get_profesor_ai_config(
        db, str(materia.profesor_id) if materia.profesor_id else None
    )
    image_ocr_config = _build_image_ocr_config(ai_config)
    texto_extraido = await _extract_text_from_file(
        file_bytes, filename, file.content_type, image_ocr_config
    )

    if not texto_extraido:
        raise HTTPException(
            status_code=422,
            detail="No se pudo extraer texto del archivo. Verifica que sea legible.",
        )

    MAX_TEXT = 4000
    if len(texto_extraido) > MAX_TEXT:
        texto_extraido = texto_extraido[:MAX_TEXT] + "\n... [truncado]"

    content_base_url = ai_config.get("content_base_url") or image_ocr_config.get("open_code_base_url") or ""
    content_api_key = ai_config.get("content_api_key") or image_ocr_config.get("open_code_api_key") or ""
    content_model = ai_config.get("content_model") or image_ocr_config.get("open_code_vision_model") or ""

    if not content_base_url or not content_api_key:
        raise HTTPException(
            status_code=400,
            detail="Configura Open Code (Base URL + API Key) en tu perfil para usar la calificacion con IA.",
        )

    system_msg = (
        "Eres un evaluador educativo para docentes colombianos de educacion basica y media. "
        "Califica el trabajo del estudiante segun los criterios del docente. "
        "Se justo, claro y pedagogico en la retroalimentacion. "
        "Responde UNICAMENTE con JSON valido, sin texto adicional ni bloques de codigo."
    )
    user_msg = (
        f"CRITERIOS DE CALIFICACION (definidos por el docente):\n{criterios_clean}\n\n"
        f"TRABAJO DEL ESTUDIANTE (extraido por OCR):\n{texto_extraido}\n\n"
        f"Califica este trabajo con una nota de 0 a {nota_maxima_val:.1f}. "
        f"Responde SOLO con este JSON:\n"
        f'{{"nota": <numero decimal entre 0 y {nota_maxima_val:.1f}>, '
        f'"retroalimentacion": "<retroalimentacion detallada de 2-4 oraciones>", '
        f'"aspectos_positivos": "<que hizo bien el estudiante>", '
        f'"aspectos_mejorar": "<que debe mejorar>"}}'
    )

    try:
        raw = await open_code_chat_completion(
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            model=content_model,
            base_url=content_base_url,
            api_key=content_api_key,
            temperature=0.2,
            max_tokens=800,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error conectando con la IA: {exc}") from exc

    response_text = _message_text(raw).strip()
    grading_data: dict = {}
    try:
        json_match = re.search(r"\{[\s\S]*\}", response_text)
        if json_match:
            grading_data = json.loads(json_match.group(0))
    except Exception:
        grading_data = {}

    nota_val = float(grading_data.get("nota", 0.0))
    nota_val = round(max(0.0, min(nota_maxima_val, nota_val)), 2)
    retroalimentacion = str(grading_data.get("retroalimentacion", "")).strip() or response_text

    detalle_json = {
        "tipo": "tarea_libre",
        "examen_id": str(examen.id),
        "actividad_titulo": titulo_clean,
        "nota_total": nota_val,
        "nota_maxima": nota_maxima_val,
        "criterios": criterios_clean,
        "plantilla_reutilizada": bool(examen_id),
        "aspectos_positivos": str(grading_data.get("aspectos_positivos", "")),
        "aspectos_mejorar": str(grading_data.get("aspectos_mejorar", "")),
        "calificacion_automatica": True,
        "texto_extraido_preview": texto_extraido[:500],
    }

    nota = await upsert_nota(
        db,
        estudiante_id=estudiante_id,
        examen_id=str(examen.id),
        nota_val=nota_val,
        detalle_json=detalle_json,
        retroalimentacion=retroalimentacion,
        imagen_procesada_url=file_url,
        texto_extraido=texto_extraido,
    )
    db.add(AuditLog(
        user_id=current_user.id,
        accion="free_grade_registered_task" if examen_id else "free_grade_manual_task",
        detalle={
            "materia_id": materia_id,
            "estudiante_id": estudiante_id,
            "examen_id": str(examen.id),
            "titulo": titulo_clean,
        },
        ip=get_client_ip(request) if request else None,
    ))
    await db.commit()
    await db.refresh(nota)
    return NotaOut.model_validate(nota)


# ----------------------------------------------------------------------------------------------------------------
# OCR GRADING JOB (background queue)
# ----------------------------------------------------------------------------------------------------------------

# NOTE: dead code from the synchronous /upload endpoint was removed here.
# All OCR grading goes through _process_saved_exam_upload (called by /upload
# and by the background job runner below).





async def _run_ocr_grading_job(job_id: str) -> None:
    async with AsyncSessionLocal() as db:
        job_uuid = _parse_uuid(job_id, "job_id")
        job_result = await db.execute(select(OcrGradingJob).where(OcrGradingJob.id == job_uuid))
        job = job_result.scalar_one_or_none()
        if not job:
            return

        job.estado = "processing"
        job.error_message = None
        job.started_at = datetime.now(timezone.utc)
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()

        try:
            examen_result = await db.execute(select(Examen).where(Examen.id == job.examen_id))
            examen = examen_result.scalar_one_or_none()
            materia_result = await db.execute(select(Materia).where(Materia.id == job.materia_id))
            materia = materia_result.scalar_one_or_none()
            if not examen or not materia:
                raise HTTPException(status_code=404, detail="Examen o materia no encontrada")

            stored_name = os.path.basename(job.file_url or "")
            save_path = os.path.join(settings.UPLOAD_DIR, stored_name)
            if not stored_name or not os.path.exists(save_path):
                raise HTTPException(status_code=404, detail="Archivo original del OCR no encontrado")

            with open(save_path, "rb") as fh:
                file_bytes = fh.read()

            nota_out = await _process_saved_exam_upload(
                db,
                examen=examen,
                materia=materia,
                estudiante_id=str(job.estudiante_id),
                captured_by=str(job.profesor_id) if job.profesor_id else "",
                file_bytes=file_bytes,
                filename=job.filename,
                content_type=job.content_type,
                file_size=job.file_size,
                file_url=job.file_url,
            )

            job.estado = "success"
            job.result_json = {"nota": nota_out.model_dump(mode="json")}
            job.finished_at = datetime.now(timezone.utc)
            job.updated_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            job_result = await db.execute(select(OcrGradingJob).where(OcrGradingJob.id == job_uuid))
            job = job_result.scalar_one_or_none()
            if not job:
                return
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            job.estado = "error"
            job.error_message = str(detail)[:2000]
            job.finished_at = datetime.now(timezone.utc)
            job.updated_at = datetime.now(timezone.utc)
            await db.commit()
            logger.exception("OCR grading job %s failed", job_id)


@router.post("/upload-job", response_model=OcrGradingJobOut)
async def create_ocr_grading_job(
    background_tasks: BackgroundTasks,
    examen_id: str = Form(...),
    estudiante_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Queue an OCR grading job and return immediately so the teacher can continue capturing exams."""
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 10MB)")
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido")

    examen, materia = await _assert_examen_access(db, examen_id, current_user)
    has_interactive = _has_interactive_content(examen)
    effective_key = _build_effective_key(examen)
    if not effective_key and not has_interactive:
        raise HTTPException(
            status_code=400,
            detail="El examen no tiene clave de respuestas ni respuestas_correctas en contenido_json",
        )
    await _assert_student_enrolled(db, str(examen.materia_id), estudiante_id)

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 10MB)")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacio")

    filename = file.filename or "upload.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Extension de archivo no permitida")

    file_id = str(uuid.uuid4())
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as fh:
        fh.write(file_bytes)

    job = OcrGradingJob(
        examen_id=examen.id,
        estudiante_id=estudiante_id,
        profesor_id=current_user.id,
        materia_id=materia.id,
        estado="queued",
        filename=filename,
        content_type=file.content_type,
        file_url=f"/uploads/{file_id}{ext}",
        file_size=len(file_bytes),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_run_ocr_grading_job, str(job.id))
    return await _serialize_ocr_job(db, job)


@router.post("/mi-examen-foto", response_model=OcrGradingJobOut)
async def estudiante_upload_examen_fisico(
    background_tasks: BackgroundTasks,
    examen_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """El estudiante sube la foto de su examen físico para calificación automática."""
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 10MB)")
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido")

    examen_uuid = _parse_uuid(examen_id, "examen_id")
    examen_result = await db.execute(select(Examen).where(Examen.id == examen_uuid))
    examen = examen_result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    if not getattr(examen, "activo_fisico", False):
        raise HTTPException(status_code=400, detail="Este examen no permite entrega de foto")

    materia_result = await db.execute(select(Materia).where(Materia.id == examen.materia_id))
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    has_interactive = _has_interactive_content(examen)
    effective_key = _build_effective_key(examen)
    if not effective_key and not has_interactive:
        raise HTTPException(
            status_code=400,
            detail="El examen no tiene clave de respuestas configurada",
        )
    await _assert_student_enrolled(db, str(examen.materia_id), str(current_user.id))

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Archivo muy grande (max 10MB)")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    filename = file.filename or "examen.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Extensión de archivo no permitida")

    file_id = str(uuid.uuid4())
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as fh:
        fh.write(file_bytes)

    job = OcrGradingJob(
        examen_id=examen.id,
        estudiante_id=current_user.id,
        profesor_id=None,
        materia_id=materia.id,
        estado="queued",
        filename=filename,
        content_type=file.content_type,
        file_url=f"/uploads/{file_id}{ext}",
        file_size=len(file_bytes),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_run_ocr_grading_job, str(job.id))
    return await _serialize_ocr_job(db, job)


@router.get("/mi-examen-foto/estado/{examen_id}", response_model=OcrGradingJobOut | None)
async def estudiante_get_estado_foto(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """El estudiante consulta el estado de su entrega de foto para un examen."""
    examen_uuid = _parse_uuid(examen_id, "examen_id")
    result = await db.execute(
        select(OcrGradingJob)
        .where(
            OcrGradingJob.examen_id == examen_uuid,
            OcrGradingJob.estudiante_id == current_user.id,
        )
        .order_by(OcrGradingJob.created_at.desc())
        .limit(1)
    )
    job = result.scalar_one_or_none()
    if not job:
        return None
    return await _serialize_ocr_job(db, job)


@router.get("/jobs/{examen_id}", response_model=list[OcrGradingJobOut])
async def list_ocr_grading_jobs(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    examen_uuid = _parse_uuid(examen_id, "examen_id")
    await _assert_examen_access(db, examen_id, current_user)
    result = await db.execute(
        select(OcrGradingJob)
        .where(OcrGradingJob.examen_id == examen_uuid)
        .order_by(OcrGradingJob.created_at.desc())
        .limit(50)
    )
    jobs = result.scalars().all()
    return [await _serialize_ocr_job(db, job) for job in jobs]


@router.get("/jobs/item/{job_id}", response_model=OcrGradingJobOut)
async def get_ocr_grading_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    job_uuid = _parse_uuid(job_id, "job_id")
    result = await db.execute(select(OcrGradingJob).where(OcrGradingJob.id == job_uuid))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo OCR no encontrado")
    await _assert_examen_access(db, str(job.examen_id), current_user)
    return await _serialize_ocr_job(db, job)


@router.post("/jobs/{job_id}/retry", response_model=OcrGradingJobOut)
async def retry_ocr_grading_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    job_uuid = _parse_uuid(job_id, "job_id")
    result = await db.execute(select(OcrGradingJob).where(OcrGradingJob.id == job_uuid))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Trabajo OCR no encontrado")
    await _assert_examen_access(db, str(job.examen_id), current_user)
    if job.estado == "success":
        raise HTTPException(status_code=400, detail="El trabajo ya fue calificado")

    job.estado = "queued"
    job.error_message = None
    job.started_at = None
    job.finished_at = None
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(_run_ocr_grading_job, str(job.id))
    return await _serialize_ocr_job(db, job)


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

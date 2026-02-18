import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.config import get_settings
from app.models.models import User, Examen, Nota
from app.services.ocr_service import process_exam_image
from app.services.groq_service import grade_exam
from app.schemas.schemas import NotaOut

router = APIRouter(prefix="/grading", tags=["Calificación Automática"])
settings = get_settings()
logger = logging.getLogger(__name__)

# ──────── SMART GRADING HELPERS ────────

def _normalize(s: str) -> str:
    """Normalize a string for comparison."""
    if not s:
        return ""
    return s.strip().lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")


AUTO_GRADABLE_TYPES = {"seleccion_multiple", "verdadero_falso"}


def _smart_grade(examen: Examen, resp_list: list[dict]) -> dict:
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
    clave_raw = examen.clave_respuestas or {}
    contenido = examen.contenido_json or {}

    if isinstance(clave_raw, dict) and "preguntas" in clave_raw:
        clave_list = clave_raw["preguntas"]
    elif isinstance(clave_raw, list):
        clave_list = clave_raw
    else:
        clave_list = []

    # Build lookup for question types from contenido_json
    preguntas_info = {}
    for p in contenido.get("preguntas", []):
        preguntas_info[p.get("numero")] = p.get("tipo", "")

    # Build lookup for student responses
    resp_map = {}
    for r in resp_list:
        if isinstance(r, dict):
            resp_map[r.get("numero")] = r.get("respuesta", "")

    # Build lookup for answer key
    clave_map = {}
    for c in clave_list:
        if isinstance(c, dict):
            clave_map[c.get("numero")] = c

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
        puntos = float(c.get("puntos", 1.0))
        respuesta_correcta = str(c.get("respuesta_correcta", ""))
        tipo = preguntas_info.get(num, "")
        respuesta_est = str(resp_map.get(num, ""))

        if tipo in AUTO_GRADABLE_TYPES:
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
            })
            open_questions_key.append(c)

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

    allowed_types = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido")

    # Get exam with answer key
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    if not examen.clave_respuestas:
        raise HTTPException(status_code=400, detail="El examen no tiene clave de respuestas")

    # Read file
    file_bytes = await file.read()
    filename = file.filename or "upload.png"

    # Save original file
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1]
    save_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    # OCR Pipeline
    try:
        ocr_result = await process_exam_image(file_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en OCR: {str(e)}")

    # ── Smart Grading: auto-grade objective, LLM only for open-ended ──
    try:
        clave = examen.clave_respuestas
        if isinstance(clave, dict) and "preguntas" in clave:
            clave_list = clave["preguntas"]
        elif isinstance(clave, list):
            clave_list = clave
        else:
            clave_list = [clave]

        ocr_questions = ocr_result.get("preguntas", [])

        # Try smart grading if we have contenido_json with question types
        smart = _smart_grade(examen, ocr_questions)

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
            llm_result = await grade_exam(
                respuestas_estudiante=smart["open_questions_resp"],
                clave_respuestas=smart["open_questions_key"],
            )
            # Merge results
            all_preguntas = list(smart["objective_results"])
            for p in llm_result.get("preguntas", []):
                all_preguntas.append(p)
            all_preguntas.sort(key=lambda x: x.get("numero", 0))

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
            grading_result = await grade_exam(
                respuestas_estudiante=ocr_questions,
                clave_respuestas=clave_list,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en calificación: {str(e)}")

    # Save nota
    nota = Nota(
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        nota=grading_result.get("nota_total"),
        detalle_json=grading_result,
        retroalimentacion="\n".join(
            f"P{p['numero']}: {p['retroalimentacion']}"
            for p in grading_result.get("preguntas", [])
        ),
        imagen_procesada_url=f"/uploads/{file_id}{ext}",
        texto_extraido=ocr_result["texto_extraido"],
    )
    db.add(nota)
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

    # Check for existing Nota — delete it to re-grade
    existing_nota = await db.execute(
        select(Nota).where(
            Nota.examen_id == examen_id,
            Nota.estudiante_id == estudiante_id,
        )
    )
    old_nota = existing_nota.scalar_one_or_none()
    if old_nota:
        await db.delete(old_nota)
        await db.flush()

    # Get exam
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or not examen.clave_respuestas:
        raise HTTPException(status_code=404, detail="Examen o clave no encontrada")

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

    # ── Smart Grade: auto-grade objective, LLM only for open-ended ──
    clave = examen.clave_respuestas
    respuestas_est = respuesta.respuestas_json

    if isinstance(respuestas_est, dict) and "preguntas" in respuestas_est:
        resp_list = respuestas_est["preguntas"]
    elif isinstance(respuestas_est, list):
        resp_list = respuestas_est
    else:
        resp_list = [respuestas_est]

    smart = _smart_grade(examen, resp_list)

    if smart["all_objective"]:
        # All objective — no LLM needed!
        logger.info(f"Online smart grading: all {len(smart['objective_results'])} questions are objective, skipping LLM")
        grading_result = {
            "nota_total": smart["nota_objective"],
            "nota_maxima": smart["nota_maxima_objective"],
            "preguntas": smart["objective_results"],
            "calificacion_automatica": True,
            "tiene_preguntas_abiertas": False,
        }
    elif smart["open_questions_resp"]:
        # Mix: auto-grade objective locally, only open-ended to LLM
        logger.info(
            f"Online smart grading: {len(smart['objective_results'])} objective auto-graded, "
            f"{len(smart['open_questions_resp'])} open-ended sent to LLM"
        )
        llm_result = await grade_exam(
            respuestas_estudiante=smart["open_questions_resp"],
            clave_respuestas=smart["open_questions_key"],
        )
        # Merge results
        all_preguntas = list(smart["objective_results"])
        for p in llm_result.get("preguntas", []):
            all_preguntas.append(p)
        all_preguntas.sort(key=lambda x: x.get("numero", 0))

        nota_total = smart["nota_objective"] + llm_result.get("nota_total", 0)
        nota_maxima = smart["nota_maxima_objective"] + llm_result.get("nota_maxima", smart["nota_maxima_open"])

        grading_result = {
            "nota_total": round(nota_total, 2),
            "nota_maxima": round(nota_maxima, 2),
            "preguntas": all_preguntas,
            "calificacion_automatica": True,
            "tiene_preguntas_abiertas": False,
        }
    else:
        # Fallback: send everything to LLM
        logger.info("Online grading: no question types found, sending all to LLM")
        if isinstance(clave, dict) and "preguntas" in clave:
            clave_list = clave["preguntas"]
        elif isinstance(clave, list):
            clave_list = clave
        else:
            clave_list = [clave]

        grading_result = await grade_exam(
            respuestas_estudiante=resp_list,
            clave_respuestas=clave_list,
        )

    nota = Nota(
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        nota=grading_result.get("nota_total"),
        detalle_json=grading_result,
        retroalimentacion="\n".join(
            f"P{p['numero']}: {p['retroalimentacion']}"
            for p in grading_result.get("preguntas", [])
        ),
    )
    db.add(nota)
    await db.commit()
    await db.refresh(nota)

    return NotaOut.model_validate(nota)

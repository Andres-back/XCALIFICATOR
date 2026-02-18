from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Examen, Materia
from app.schemas.schemas import ExamGenerationRequest, ExamenProfesorOut
from app.services.groq_service import generate_exam
from app.services.pdf_service import generate_exam_pdf
import io

router = APIRouter(prefix="/generate", tags=["Generación de Exámenes"])


@router.post("/exam", response_model=ExamenProfesorOut)
async def generate_exam_endpoint(
    data: ExamGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Generate exam using LLM and save to database."""
    # Verify materia
    result = await db.execute(select(Materia).where(Materia.id == data.materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if materia.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")

    # Generate with LLM
    try:
        exam_data = await generate_exam(
            tema=data.tema,
            nivel=data.nivel,
            distribucion=data.distribucion,
            contenido_base=data.contenido_base or "",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando examen: {str(e)}")

    # Separate content and answers
    preguntas_sin_respuesta = []
    clave_respuestas = []

    for p in exam_data.get("preguntas", []):
        pregunta_limpia = {k: v for k, v in p.items() if k != "respuesta_correcta"}
        preguntas_sin_respuesta.append(pregunta_limpia)
        clave_respuestas.append({
            "numero": p.get("numero"),
            "respuesta_correcta": p.get("respuesta_correcta", ""),
            "puntos": p.get("puntos", 1.0),
        })

    contenido = {
        "titulo": exam_data.get("titulo", data.titulo),
        "preguntas": preguntas_sin_respuesta,  # Without answers
    }

    # Add crossword/word search if present
    if "crucigrama" in exam_data:
        contenido["crucigrama"] = exam_data["crucigrama"]
    if "sopa_letras" in exam_data:
        contenido["sopa_letras"] = exam_data["sopa_letras"]

    # Save exam
    examen = Examen(
        materia_id=data.materia_id,
        titulo=data.titulo,
        tipo="generado",
        contenido_json=contenido,
        clave_respuestas={"preguntas": clave_respuestas},
    )
    db.add(examen)
    await db.commit()
    await db.refresh(examen)

    return ExamenProfesorOut.model_validate(examen)


@router.get("/exam/{examen_id}/pdf")
async def download_exam_pdf(
    examen_id: str,
    include_answers: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Download exam as PDF."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    pdf_bytes = generate_exam_pdf(examen.contenido_json, include_answers=include_answers)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{examen.titulo}.pdf"'
        },
    )


@router.get("/exam/{examen_id}/preview")
async def preview_exam_pdf(
    examen_id: str,
    include_answers: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Preview exam as PDF inline in the browser."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    pdf_bytes = generate_exam_pdf(examen.contenido_json, include_answers=include_answers)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{examen.titulo}.pdf"'
        },
    )


@router.get("/exam/{examen_id}/pdf-student")
async def download_exam_pdf_student(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Download student version (no answers)."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    # Remove answers from content
    content = dict(examen.contenido_json)
    if "preguntas" in content:
        content["preguntas"] = [
            {k: v for k, v in p.items() if k != "respuesta_correcta"}
            for p in content["preguntas"]
        ]

    pdf_bytes = generate_exam_pdf(content, include_answers=False)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{examen.titulo}_estudiante.pdf"'
        },
    )

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
import random
import string

router = APIRouter(prefix="/generate", tags=["Generación de Exámenes"])


def _fix_sopa_letras(sopa: dict) -> dict:
    """Validate and fix word search grid: ensure all cells have a letter, grid is square, words are placed."""
    if not sopa or "grid" not in sopa:
        return sopa

    grid = sopa.get("grid", [])
    palabras = [w.upper().replace(" ", "") for w in sopa.get("palabras", [])]
    size = max(sopa.get("size", 12), 12)

    # Ensure grid is at least size x size and fully filled
    if not grid or len(grid) < size or any(len(row) < size for row in grid if isinstance(row, list)):
        # Rebuild grid from scratch with words
        size = max(size, max((len(w) for w in palabras), default=0) + 2)
        grid = [["" for _ in range(size)] for _ in range(size)]

        directions = [(0, 1), (1, 0), (1, 1), (0, -1), (-1, 0)]
        ubicaciones = []

        for word in palabras:
            placed = False
            for _ in range(200):
                dr, dc = random.choice(directions)
                r = random.randint(0, size - 1)
                c = random.randint(0, size - 1)
                end_r = r + dr * (len(word) - 1)
                end_c = c + dc * (len(word) - 1)
                if not (0 <= end_r < size and 0 <= end_c < size):
                    continue
                # Check no conflict
                ok = True
                for k, ch in enumerate(word):
                    nr, nc = r + dr * k, c + dc * k
                    existing = grid[nr][nc]
                    if existing and existing != ch:
                        ok = False
                        break
                if ok:
                    for k, ch in enumerate(word):
                        nr, nc = r + dr * k, c + dc * k
                        grid[nr][nc] = ch
                    dir_name = {(0,1): "horizontal", (1,0): "vertical", (1,1): "diagonal",
                                (0,-1): "horizontal_inv", (-1,0): "vertical_inv"}.get((dr, dc), "horizontal")
                    ubicaciones.append({"palabra": word, "fila": r, "columna": c, "direccion": dir_name})
                    placed = True
                    break
            if not placed:
                # Force place horizontally at a random row
                r = random.randint(0, size - 1)
                c = 0
                for k, ch in enumerate(word):
                    if c + k < size:
                        grid[r][c + k] = ch

        sopa["ubicaciones"] = ubicaciones
    else:
        # Grid exists but may have empty cells
        pass

    # Fill any empty cells with random letters
    for r in range(len(grid)):
        if not isinstance(grid[r], list):
            grid[r] = list(str(grid[r]))
        while len(grid[r]) < size:
            grid[r].append(random.choice(string.ascii_uppercase))
        for c in range(len(grid[r])):
            cell = grid[r][c]
            if not cell or not str(cell).strip() or str(cell).strip() == "":
                grid[r][c] = random.choice(string.ascii_uppercase)
            else:
                grid[r][c] = str(cell).upper()

    sopa["grid"] = grid
    sopa["size"] = len(grid)
    sopa["palabras"] = palabras
    return sopa


def _fix_crucigrama(crucigrama: dict) -> dict:
    """Ensure crossword grid is properly formatted."""
    if not crucigrama:
        return crucigrama

    grid = crucigrama.get("grid", [])
    if grid:
        size = max(len(grid), max((len(r) for r in grid if isinstance(r, list)), default=0))
        # Normalize grid
        new_grid = []
        for row in grid:
            if isinstance(row, list):
                normalized = []
                for cell in row:
                    if cell and str(cell).strip():
                        normalized.append(str(cell).upper())
                    else:
                        normalized.append("")
                while len(normalized) < size:
                    normalized.append("")
                new_grid.append(normalized)
            else:
                new_grid.append([""] * size)

        while len(new_grid) < size:
            new_grid.append([""] * size)

        crucigrama["grid"] = new_grid
        crucigrama["size"] = size

    return crucigrama


@router.get("/exam/{examen_id}/answers")
async def get_exam_answers(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get the answer key for an exam (professor only)."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    return {
        "examen_id": str(examen.id),
        "titulo": examen.titulo,
        "clave_respuestas": examen.clave_respuestas,
        "contenido_json": examen.contenido_json,
    }


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
            grado=data.grado or "",
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

    # Add crossword/word search if present (with validation)
    if "crucigrama" in exam_data:
        contenido["crucigrama"] = _fix_crucigrama(exam_data["crucigrama"])
    if "sopa_letras" in exam_data:
        contenido["sopa_letras"] = _fix_sopa_letras(exam_data["sopa_letras"])

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

    content = dict(examen.contenido_json)

    # Merge answers back into content when include_answers is True
    if include_answers and examen.clave_respuestas:
        clave = examen.clave_respuestas
        clave_list = clave.get("preguntas", []) if isinstance(clave, dict) else clave
        clave_map = {c.get("numero"): c for c in clave_list if isinstance(c, dict)}
        if "preguntas" in content:
            for p in content["preguntas"]:
                num = p.get("numero")
                if num in clave_map:
                    p["respuesta_correcta"] = clave_map[num].get("respuesta_correcta", "")

    pdf_bytes = generate_exam_pdf(content, include_answers=include_answers)

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

    content = dict(examen.contenido_json)

    # Merge answers back into content when include_answers is True
    if include_answers and examen.clave_respuestas:
        clave = examen.clave_respuestas
        clave_list = clave.get("preguntas", []) if isinstance(clave, dict) else clave
        clave_map = {c.get("numero"): c for c in clave_list if isinstance(c, dict)}
        if "preguntas" in content:
            for p in content["preguntas"]:
                num = p.get("numero")
                if num in clave_map:
                    p["respuesta_correcta"] = clave_map[num].get("respuesta_correcta", "")

    pdf_bytes = generate_exam_pdf(content, include_answers=include_answers)

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

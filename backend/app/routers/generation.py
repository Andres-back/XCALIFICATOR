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
import unicodedata
import copy

router = APIRouter(prefix="/generate", tags=["Generación de Exámenes"])


def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# ─────────────────────────────────────────────────
#  SOPA DE LETRAS — deterministic grid builder
# ─────────────────────────────────────────────────

def _build_sopa_grid(palabras_raw: list[str], size_hint: int = 0) -> dict:
    """Build a word search grid algorithmically. All words are guaranteed to be placed."""
    palabras = [_strip_accents(w.upper().replace(" ", "").replace("Ñ", "N"))
                for w in palabras_raw if w.strip()]
    # Remove duplicates
    seen = set()
    unique = []
    for w in palabras:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    palabras = unique

    if not palabras:
        return {"grid": [], "size": 0, "palabras": [], "ubicaciones": []}

    longest = max(len(w) for w in palabras)
    # Grid must be big enough: at least longest word + 3, and sqrt of total letters * 1.5
    total_letters = sum(len(w) for w in palabras)
    min_size = max(15, longest + 3, int(total_letters ** 0.5) + 5, size_hint)
    size = min_size

    # All 8 directions
    DIRS = [(0, 1), (1, 0), (1, 1), (0, -1), (-1, 0), (-1, -1), (1, -1), (-1, 1)]
    DIR_NAMES = {
        (0, 1): "horizontal", (1, 0): "vertical", (1, 1): "diagonal",
        (0, -1): "horizontal_inv", (-1, 0): "vertical_inv",
        (-1, -1): "diagonal_inv", (1, -1): "diagonal_desc", (-1, 1): "diagonal_asc",
    }

    best_grid = None
    best_ubicaciones = None
    best_placed = 0

    # Try a few times with different grid sizes if needed
    for attempt in range(3):
        grid = [["" for _ in range(size)] for _ in range(size)]
        ubicaciones = []
        placed_count = 0

        # Sort words by length descending (longer words first have better placement)
        sorted_words = sorted(palabras, key=len, reverse=True)

        for word in sorted_words:
            placed = False
            # Shuffle directions for variety
            dirs_shuffled = DIRS[:]
            random.shuffle(dirs_shuffled)

            for _ in range(800):
                dr, dc = random.choice(dirs_shuffled)
                wlen = len(word)

                # Calculate valid start ranges
                if dr > 0:
                    r_range = range(0, size - wlen + 1)
                elif dr < 0:
                    r_range = range(wlen - 1, size)
                else:
                    r_range = range(0, size)

                if dc > 0:
                    c_range = range(0, size - wlen + 1)
                elif dc < 0:
                    c_range = range(wlen - 1, size)
                else:
                    c_range = range(0, size)

                r_list = list(r_range)
                c_list = list(c_range)
                if not r_list or not c_list:
                    continue

                r = random.choice(r_list)
                c = random.choice(c_list)

                # Check all positions are valid
                ok = True
                for k in range(wlen):
                    nr, nc = r + dr * k, c + dc * k
                    if nr < 0 or nr >= size or nc < 0 or nc >= size:
                        ok = False
                        break
                    existing = grid[nr][nc]
                    if existing and existing != word[k]:
                        ok = False
                        break
                if ok:
                    for k in range(wlen):
                        nr, nc = r + dr * k, c + dc * k
                        grid[nr][nc] = word[k]
                    ubicaciones.append({
                        "palabra": word, "fila": r, "columna": c,
                        "direccion": DIR_NAMES.get((dr, dc), "horizontal"),
                    })
                    placed = True
                    placed_count += 1
                    break

            if not placed:
                # If a word couldn't be placed, expand grid and force-place
                while longest > size or wlen > size:
                    size += 2
                    for row in grid:
                        row.extend([""] * 2)
                    grid.append([""] * size)
                    grid.append([""] * size)

                # Try to find a clear row
                for try_r in range(size):
                    can_place = True
                    for k in range(wlen):
                        if k < size and grid[try_r][k] and grid[try_r][k] != word[k]:
                            can_place = False
                            break
                    if can_place:
                        for k in range(wlen):
                            if k < size:
                                grid[try_r][k] = word[k]
                        ubicaciones.append({
                            "palabra": word, "fila": try_r, "columna": 0,
                            "direccion": "horizontal",
                        })
                        placed_count += 1
                        break

        if placed_count > best_placed:
            best_placed = placed_count
            best_grid = copy.deepcopy(grid)
            best_ubicaciones = list(ubicaciones)

        if best_placed == len(palabras):
            break
        size += 2  # Expand for next attempt

    grid = best_grid or [["" for _ in range(size)] for _ in range(size)]
    ubicaciones = best_ubicaciones or []

    # Ensure grid is square
    actual_size = max(len(grid), max((len(r) for r in grid), default=0))
    while len(grid) < actual_size:
        grid.append([""] * actual_size)
    for row in grid:
        while len(row) < actual_size:
            row.append("")

    # Fill empty cells
    for r in range(len(grid)):
        for c in range(len(grid[r])):
            if not grid[r][c]:
                grid[r][c] = random.choice(string.ascii_uppercase)

    return {
        "grid": grid,
        "size": len(grid),
        "palabras": palabras,
        "ubicaciones": ubicaciones,
    }


def _fix_sopa_letras(sopa: dict) -> dict:
    """Always rebuild the grid server-side from the word list."""
    if not sopa:
        return sopa
    palabras = sopa.get("palabras", [])
    if not palabras:
        return sopa
    return _build_sopa_grid(palabras, size_hint=sopa.get("size", 0))


# ─────────────────────────────────────────────────
#  CRUCIGRAMA — deterministic grid builder
# ─────────────────────────────────────────────────

def _build_crucigrama_grid(pistas_h: list[dict], pistas_v: list[dict]) -> dict:
    """Build a crossword grid algorithmically from horizontal and vertical word lists."""
    # Extract words
    h_words = []
    for p in pistas_h:
        if isinstance(p, dict):
            word = _strip_accents(p.get("respuesta", "").upper().replace(" ", "").replace("Ñ", "N"))
            if word:
                h_words.append({"word": word, "pista": p.get("pista", ""), "numero": p.get("numero", 0)})
    v_words = []
    for p in pistas_v:
        if isinstance(p, dict):
            word = _strip_accents(p.get("respuesta", "").upper().replace(" ", "").replace("Ñ", "N"))
            if word:
                v_words.append({"word": word, "pista": p.get("pista", ""), "numero": p.get("numero", 0)})

    if not h_words and not v_words:
        return {"grid": [], "size": 0, "pistas_horizontal": [], "pistas_vertical": []}

    all_words = h_words + v_words
    longest = max((len(w["word"]) for w in all_words), default=5)
    total_words = len(all_words)
    size = max(15, longest + 4, total_words + 3)

    # Grid starts empty (blocked = "")
    grid = [["" for _ in range(size)] for _ in range(size)]

    placed_h = []
    placed_v = []

    def can_place_h(word, r, c):
        wlen = len(word)
        if c + wlen > size:
            return False
        # Check left and right boundaries are blocked or edge
        if c > 0 and grid[r][c - 1] != "":
            return False
        if c + wlen < size and grid[r][c + wlen] != "":
            return False
        for k in range(wlen):
            cell = grid[r][c + k]
            if cell == "":
                # Check above and below are free (no parallel words)
                above = grid[r - 1][c + k] if r > 0 else ""
                below = grid[r + 1][c + k] if r < size - 1 else ""
                if above != "" or below != "":
                    return False
            elif cell == word[k]:
                pass  # Intersection ok
            else:
                return False
        return True

    def can_place_v(word, r, c):
        wlen = len(word)
        if r + wlen > size:
            return False
        if r > 0 and grid[r - 1][c] != "":
            return False
        if r + wlen < size and grid[r + wlen][c] != "":
            return False
        for k in range(wlen):
            cell = grid[r + k][c]
            if cell == "":
                left = grid[r + k][c - 1] if c > 0 else ""
                right = grid[r + k][c + 1] if c < size - 1 else ""
                if left != "" or right != "":
                    return False
            elif cell == word[k]:
                pass
            else:
                return False
        return True

    def place_h(word, r, c):
        for k in range(len(word)):
            grid[r][c + k] = word[k]

    def place_v(word, r, c):
        for k in range(len(word)):
            grid[r + k][c] = word[k]

    def find_intersections_h(word):
        """Find positions where a horizontal word intersects existing vertical words."""
        positions = []
        for r in range(size):
            for c in range(size - len(word) + 1):
                has_intersection = False
                valid = True
                for k in range(len(word)):
                    cell = grid[r][c + k]
                    if cell == word[k]:
                        has_intersection = True
                    elif cell != "":
                        valid = False
                        break
                if valid and has_intersection and can_place_h(word, r, c):
                    positions.append((r, c))
        return positions

    def find_intersections_v(word):
        """Find positions where a vertical word intersects existing horizontal words."""
        positions = []
        for r in range(size - len(word) + 1):
            for c in range(size):
                has_intersection = False
                valid = True
                for k in range(len(word)):
                    cell = grid[r + k][c]
                    if cell == word[k]:
                        has_intersection = True
                    elif cell != "":
                        valid = False
                        break
                if valid and has_intersection and can_place_v(word, r, c):
                    positions.append((r, c))
        return positions

    # Place first horizontal word near center
    if h_words:
        first = h_words[0]
        r = size // 2
        c = (size - len(first["word"])) // 2
        place_h(first["word"], r, c)
        placed_h.append({**first, "fila": r, "columna": c, "longitud": len(first["word"])})
        remaining_h = h_words[1:]
    else:
        remaining_h = []

    # Place first vertical word trying to intersect
    if v_words:
        first_v = v_words[0]
        positions = find_intersections_v(first_v["word"])
        if positions:
            r, c = random.choice(positions)
        else:
            c = size // 2
            r = max(0, (size - len(first_v["word"])) // 2)
        place_v(first_v["word"], r, c)
        placed_v.append({**first_v, "fila": r, "columna": c, "longitud": len(first_v["word"])})
        remaining_v = v_words[1:]
    else:
        remaining_v = []

    # Interleave placing horizontal and vertical words, preferring intersections
    max_iterations = 5
    for iteration in range(max_iterations):
        progress = False

        unplaced_h = []
        for hw in remaining_h:
            positions = find_intersections_h(hw["word"])
            if positions:
                r, c = random.choice(positions)
                place_h(hw["word"], r, c)
                placed_h.append({**hw, "fila": r, "columna": c, "longitud": len(hw["word"])})
                progress = True
            else:
                unplaced_h.append(hw)
        remaining_h = unplaced_h

        unplaced_v = []
        for vw in remaining_v:
            positions = find_intersections_v(vw["word"])
            if positions:
                r, c = random.choice(positions)
                place_v(vw["word"], r, c)
                placed_v.append({**vw, "fila": r, "columna": c, "longitud": len(vw["word"])})
                progress = True
            else:
                unplaced_v.append(vw)
        remaining_v = unplaced_v

        if not remaining_h and not remaining_v:
            break
        if not progress:
            break

    # Force-place any remaining words that couldn't intersect
    for hw in remaining_h:
        for r in range(1, size):
            for c in range(0, size - len(hw["word"]) + 1):
                if can_place_h(hw["word"], r, c):
                    place_h(hw["word"], r, c)
                    placed_h.append({**hw, "fila": r, "columna": c, "longitud": len(hw["word"])})
                    break
            else:
                continue
            break

    for vw in remaining_v:
        for c in range(1, size):
            for r in range(0, size - len(vw["word"]) + 1):
                if can_place_v(vw["word"], r, c):
                    place_v(vw["word"], r, c)
                    placed_v.append({**vw, "fila": r, "columna": c, "longitud": len(vw["word"])})
                    break
            else:
                continue
            break

    # Trim grid to minimal bounding box + 1 padding
    min_r, max_r, min_c, max_c = size, 0, size, 0
    for r in range(size):
        for c in range(size):
            if grid[r][c]:
                min_r = min(min_r, r)
                max_r = max(max_r, r)
                min_c = min(min_c, c)
                max_c = max(max_c, c)

    if max_r < min_r:
        return {"grid": [], "size": 0, "pistas_horizontal": [], "pistas_vertical": []}

    pad = 1
    min_r = max(0, min_r - pad)
    min_c = max(0, min_c - pad)
    max_r = min(size - 1, max_r + pad)
    max_c = min(size - 1, max_c + pad)

    trimmed_size = max(max_r - min_r + 1, max_c - min_c + 1)
    new_grid = [["" for _ in range(trimmed_size)] for _ in range(trimmed_size)]

    for r in range(min_r, min(min_r + trimmed_size, size)):
        for c in range(min_c, min(min_c + trimmed_size, size)):
            nr, nc = r - min_r, c - min_c
            if nr < trimmed_size and nc < trimmed_size:
                new_grid[nr][nc] = grid[r][c]

    # Adjust coordinates
    final_h = []
    h_num = 1
    for p in placed_h:
        final_h.append({
            "numero": h_num,
            "pista": p["pista"],
            "respuesta": p["word"],
            "fila": p["fila"] - min_r,
            "columna": p["columna"] - min_c,
            "longitud": p["longitud"],
        })
        h_num += 1

    final_v = []
    v_num = 1
    for p in placed_v:
        final_v.append({
            "numero": v_num,
            "pista": p["pista"],
            "respuesta": p["word"],
            "fila": p["fila"] - min_r,
            "columna": p["columna"] - min_c,
            "longitud": p["longitud"],
        })
        v_num += 1

    return {
        "grid": new_grid,
        "size": trimmed_size,
        "pistas_horizontal": final_h,
        "pistas_vertical": final_v,
    }


def _fix_crucigrama(crucigrama: dict) -> dict:
    """Rebuild crossword grid server-side from clue data."""
    if not crucigrama:
        return crucigrama

    pistas_h = crucigrama.get("pistas_horizontal", [])
    pistas_v = crucigrama.get("pistas_vertical", [])

    if not pistas_h and not pistas_v:
        return crucigrama

    return _build_crucigrama_grid(pistas_h, pistas_v)


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

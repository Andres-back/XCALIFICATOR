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
#  CRUCIGRAMA — pool-based connected grid builder
# ─────────────────────────────────────────────────

def _build_crucigrama_grid(pistas_h: list[dict], pistas_v: list[dict]) -> dict:
    """Build a fully-connected crossword grid.

    Strategy:
    - Pools ALL words from both H and V lists, deduplicates.
    - Algorithm decides direction (H/V) to maximise intersections.
    - Every word crosses at least one other word when possible.
    - Multiple randomised attempts; picks best layout.
    - Normalises coordinates and assigns standard numbering.
    """

    def _norm(word: str) -> str:
        return _strip_accents(word.upper().replace(" ", "").replace("Ñ", "N"))

    # ── Collect unique words with clues ────────────────────────────
    word_clues: dict[str, str] = {}
    for p in (pistas_h or []):
        if not isinstance(p, dict):
            continue
        w = _norm(p.get("respuesta", ""))
        if w and w not in word_clues:
            word_clues[w] = p.get("pista", "")
    for p in (pistas_v or []):
        if not isinstance(p, dict):
            continue
        w = _norm(p.get("respuesta", ""))
        if w and w not in word_clues:
            word_clues[w] = p.get("pista", "")

    entries = [{"word": w, "pista": c} for w, c in word_clues.items()]

    if not entries:
        return {"grid": [], "size": 0, "pistas_horizontal": [], "pistas_vertical": []}

    if len(entries) == 1:
        w = entries[0]["word"]
        return {
            "grid": [list(w)],
            "size": max(len(w), 1),
            "pistas_horizontal": [{"numero": 1, "pista": entries[0]["pista"],
                                   "respuesta": w, "fila": 0, "columna": 0,
                                   "longitud": len(w)}],
            "pistas_vertical": [],
        }

    # ── Placement helpers (sparse dict grid) ───────────────────────
    def _can_place(grid: dict, word: str, d: str, row: int, col: int) -> bool:
        n = len(word)
        if d == "h":
            if grid.get((row, col - 1)):
                return False
            if grid.get((row, col + n)):
                return False
            for k in range(n):
                r, c = row, col + k
                ex = grid.get((r, c))
                if ex:
                    if ex != word[k]:
                        return False
                else:
                    if grid.get((r - 1, c)) or grid.get((r + 1, c)):
                        return False
        else:
            if grid.get((row - 1, col)):
                return False
            if grid.get((row + n, col)):
                return False
            for k in range(n):
                r, c = row + k, col
                ex = grid.get((r, c))
                if ex:
                    if ex != word[k]:
                        return False
                else:
                    if grid.get((r, c - 1)) or grid.get((r, c + 1)):
                        return False
        return True

    def _crossings(grid: dict, word: str, d: str, row: int, col: int) -> int:
        s = 0
        for k in range(len(word)):
            rr = row + (k if d == "v" else 0)
            cc = col + (k if d == "h" else 0)
            if grid.get((rr, cc)) == word[k]:
                s += 1
        return s

    def _do_place(grid: dict, word: str, d: str, row: int, col: int):
        for k in range(len(word)):
            if d == "h":
                grid[(row, col + k)] = word[k]
            else:
                grid[(row + k, col)] = word[k]

    # ── Run multiple attempts, keep the best ───────────────────────
    best_grid = None
    best_placed = None
    best_score = -1

    for attempt in range(10):
        grid: dict = {}
        placed: list[dict] = []

        # Build order: longest first with randomisation
        order = list(range(len(entries)))
        if attempt == 0:
            order.sort(key=lambda i: -len(entries[i]["word"]))
        else:
            order.sort(key=lambda i: -len(entries[i]["word"]) + random.randint(-3, 3))

        # Place first word horizontally at origin
        first = entries[order[0]]
        _do_place(grid, first["word"], "h", 0, 0)
        placed.append({"word": first["word"], "pista": first["pista"],
                        "dir": "h", "row": 0, "col": 0})

        remaining = order[1:]

        # ── Iterative placement passes ─────────────────────────────
        for _pass in range(50):
            if not remaining:
                break
            progress = False
            new_remaining = []

            for idx in remaining:
                entry = entries[idx]
                w = entry["word"]
                best_pos = None
                best_cross = 0

                for p in placed:
                    pw, pd = p["word"], p["dir"]
                    pr, pc = p["row"], p["col"]
                    for i, ch_new in enumerate(w):
                        for j, ch_old in enumerate(pw):
                            if ch_new != ch_old:
                                continue
                            # Perpendicular placement
                            if pd == "h":
                                nd, nr, nc = "v", pr - i, pc + j
                            else:
                                nd, nr, nc = "h", pr + j, pc - i
                            if _can_place(grid, w, nd, nr, nc):
                                sc = _crossings(grid, w, nd, nr, nc)
                                if sc > best_cross:
                                    best_cross = sc
                                    best_pos = (nd, nr, nc)

                if best_pos:
                    d, r, c = best_pos
                    _do_place(grid, w, d, r, c)
                    placed.append({"word": w, "pista": entry["pista"],
                                   "dir": d, "row": r, "col": c})
                    progress = True
                else:
                    new_remaining.append(idx)

            remaining = new_remaining
            if not progress:
                break

        # ── Force-place words that couldn't intersect ──────────────
        force_count = len(remaining)
        for idx in remaining:
            entry = entries[idx]
            w = entry["word"]
            if grid:
                max_r = max(r for r, c in grid)
                min_c = min(c for r, c in grid)
            else:
                max_r = min_c = 0
            nr = max_r + 2
            ok = False
            for ct in range(min_c, min_c + 40):
                if _can_place(grid, w, "h", nr, ct):
                    _do_place(grid, w, "h", nr, ct)
                    placed.append({"word": w, "pista": entry["pista"],
                                   "dir": "h", "row": nr, "col": ct})
                    ok = True
                    break
            if not ok:
                _do_place(grid, w, "h", nr, min_c)
                placed.append({"word": w, "pista": entry["pista"],
                               "dir": "h", "row": nr, "col": min_c})

        # Score: connected words minus penalty for forced
        score = (len(entries) - force_count) * 100 - force_count * 50
        if score > best_score:
            best_score = score
            best_grid = dict(grid)
            best_placed = list(placed)

        if force_count == 0:
            break  # Perfect layout, stop

    grid = best_grid or {}
    placed = best_placed or []

    if not grid:
        return {"grid": [], "size": 0, "pistas_horizontal": [], "pistas_vertical": []}

    # ── Normalise to 0-based bounding box ──────────────────────────
    rs = [r for r, c in grid]
    cs = [c for r, c in grid]
    min_r, max_r = min(rs), max(rs)
    min_c, max_c = min(cs), max(cs)
    rows = max_r - min_r + 1
    cols = max_c - min_c + 1
    size = max(rows, cols)

    new_grid = [["" for _ in range(size)] for _ in range(size)]
    for (r, c), letter in grid.items():
        nr, nc = r - min_r, c - min_c
        if 0 <= nr < size and 0 <= nc < size:
            new_grid[nr][nc] = letter

    # ── Standard crossword cell numbering ──────────────────────────
    cell_number: dict = {}
    num_counter = 1
    for nr in range(size):
        for nc in range(size):
            if not new_grid[nr][nc]:
                continue
            starts_across = (nc == 0 or not new_grid[nr][nc - 1]) and (nc + 1 < size and new_grid[nr][nc + 1])
            starts_down = (nr == 0 or not new_grid[nr - 1][nc]) and (nr + 1 < size and new_grid[nr + 1][nc])
            if starts_across or starts_down:
                cell_number[(nr, nc)] = num_counter
                num_counter += 1

    # ── Build output clue lists ────────────────────────────────────
    final_h = []
    final_v = []
    for p in placed:
        nr, nc = p["row"] - min_r, p["col"] - min_c
        num = cell_number.get((nr, nc), 0)
        entry = {
            "numero": num,
            "pista": p["pista"],
            "respuesta": p["word"],
            "fila": nr,
            "columna": nc,
            "longitud": len(p["word"]),
        }
        if p["dir"] == "h":
            final_h.append(entry)
        else:
            final_v.append(entry)

    final_h.sort(key=lambda x: x["numero"])
    final_v.sort(key=lambda x: x["numero"])

    return {
        "grid": new_grid,
        "size": size,
        "pistas_horizontal": final_h,
        "pistas_vertical": final_v,
    }


def _fix_crucigrama(crucigrama: dict) -> dict:
    """Rebuild crossword grid server-side from clue data."""
    if not crucigrama:
        return crucigrama

    pistas_h = crucigrama.get("pistas_horizontal", [])
    pistas_v = crucigrama.get("pistas_vertical", [])

    # Handle flat "pistas" list (simplified LLM output)
    if not pistas_h and not pistas_v:
        pistas = crucigrama.get("pistas", [])
        half = len(pistas) // 2
        pistas_h = pistas[:half]
        pistas_v = pistas[half:]

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

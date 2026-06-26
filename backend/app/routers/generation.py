from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.tool_flags import is_tool_enabled
from app.core.latex_utils import normalize_latex_payload
from app.core.math_exam_validator import infer_correct_option_for_math_question
from app.models.models import User, Examen, Materia
from app.schemas.schemas import ExamGenerationRequest, ExamenProfesorOut
from app.services.groq_service import generate_exam
from app.services.curriculum_service import retrieve_curriculum_context
from app.services.ocr_service import normalize_image_to_png
from app.services.open_code_service import (
    OPEN_CODE_RECOMMENDED_MODELS,
    open_code_vision_json,
    open_code_chat_completion,
    _message_text,
)
from app.services.pdf_service import generate_exam_pdf
import base64
import fitz
import io
import json
import re
import random
import string
import unicodedata
import copy

ALLOWED_DIGITALIZE_TYPES = {"image/jpeg", "image/png", "image/jpg"}

router = APIRouter(prefix="/generate", tags=["Generación de Exámenes"])


async def _assert_materia_access(
    db: AsyncSession,
    materia_id: str,
    current_user: User,
) -> Materia:
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso")

    return materia


async def _assert_examen_access(
    db: AsyncSession,
    examen_id: str,
    current_user: User,
) -> Examen:
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    await _assert_materia_access(db, str(examen.materia_id), current_user)
    return examen


def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def _normalize_question_statements(content: dict | None) -> dict | None:
    """Ensure each question exposes both enunciado and pregunta keys for compatibility."""
    if not isinstance(content, dict):
        return content

    preguntas = content.get("preguntas")
    if not isinstance(preguntas, list):
        return content

    normalized = []
    for item in preguntas:
        if not isinstance(item, dict):
            normalized.append(item)
            continue

        q = dict(item)
        enunciado = q.get("enunciado") or q.get("pregunta") or q.get("texto") or q.get("statement")
        if isinstance(enunciado, str) and enunciado.strip():
            normalized_enunciado = normalize_latex_payload(enunciado)
            q["enunciado"] = normalized_enunciado
            q["pregunta"] = normalized_enunciado

        if isinstance(q.get("opciones"), list):
            q["opciones"] = normalize_latex_payload(q["opciones"])
        normalized.append(q)

    content["preguntas"] = normalized
    return content


async def _build_curricular_context(
    db: AsyncSession,
    materia: Materia,
    contenido_base: str | None = "",
    query: str | None = "",
) -> str:
    blocks = []
    base = (contenido_base or "").strip()
    if base:
        blocks.append(base)
    if materia.dba_json:
        blocks.append(
            "DBA / derechos basicos de aprendizaje de la materia:\n"
            + json.dumps(materia.dba_json, ensure_ascii=False, indent=2)
        )
    if materia.plan_json:
        blocks.append(
            "Metas, plan de aula o evidencias que debe cumplir la actividad:\n"
            + json.dumps(materia.plan_json, ensure_ascii=False, indent=2)
        )
    rag_context = await retrieve_curriculum_context(db, materia, query or base or materia.nombre)
    if rag_context:
        blocks.append(
            "Fragmentos curriculares recuperados por RAG de documentos DBA/plan subidos a la materia:\n"
            + rag_context
        )
    return "\n\n".join(blocks)


def _ensure_question_media_fields(exam_data: dict) -> dict:
    preguntas = exam_data.get("preguntas")
    if not isinstance(preguntas, list):
        return exam_data
    for p in preguntas:
        if not isinstance(p, dict):
            continue
        p.setdefault("image_url", "")
        p.setdefault("image_prompt", "")
        p.setdefault("image_type", "")
        p.setdefault("image_alt", "")
    return exam_data


def _split_exam_payload(exam_data: dict, fallback_title: str) -> tuple[dict, dict]:
    preguntas_sin_respuesta = []
    clave_respuestas = []
    for p in exam_data.get("preguntas", []):
        if not isinstance(p, dict):
            continue
        pregunta_limpia = {k: v for k, v in p.items() if k != "respuesta_correcta"}
        preguntas_sin_respuesta.append(pregunta_limpia)
        clave_respuestas.append({
            "numero": p.get("numero"),
            "respuesta_correcta": p.get("respuesta_correcta", ""),
            "puntos": p.get("puntos", 1.0),
            "tipo": p.get("tipo", ""),
            "enunciado": p.get("enunciado") or p.get("pregunta") or "",
            "opciones": p.get("opciones", []),
        })
    return (
        {
            "titulo": exam_data.get("titulo") or fallback_title,
            "preguntas": preguntas_sin_respuesta,
        },
        {"preguntas": clave_respuestas},
    )


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

    def _grid_bounds(grid: dict) -> tuple[int, int, int, int] | None:
        if not grid:
            return None
        rs = [r for r, c in grid]
        cs = [c for r, c in grid]
        return min(rs), max(rs), min(cs), max(cs)

    def _word_bounds(word: str, d: str, row: int, col: int) -> tuple[int, int, int, int]:
        if d == "h":
            return row, row, col, col + len(word) - 1
        return row, row + len(word) - 1, col, col

    def _merge_bounds(a: tuple[int, int, int, int] | None, b: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        if a is None:
            return b
        return (
            min(a[0], b[0]),
            max(a[1], b[1]),
            min(a[2], b[2]),
            max(a[3], b[3]),
        )

    # Target orientation ratio based on incoming H/V hints.
    h_hint = sum(1 for p in (pistas_h or []) if isinstance(p, dict) and _norm(p.get("respuesta", "")))
    v_hint = sum(1 for p in (pistas_v or []) if isinstance(p, dict) and _norm(p.get("respuesta", "")))
    total_hint = h_hint + v_hint

    if len(entries) <= 1:
        target_h = 1
    elif total_hint > 0:
        target_h = round(len(entries) * (h_hint / total_hint))
    else:
        target_h = len(entries) // 2

    if len(entries) > 1:
        target_h = max(1, min(len(entries) - 1, target_h))
    target_v = max(0, len(entries) - target_h)

    # ── Run multiple attempts, keep the best ───────────────────────
    best_grid = None
    best_placed = None
    best_score = -1

    for attempt in range(24):
        grid: dict = {}
        placed: list[dict] = []

        # Build order: longest first with randomisation
        order = list(range(len(entries)))
        if attempt == 0:
            order.sort(key=lambda i: -len(entries[i]["word"]))
        else:
            order.sort(key=lambda i: -len(entries[i]["word"]) + random.randint(-3, 3))

        # Place first word at origin; alternate direction between attempts
        first = entries[order[0]]
        start_dir = "h" if attempt % 2 == 0 else "v"
        _do_place(grid, first["word"], start_dir, 0, 0)
        placed.append({"word": first["word"], "pista": first["pista"],
                "dir": start_dir, "row": 0, "col": 0})

        h_count = 1 if start_dir == "h" else 0
        v_count = 1 if start_dir == "v" else 0
        total_crossings = 0

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
                best_eval = None

                bounds = _grid_bounds(grid)

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
                                if sc <= 0:
                                    continue

                                h_after = h_count + (1 if nd == "h" else 0)
                                v_after = v_count + (1 if nd == "v" else 0)
                                balance_pen = abs(h_after - target_h) + abs(v_after - target_v)

                                merged = _merge_bounds(bounds, _word_bounds(w, nd, nr, nc))
                                height = merged[1] - merged[0] + 1
                                width = merged[3] - merged[2] + 1
                                area = height * width
                                shape_pen = abs(height - width)

                                # Prefer more crossings, compact shape, and H/V balance.
                                eval_score = (
                                    sc * 100
                                    - balance_pen * 8
                                    - area * 0.7
                                    - shape_pen * 1.4
                                    + random.random() * 0.01
                                )

                                if best_eval is None or eval_score > best_eval:
                                    best_eval = eval_score
                                    best_pos = (nd, nr, nc, sc)

                if best_pos:
                    d, r, c, cross = best_pos
                    _do_place(grid, w, d, r, c)
                    placed.append({"word": w, "pista": entry["pista"],
                                   "dir": d, "row": r, "col": c})
                    h_count += 1 if d == "h" else 0
                    v_count += 1 if d == "v" else 0
                    total_crossings += cross
                    progress = True
                else:
                    new_remaining.append(idx)

            remaining = new_remaining
            if not progress:
                break

        unplaced_count = len(remaining)
        bounds = _grid_bounds(grid)
        if bounds:
            height = bounds[1] - bounds[0] + 1
            width = bounds[3] - bounds[2] + 1
            area = height * width
            shape_pen = abs(height - width)
        else:
            area = 0
            shape_pen = 0

        imbalance = abs(h_count - target_h) + abs(v_count - target_v)

        # Strongly prefer connected, compact, balanced layouts.
        score = (
            len(placed) * 1000
            + total_crossings * 50
            - unplaced_count * 250
            - area * 3
            - shape_pen * 8
            - imbalance * 30
        )
        if score > best_score:
            best_score = score
            best_grid = dict(grid)
            best_placed = list(placed)

        if unplaced_count == 0 and imbalance <= 1:
            break  # Excellent layout, stop

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
        if num == 0:
            num = num_counter
            cell_number[(nr, nc)] = num_counter
            num_counter += 1
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
    examen = await _assert_examen_access(db, examen_id, current_user)
    content = _normalize_question_statements(copy.deepcopy(examen.contenido_json))
    content = normalize_latex_payload(content)
    return {
        "examen_id": str(examen.id),
        "titulo": examen.titulo,
        "clave_respuestas": normalize_latex_payload(examen.clave_respuestas),
        "contenido_json": content,
    }


@router.post("/exam", response_model=ExamenProfesorOut)
async def generate_exam_endpoint(
    data: ExamGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Generate exam using LLM and save to database."""
    if not await is_tool_enabled(db, "examen"):
        raise HTTPException(status_code=403, detail="La herramienta 'Examen' está deshabilitada por administración")

    materia = await _assert_materia_access(db, str(data.materia_id), current_user)

    # Generate with LLM
    try:
        ai_config = await get_profesor_ai_config(db, str(current_user.id))
        exam_data = await generate_exam(
            tema=data.tema,
            nivel=data.nivel,
            distribucion=data.distribucion,
            contenido_base=await _build_curricular_context(
                db,
                materia,
                data.contenido_base,
                " ".join([data.titulo or "", data.tema or "", data.grado or "", data.nivel or ""]),
            ),
            grado=data.grado or "",
            provider_config=ai_config,
        )
        exam_data = _ensure_question_media_fields(normalize_latex_payload(exam_data))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando examen: {str(e)}")

    for p in exam_data.get("preguntas", []):
        if isinstance(p, dict):
            inferred = infer_correct_option_for_math_question(p)
            if inferred:
                p["respuesta_correcta"] = inferred

    contenido, clave_respuestas = _split_exam_payload(exam_data, data.titulo)

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
        clave_respuestas=clave_respuestas,
    )
    db.add(examen)
    await db.commit()
    await db.refresh(examen)

    return ExamenProfesorOut.model_validate(examen)


@router.post("/exam/digitalize", response_model=ExamenProfesorOut)
async def digitalize_exam_from_image(
    materia_id: str = Form(...),
    titulo: str = Form("Examen digitalizado"),
    files: list[UploadFile] | None = File(default=None),
    file: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Convert a photographed paper exam into the same JSON format used by generated exams."""
    materia = await _assert_materia_access(db, materia_id, current_user)
    selected_files = list(files or [])
    if file is not None and file.filename:
        selected_files.append(file)
    selected_files = [f for f in selected_files if f is not None and f.filename]
    if not selected_files:
        raise HTTPException(status_code=400, detail="Selecciona al menos una foto del examen")
    if len(selected_files) > 3:
        raise HTTPException(status_code=400, detail="Solo puedes digitalizar hasta 3 fotos por examen")

    ai_config = await get_profesor_ai_config(db, str(current_user.id))
    base_url = str(ai_config.get("open_code_base_url") or "").strip()
    api_key = str(ai_config.get("open_code_api_key") or "").strip()
    model = str(
        ai_config.get("open_code_vision_model")
        or ai_config.get("ocr_model")
        or OPEN_CODE_RECOMMENDED_MODELS["vision"]
    ).strip()
    if not base_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Open Code no esta configurado para vision. Configura Base URL y API Key antes de digitalizar examenes.",
        )

    image_payloads: list[str] = []
    for idx, upload in enumerate(selected_files, start=1):
        if upload.content_type not in ALLOWED_DIGITALIZE_TYPES:
            raise HTTPException(status_code=400, detail=f"La foto {idx} no es JPG o PNG")
        file_bytes = await upload.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail=f"La foto {idx} esta vacia")
        image_png = normalize_image_to_png(file_bytes)
        image_payloads.append(base64.b64encode(image_png).decode("utf-8"))

    curricular_context = await _build_curricular_context(db, materia, "", titulo)
    prompt = (
        "Convierte estas fotos de un mismo examen escolar en un examen digital editable. "
        "Las imagenes estan en orden de pagina/foto. Une el contenido sin duplicar preguntas. "
        "Extrae SOLO lo visible: titulo, preguntas, opciones y respuestas correctas si aparecen marcadas o escritas. "
        "Si no puedes determinar una respuesta_correcta, deja el campo vacio y agrega requiere_revision=true en esa pregunta. "
        "Usa tipos: seleccion_multiple, verdadero_falso, respuesta_corta, desarrollo. "
        "Agrega siempre image_url, image_prompt, image_type e image_alt vacios por pregunta, salvo que una pregunta ya tenga una imagen visible; "
        "en ese caso describe la imagen en image_alt y pon requiere_revision=true. "
        "Si el examen tiene una seccion de 'Unir columnas' o 'Relacionar columnas', agrégala como campo opcional "
        "\"unir_columnas\":{\"instrucciones\":\"string\",\"pares\":[{\"id\":1,\"izquierda\":\"string\",\"derecha\":\"string\"}]} "
        "al nivel raiz del JSON (fuera de preguntas). "
        "Devuelve SOLO JSON valido con este schema exacto: "
        "{\"titulo\":\"string\",\"preguntas\":[{\"numero\":1,\"tipo\":\"seleccion_multiple|verdadero_falso|respuesta_corta|desarrollo\","
        "\"enunciado\":\"string\",\"opciones\":[\"A) ...\"],\"respuesta_correcta\":\"string\",\"puntos\":1,\"requiere_revision\":false,"
        "\"image_url\":\"\",\"image_prompt\":\"\",\"image_type\":\"\",\"image_alt\":\"\"}]}. "
        "No inventes preguntas ni opciones que no sean visibles."
    )
    if curricular_context:
        prompt += "\n\nContexto curricular de la materia para etiquetar mejor el examen, sin inventar contenido:\n" + curricular_context

    try:
        exam_data = await open_code_vision_json(
            image_payloads=image_payloads,
            prompt=prompt,
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.0,
            max_tokens=4096,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No fue posible digitalizar con vision: {exc}") from exc

    exam_data = _ensure_question_media_fields(normalize_latex_payload(exam_data))
    contenido, clave_respuestas = _split_exam_payload(exam_data, titulo)
    examen = Examen(
        materia_id=materia.id,
        titulo=titulo or contenido.get("titulo") or "Examen digitalizado",
        tipo="digitalizado",
        contenido_json=contenido,
        clave_respuestas=clave_respuestas,
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
    examen = await _assert_examen_access(db, examen_id, current_user)
    if not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    content = normalize_latex_payload(dict(examen.contenido_json))
    content = _normalize_question_statements(content)

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
    examen = await _assert_examen_access(db, examen_id, current_user)
    if not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    content = normalize_latex_payload(dict(examen.contenido_json))
    content = _normalize_question_statements(content)

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
    examen = await _assert_examen_access(db, examen_id, current_user)
    if not examen.contenido_json:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    # Remove answers from content
    content = normalize_latex_payload(dict(examen.contenido_json))
    content = _normalize_question_statements(content)
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


# ─────────────────────────────────────────────────
#  XALI EXAM DESIGNER — chat interactivo
# ─────────────────────────────────────────────────

_EXAM_CHAT_SYSTEM = """\
Eres Xali Exam Designer — asistente de diseño de exámenes para docentes colombianos.
Ayudas a crear exámenes de alta calidad paso a paso via conversación.

FLUJO:
1. Si falta información, pregunta UNA cosa a la vez: tema principal, grado/nivel, número de preguntas, tipos.
2. Si el profesor sube imágenes o PDFs, extrae el contenido temático visible y úsalo como base.
3. Propón máx. 3–4 preguntas por turno. Espera que el profesor apruebe antes de continuar.
4. Cuando el profesor confirme ("listo", "guarda", "así está bien", "perfecto", "eso es todo"), \
incluye el examen completo al final DENTRO de etiquetas <exam_draft>...</exam_draft>.

FORMATO del JSON dentro de <exam_draft> (sin comentarios ni markdown extra):
{"titulo":"string","preguntas":[{"numero":1,"tipo":"seleccion_multiple","enunciado":"texto",\
"opciones":["A) texto","B) texto","C) texto","D) texto"],"respuesta_correcta":"A","puntos":1}]}

tipos válidos: seleccion_multiple | verdadero_falso | respuesta_corta | desarrollo
- verdadero_falso → opciones=["A) Verdadero","B) Falso"], respuesta_correcta="A" o "B"
- respuesta_corta / desarrollo → opciones=[], respuesta_correcta="" (subjetivo)

REGLAS:
- Responde siempre en español, conciso (máx 3 párrafos + preguntas propuestas).
- NO incluyas <exam_draft> hasta que el profesor apruebe explícitamente.
- Cuando incluyas <exam_draft>, el JSON debe ser completo con TODAS las preguntas ya aprobadas.
"""


async def _encode_uploads_to_b64(uploads: list[UploadFile]) -> list[str]:
    """Convert uploaded images/PDFs to base64-encoded PNG strings."""
    result: list[str] = []
    valid_types = {"image/jpeg", "image/png", "image/jpg", "application/pdf"}
    for upload in (uploads or [])[:3]:
        if upload.content_type not in valid_types:
            continue
        raw = await upload.read()
        if not raw:
            continue
        if upload.content_type == "application/pdf":
            try:
                doc = fitz.open(stream=raw, filetype="pdf")
                for idx, page in enumerate(doc):
                    if idx >= 2:
                        break
                    pix = page.get_pixmap(dpi=150)
                    result.append(base64.b64encode(pix.tobytes("png")).decode("utf-8"))
                doc.close()
            except Exception:
                pass
        else:
            try:
                png = normalize_image_to_png(raw)
                result.append(base64.b64encode(png).decode("utf-8"))
            except Exception:
                pass
    return result


@router.post("/exam-chat")
async def exam_design_chat(
    message: str = Form(..., min_length=1, max_length=3000),
    history: str = Form(default="[]"),
    materia_id: str = Form(default=""),
    files: list[UploadFile] = File(default=[]),
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Interactive AI chat to collaboratively design an exam. Returns response + exam_draft when ready."""
    ai_config = await get_profesor_ai_config(db, str(current_user.id))
    base_url = str(ai_config.get("open_code_base_url") or "").strip()
    api_key = str(ai_config.get("open_code_api_key") or "").strip()
    model = str(
        ai_config.get("open_code_vision_model")
        or ai_config.get("open_code_content_model")
        or OPEN_CODE_RECOMMENDED_MODELS.get("vision", "qwen3.7-plus")
    ).strip()

    if not base_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Configura Open Code (Base URL + API Key) en tu perfil para usar el diseñador de exámenes.",
        )

    # Parse history
    try:
        hist = json.loads(history) if history.strip() else []
        if not isinstance(hist, list):
            hist = []
    except Exception:
        hist = []

    # Curricular context from materia (if provided)
    context_block = ""
    if materia_id.strip():
        try:
            result = await db.execute(select(Materia).where(Materia.id == materia_id))
            materia = result.scalar_one_or_none()
            if materia and str(materia.profesor_id) == str(current_user.id):
                context_block = await _build_curricular_context(db, materia, "", message[:200])
        except Exception:
            pass

    images_b64 = await _encode_uploads_to_b64(files)

    # Build system prompt
    system_prompt = _EXAM_CHAT_SYSTEM
    if context_block:
        system_prompt += f"\n\nContexto curricular de la materia (úsalo para personalizar el examen, sin inventar):\n{context_block[:2000]}"

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for h in hist[-8:]:
        role = str(h.get("role", "")).strip()
        content_h = str(h.get("content", "")).strip()
        if role in ("user", "assistant") and content_h:
            messages.append({"role": role, "content": content_h})

    # User message: text + optional images
    if images_b64:
        user_content: list[dict] = [{"type": "text", "text": message}]
        for b64 in images_b64:
            user_content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": message})

    try:
        raw = await open_code_chat_completion(
            messages=messages,
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.3,
            max_tokens=3000,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error conectando con la IA: {exc}") from exc

    response_text = _message_text(raw)

    # Extract <exam_draft>...</exam_draft>
    exam_draft = None
    draft_match = re.search(r"<exam_draft>([\s\S]*?)</exam_draft>", response_text, re.IGNORECASE)
    if draft_match:
        try:
            raw_json = draft_match.group(1).strip()
            exam_draft = json.loads(raw_json)
            exam_draft = normalize_latex_payload(exam_draft)
            exam_draft = _ensure_question_media_fields(exam_draft)
        except Exception:
            exam_draft = None
        response_text = re.sub(r"\s*<exam_draft>[\s\S]*?</exam_draft>", "", response_text, flags=re.IGNORECASE).strip()

    return {"response": response_text, "exam_draft": exam_draft}


# ─────────────────────────────────────────────────
#  EXTRACT CONTENT — PDF / DOCX / image to text
# ─────────────────────────────────────────────────

@router.post("/extract-content")
async def extract_content_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Extract readable text from a PDF, Word, or image to use as contenido_base."""
    ALLOWED = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/msword": "docx",
        "image/jpeg": "image",
        "image/jpg": "image",
        "image/png": "image",
    }
    file_type = ALLOWED.get(file.content_type or "")
    if not file_type:
        name = (file.filename or "").lower()
        if name.endswith(".pdf"):
            file_type = "pdf"
        elif name.endswith((".docx", ".doc")):
            file_type = "docx"
        elif name.endswith((".jpg", ".jpeg", ".png")):
            file_type = "image"
        else:
            raise HTTPException(
                status_code=400,
                detail="Tipo no soportado. Usa PDF, Word (.docx) o imagen JPG/PNG."
            )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    text = ""

    if file_type == "pdf":
        try:
            doc = fitz.open(stream=raw, filetype="pdf")
            parts = [page.get_text() for page in doc]
            doc.close()
            text = "\n".join(parts).strip()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Error leyendo PDF: {exc}")

    elif file_type == "docx":
        try:
            import docx as _docx
            document = _docx.Document(io.BytesIO(raw))
            paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
            text = "\n".join(paragraphs).strip()
        except ImportError:
            raise HTTPException(status_code=501, detail="Extracción de Word no disponible en este servidor. Usa PDF.")
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Error leyendo Word: {exc}")

    elif file_type == "image":
        ai_config = await get_profesor_ai_config(db, str(current_user.id))
        base_url = str(ai_config.get("open_code_base_url") or "").strip()
        api_key = str(ai_config.get("open_code_api_key") or "").strip()
        model = str(
            ai_config.get("open_code_vision_model") or OPEN_CODE_RECOMMENDED_MODELS.get("vision", "")
        ).strip()
        if not base_url or not api_key:
            raise HTTPException(
                status_code=400,
                detail="Para extraer texto de imágenes configura Open Code (Base URL + API Key) en tu perfil."
            )
        try:
            png = normalize_image_to_png(raw)
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
            text = str(result.get("text", "")).strip()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Error extrayendo texto de imagen: {exc}")

    if not text:
        raise HTTPException(
            status_code=422,
            detail="No se pudo extraer texto. Verifica que el documento tenga contenido legible."
        )

    MAX_CHARS = 6000
    truncated = len(text) > MAX_CHARS
    if truncated:
        text = text[:MAX_CHARS] + "\n... [contenido truncado]"

    return {"text": text, "chars": len(text), "truncated": truncated}


# ─────────────────────────────────────────────────
#  IMPROVE PROMPT — mejora el texto del profesor
# ─────────────────────────────────────────────────

class ImprovePromptRequest(BaseModel):
    text: str
    tipo: str = "examen"


@router.post("/improve-prompt")
async def improve_prompt(
    body: ImprovePromptRequest,
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Mejora y expande el texto del docente para generar mejores herramientas educativas."""
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="El texto no puede estar vacío")

    ai_config = await get_profesor_ai_config(db, str(current_user.id))
    model = ai_config.get("open_code_content_model") or ai_config.get("content_model") or ""
    base_url = ai_config.get("open_code_base_url") or ""
    api_key = ai_config.get("open_code_api_key") or ""

    if not base_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Configura Open Code (Base URL + API Key) en Configuración IA para usar esta función."
        )

    tipo_labels = {
        "examen": "examen educativo",
        "crucigrama": "crucigrama educativo",
        "sopa_letras": "sopa de letras educativa",
        "emparejar": "actividad de emparejar conceptos",
        "cuento": "cuento educativo con moraleja",
        "para_colorear": "página para colorear educativa",
    }
    tipo_label = tipo_labels.get(body.tipo, "herramienta educativa")

    system_prompt = (
        f"Eres un asistente para docentes colombianos de educación básica y media. "
        f"Tu tarea es mejorar y expandir el texto del docente sobre el tema para generar un {tipo_label} con IA. "
        f"Haz el texto más claro, específico y pedagógicamente rico. "
        f"Incluye conceptos clave, subtemas relevantes y vocabulario académico apropiado. "
        f"Responde ÚNICAMENTE con el texto mejorado, sin encabezados ni explicaciones adicionales. "
        f"Máximo 250 palabras. Escribe en español colombiano."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Mejora este texto para un {tipo_label}:\n\n{body.text.strip()}"},
    ]

    try:
        raw = await open_code_chat_completion(
            messages=messages,
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.5,
            # Modelos de razonamiento (DeepSeek V4 Flash) gastan tokens pensando;
            # un presupuesto bajo deja la respuesta vacía.
            max_tokens=8192,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error conectando con la IA: {exc}") from exc

    improved_text = _message_text(raw).strip()
    if not improved_text:
        raise HTTPException(status_code=502, detail="La IA no devolvió texto mejorado")

    return {"improved_text": improved_text}


# ─────────────────────────────────────────────────
#  EVALUACIÓN RÁPIDA — digitizar examen del profesor
# ─────────────────────────────────────────────────

@router.post("/evaluacion-rapida")
async def evaluacion_rapida(
    titulo: str = Form(default="Evaluación rápida"),
    materia_id: str = Form(default=""),
    fotos: list[UploadFile] = File(...),
    current_user: User = Depends(require_role("profesor", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Digitize a teacher's handwritten exam from 1–3 photos.
    If materia_id is provided, saves the exam and returns examen_id.
    Otherwise returns the extracted JSON without saving.
    """
    ai_config = await get_profesor_ai_config(db, str(current_user.id))
    base_url = str(ai_config.get("open_code_base_url") or "").strip()
    api_key = str(ai_config.get("open_code_api_key") or "").strip()
    model = str(
        ai_config.get("open_code_vision_model") or OPEN_CODE_RECOMMENDED_MODELS.get("vision", "Qwen3.7 Plus")
    ).strip()

    if not base_url or not api_key:
        raise HTTPException(
            status_code=400,
            detail="Configura Open Code en tu perfil para usar Evaluación Rápida.",
        )

    selected = [f for f in (fotos or []) if f and f.filename][:3]
    if not selected:
        raise HTTPException(status_code=400, detail="Sube al menos una foto del examen")

    image_payloads: list[str] = []
    for idx, upload in enumerate(selected, 1):
        if upload.content_type not in {"image/jpeg", "image/png", "image/jpg", "application/pdf"}:
            raise HTTPException(status_code=400, detail=f"Foto {idx}: tipo no soportado")
        raw = await upload.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"Foto {idx} está vacía")
        if upload.content_type == "application/pdf":
            doc = fitz.open(stream=raw, filetype="pdf")
            for pidx, page in enumerate(doc):
                if pidx >= 2:
                    break
                pix = page.get_pixmap(dpi=200)
                image_payloads.append(base64.b64encode(pix.tobytes("png")).decode("utf-8"))
            doc.close()
        else:
            png = normalize_image_to_png(raw)
            image_payloads.append(base64.b64encode(png).decode("utf-8"))

    prompt = (
        "Convierte estas fotos de un examen escolar en un examen digital editable. "
        "Extrae SOLO lo visible: preguntas, opciones, respuestas correctas si están marcadas. "
        "Usa tipos: seleccion_multiple, verdadero_falso, respuesta_corta, desarrollo. "
        "Si no hay respuesta correcta visible, usa respuesta_correcta=\"\" y requiere_revision=true. "
        "Devuelve SOLO JSON válido: "
        '{"titulo":"string","preguntas":[{"numero":1,"tipo":"seleccion_multiple","enunciado":"string",'
        '"opciones":["A) texto","B) texto"],"respuesta_correcta":"A","puntos":1,"requiere_revision":false,'
        '"image_url":"","image_prompt":"","image_type":"","image_alt":""}]} '
        "No inventes preguntas que no estén en la imagen."
    )

    try:
        exam_data = await open_code_vision_json(
            image_payloads=image_payloads,
            prompt=prompt,
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.0,
            max_tokens=4096,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo extraer el examen de la imagen: {exc}") from exc

    exam_data = _ensure_question_media_fields(normalize_latex_payload(exam_data))
    contenido, clave_respuestas = _split_exam_payload(exam_data, titulo)
    final_titulo = titulo or contenido.get("titulo") or "Evaluación rápida"

    if materia_id.strip():
        materia = await _assert_materia_access(db, materia_id, current_user)
        examen = Examen(
            materia_id=materia.id,
            titulo=final_titulo,
            tipo="digitalizado",
            contenido_json=contenido,
            clave_respuestas=clave_respuestas,
        )
        db.add(examen)
        await db.commit()
        await db.refresh(examen)
        return {
            "saved": True,
            "examen_id": str(examen.id),
            "titulo": final_titulo,
            "contenido_json": contenido,
            "clave_respuestas": clave_respuestas,
            "n_preguntas": len(contenido.get("preguntas") or []),
        }

    return {
        "saved": False,
        "examen_id": None,
        "titulo": final_titulo,
        "contenido_json": contenido,
        "clave_respuestas": clave_respuestas,
        "n_preguntas": len(contenido.get("preguntas") or []),
    }

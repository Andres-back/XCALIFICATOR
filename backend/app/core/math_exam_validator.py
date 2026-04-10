import math
import re
import unicodedata
from typing import Optional


def _strip_accents(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(text or ""))
        if unicodedata.category(c) != "Mn"
    )


def _normalize_text(text: str) -> str:
    return _strip_accents(str(text or "")).lower()


def _clean_math(text: str) -> str:
    return str(text or "").replace("$", "").strip()


def _parse_number(expr: str) -> Optional[float]:
    s = _clean_math(expr)

    frac = re.fullmatch(r"\\frac\{\s*(-?\d+(?:\.\d+)?)\s*\}\{\s*(-?\d+(?:\.\d+)?)\s*\}", s)
    if frac:
        den = float(frac.group(2))
        if den == 0:
            return None
        return float(frac.group(1)) / den

    sqrt = re.fullmatch(r"\\sqrt\{\s*(-?\d+(?:\.\d+)?)\s*\}", s)
    if sqrt:
        val = float(sqrt.group(1))
        if val < 0:
            return None
        return math.sqrt(val)

    num = re.search(r"-?\d+(?:\.\d+)?", s)
    if num:
        return float(num.group(0))

    return None


def _extract_option_value(option: str) -> Optional[float]:
    cleaned = _clean_math(option)

    assign = re.search(r"=\s*([^,;]+)$", cleaned)
    if assign:
        parsed = _parse_number(assign.group(1).strip())
        if parsed is not None:
            return parsed

    return _parse_number(cleaned)


def _parse_pmatrix(text: str) -> Optional[list[list[float]]]:
    match = re.search(r"\\begin\{pmatrix\}(.*?)\\end\{pmatrix\}", str(text or ""), flags=re.DOTALL)
    if not match:
        return None

    body = match.group(1).strip()
    if not body:
        return None

    rows_raw = [r.strip() for r in body.split("\\\\") if r.strip()]
    rows: list[list[float]] = []
    width = None

    for row_raw in rows_raw:
        cells = [c.strip() for c in row_raw.split("&")]
        parsed_row = []
        for cell in cells:
            val = _parse_number(cell)
            if val is None:
                return None
            parsed_row.append(val)

        if width is None:
            width = len(parsed_row)
        elif width != len(parsed_row):
            return None

        rows.append(parsed_row)

    return rows if rows else None


def _mat_add(a: list[list[float]], b: list[list[float]]) -> Optional[list[list[float]]]:
    if len(a) != len(b) or len(a[0]) != len(b[0]):
        return None
    out = []
    for r in range(len(a)):
        out.append([a[r][c] + b[r][c] for c in range(len(a[0]))])
    return out


def _mat_sub(a: list[list[float]], b: list[list[float]]) -> Optional[list[list[float]]]:
    if len(a) != len(b) or len(a[0]) != len(b[0]):
        return None
    out = []
    for r in range(len(a)):
        out.append([a[r][c] - b[r][c] for c in range(len(a[0]))])
    return out


def _mat_mul(a: list[list[float]], b: list[list[float]]) -> Optional[list[list[float]]]:
    if len(a[0]) != len(b):
        return None
    out = []
    for i in range(len(a)):
        row = []
        for j in range(len(b[0])):
            row.append(sum(a[i][k] * b[k][j] for k in range(len(b))))
        out.append(row)
    return out


def _same_matrix(a: list[list[float]], b: list[list[float]], tol: float = 1e-9) -> bool:
    if len(a) != len(b) or len(a[0]) != len(b[0]):
        return False
    for r in range(len(a)):
        for c in range(len(a[0])):
            if abs(a[r][c] - b[r][c]) > tol:
                return False
    return True


def _infer_for_logs(question: dict) -> Optional[str]:
    enunciado = str(question.get("enunciado") or question.get("pregunta") or "")
    options = question.get("opciones") or []
    if not isinstance(options, list) or not options:
        return None

    # Case 1: log_b(x) = n -> x
    eq = re.search(r"\\log_\{?\s*(\d+)\s*\}?\(\s*x\s*\)\s*=\s*(-?\d+(?:\.\d+)?)", enunciado)
    if eq:
        base = float(eq.group(1))
        power = float(eq.group(2))
        expected = base ** power
        for opt in options:
            val = _extract_option_value(str(opt))
            if val is not None and abs(val - expected) < 1e-6:
                return str(opt)

    # Case 2: log_b(N)
    basic = re.search(r"\\log_\{?\s*(\d+)\s*\}?\(\s*(-?\d+(?:\.\d+)?)\s*\)", enunciado)
    if basic:
        base = float(basic.group(1))
        n = float(basic.group(2))
        if base > 0 and base != 1 and n > 0:
            expected = math.log(n, base)
            for opt in options:
                val = _extract_option_value(str(opt))
                if val is not None and abs(val - expected) < 1e-6:
                    return str(opt)

    return None


def _infer_for_matrices(question: dict) -> Optional[str]:
    enunciado = str(question.get("enunciado") or question.get("pregunta") or "")
    options = question.get("opciones") or []
    if not isinstance(options, list) or not options:
        return None

    matrices = re.findall(r"\\begin\{pmatrix\}.*?\\end\{pmatrix\}", enunciado, flags=re.DOTALL)
    if len(matrices) < 2:
        return None

    a = _parse_pmatrix(matrices[0])
    b = _parse_pmatrix(matrices[1])
    if not a or not b:
        return None

    norm = _normalize_text(enunciado)
    expected = None
    if "multiplic" in norm or "\\cdot" in enunciado:
        expected = _mat_mul(a, b)
    elif re.search(r"\b[a-z]\s*\+\s*[a-z]\b", norm):
        expected = _mat_add(a, b)
    elif re.search(r"\b[a-z]\s*-\s*[a-z]\b", norm):
        expected = _mat_sub(a, b)

    if not expected:
        return None

    for opt in options:
        m = _parse_pmatrix(str(opt))
        if m and _same_matrix(expected, m):
            return str(opt)

    return None


def infer_correct_option_for_math_question(question: dict) -> Optional[str]:
    """Infer correct option for log/matrix MCQ when deterministic patterns are recognized."""
    if not isinstance(question, dict):
        return None

    if question.get("tipo") != "seleccion_multiple":
        return None

    enunciado = str(question.get("enunciado") or question.get("pregunta") or "")
    norm = _normalize_text(enunciado)

    # Try matrix first (more specific), then logarithms.
    if "matriz" in norm or "\\begin{pmatrix}" in enunciado:
        matrix_guess = _infer_for_matrices(question)
        if matrix_guess:
            return matrix_guess

    if "log" in norm or "\\log_" in enunciado:
        log_guess = _infer_for_logs(question)
        if log_guess:
            return log_guess

    return None

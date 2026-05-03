import io
import json
import cv2
import numpy as np
import httpx
import fitz  # PyMuPDF
import pdfplumber
from PIL import Image
from app.core.config import get_settings

settings = get_settings()


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Apply OpenCV preprocessing: grayscale, adaptive threshold, denoise."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("No se pudo decodificar la imagen")

    # Resize if too large
    h, w = img.shape[:2]
    max_dim = 2048
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    # Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Adaptive threshold
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )

    return thresh


def image_to_bytes(img: np.ndarray) -> bytes:
    """Convert numpy array to PNG bytes."""
    success, encoded = cv2.imencode(".png", img)
    if not success:
        raise ValueError("Error al codificar imagen")
    return encoded.tobytes()


async def ocr_with_paddle(image_bytes: bytes) -> str:
    """Send image to PaddleOCR microservice."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = {"file": ("image.png", image_bytes, "image/png")}
        response = await client.post(f"{settings.OCR_SERVICE_URL}/ocr", files=files)
        response.raise_for_status()
        result = response.json()
        return result.get("text", "")


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from digital PDF using PyMuPDF and pdfplumber."""
    text_parts = []

    # Try PyMuPDF first
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
    except Exception:
        pass

    # Fallback / supplement with pdfplumber
    if not any(t.strip() for t in text_parts):
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
        except Exception:
            pass

    return "\n".join(text_parts)


def parse_exam_text(raw_text: str) -> list[dict]:
    """Parse extracted text into structured questions and OCR-friendly answer lines."""
    import re

    lines = raw_text.strip().split("\n")
    questions_map: dict[int, dict] = {}
    current_num: int | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # Question number format: 1. Enunciado / 1) Enunciado
        q_match = re.match(r"^(\d{1,3})[.)]\s*(.+)$", line)
        if q_match:
            num = int(q_match.group(1))
            texto = q_match.group(2).strip()
            item = questions_map.get(num, {"numero": num, "texto": "", "respuesta": ""})
            item["texto"] = (item.get("texto", "") + " " + texto).strip() if item.get("texto") else texto
            questions_map[num] = item
            current_num = num
            continue

        # Explicit OCR answer line: R1: A / RESPUESTA 2: texto / R-3) valor
        ans_num_match = re.match(
            r"^(?:R|RESP|RESPUESTA|ANS)\s*[-_ ]*(\d{1,3})\s*[:.)-]\s*(.*)$",
            line,
            flags=re.IGNORECASE,
        )
        if ans_num_match:
            num = int(ans_num_match.group(1))
            answer = ans_num_match.group(2).strip()
            item = questions_map.get(num, {"numero": num, "texto": "", "respuesta": ""})
            if answer:
                item["respuesta"] = (
                    (item.get("respuesta", "") + " " + answer).strip()
                    if item.get("respuesta")
                    else answer
                )
            questions_map[num] = item
            current_num = num
            continue

        # Generic answer marker attached to current question
        ans_inline_match = re.match(r"^(?:R|RESPUESTA|RESP|ANS|→)\s*[:\-/]?\s*(.*)$", line, flags=re.IGNORECASE)
        if ans_inline_match and current_num is not None:
            answer = ans_inline_match.group(1).strip()
            item = questions_map.get(current_num, {"numero": current_num, "texto": "", "respuesta": ""})
            if answer:
                item["respuesta"] = (
                    (item.get("respuesta", "") + " " + answer).strip()
                    if item.get("respuesta")
                    else answer
                )
            questions_map[current_num] = item
            continue

        # Continuation line: attach to question text or answer
        if current_num is not None:
            item = questions_map.get(current_num, {"numero": current_num, "texto": "", "respuesta": ""})
            if item.get("respuesta"):
                item["respuesta"] = (item["respuesta"] + " " + line).strip()
            else:
                item["texto"] = (item.get("texto", "") + " " + line).strip() if item.get("texto") else line
            questions_map[current_num] = item

    return [questions_map[num] for num in sorted(questions_map.keys())]


def _assess_ocr_quality(text: str, preguntas: list[dict]) -> tuple[str, str]:
    """
    Evaluate OCR extraction quality.
    Returns (quality: 'alta'|'media'|'baja', motivo: str)

    Heuristics:
    - Very little text extracted → baja
    - No numbered questions found → baja
    - Most answers are blank → baja (can't read handwriting)
    - Many answers blank → media (image partially unreadable)
    - Otherwise → alta
    """
    texto_len = len(text.strip())
    n_preguntas = len(preguntas)

    if texto_len < 50:
        return "baja", "Texto insuficiente extraído de la imagen (imagen borrosa o ilegible)"

    if n_preguntas == 0:
        return "baja", "No se detectaron preguntas numeradas — verifique que la imagen sea legible"

    blank_answers = sum(1 for p in preguntas if not (p.get("respuesta") or "").strip())
    blank_ratio = blank_answers / n_preguntas

    if blank_ratio >= 0.8:
        pct = int(blank_ratio * 100)
        return "baja", (
            f"{pct}% de las respuestas no pudieron leerse — "
            "imagen posiblemente borrosa, mal enfocada o escritura poco legible"
        )

    if blank_ratio >= 0.5:
        pct = int(blank_ratio * 100)
        return "media", (
            f"{pct}% de las respuestas son difíciles de leer — "
            "se recomienda verificar la calificación manualmente"
        )

    avg_chars = texto_len / n_preguntas
    if avg_chars < 8:
        return "media", "Texto muy corto por pregunta — posible imagen borrosa o escritura fragmentada"

    return "alta", ""


async def process_exam_image(file_bytes: bytes, filename: str) -> dict:
    """Full pipeline: preprocess → OCR → parse → quality assessment."""
    is_pdf = filename.lower().endswith(".pdf")

    if is_pdf:
        # Try digital extraction first
        text = extract_text_from_pdf(file_bytes)
        if text.strip():
            writing_type = "impreso"
        else:
            # PDF with scanned images - convert pages to images
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            all_text = []
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                img_bytes = pix.tobytes("png")
                processed = preprocess_image(img_bytes)
                proc_bytes = image_to_bytes(processed)
                page_text = await ocr_with_paddle(proc_bytes)
                all_text.append(page_text)
            doc.close()
            text = "\n".join(all_text)
            writing_type = "manuscrito"
    else:
        # Image processing
        processed = preprocess_image(file_bytes)
        proc_bytes = image_to_bytes(processed)
        text = await ocr_with_paddle(proc_bytes)
        writing_type = "manuscrito"

    questions = parse_exam_text(text)
    ocr_quality, ocr_motivo = _assess_ocr_quality(text, questions)

    return {
        "texto_extraido": text,
        "preguntas": questions,
        "tipo_escritura": writing_type,
        "ocr_quality": ocr_quality,   # 'alta' | 'media' | 'baja'
        "ocr_motivo": ocr_motivo,     # human-readable reason (empty string when alta)
    }

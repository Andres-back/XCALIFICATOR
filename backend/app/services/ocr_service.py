import io
import base64
import cv2
import numpy as np
import httpx
import fitz  # PyMuPDF
import pdfplumber
from groq import Groq
from app.core.config import get_settings

settings = get_settings()
groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

OCR_PROVIDER_OPTIONS = {"paddleocr", "groq_vision", "ollama_vision"}
DEFAULT_GROQ_OCR_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


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


async def ocr_with_groq_vision(image_bytes: bytes, model: str = DEFAULT_GROQ_OCR_MODEL) -> str:
    """Extract text using a Groq vision-capable model."""
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY no configurada para OCR por visión")

    encoded = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:image/png;base64,{encoded}"
    prompt = (
        "Extrae TODO el texto visible de la imagen. "
        "Devuelve solo texto plano, preservando el orden de lectura, "
        "una línea por renglón y sin comentarios adicionales."
    )

    chat = groq_client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
    )
    return (chat.choices[0].message.content or "").strip()


async def ocr_with_ollama_vision(
    image_bytes: bytes,
    model: str | None = None,
    ollama_url: str = "http://host.docker.internal:11434",
    ollama_api_key: str | None = None,
) -> str:
    """Extract text using an Ollama multimodal model."""
    selected_model = str(model or "").strip()
    if not selected_model:
        raise ValueError("No hay modelo Ollama configurado para OCR")

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "model": selected_model,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Extrae TODO el texto visible de la imagen. "
                    "Devuelve solo texto plano, preservando el orden de lectura, "
                    "una línea por renglón y sin comentarios."
                ),
                "images": [image_b64],
            }
        ],
    }

    base_url = (ollama_url or "").strip().rstrip("/")
    if not base_url:
        base_url = "http://host.docker.internal:11434"

    async with httpx.AsyncClient(timeout=90.0) as client:
        headers = {"Authorization": f"Bearer {ollama_api_key}"} if ollama_api_key else None
        response = await client.post(f"{base_url}/api/chat", json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()

    return (((result or {}).get("message") or {}).get("content") or "").strip()


async def _ocr_with_provider(
    image_bytes: bytes,
    provider: str,
    model: str,
    ollama_url: str,
    ollama_api_key: str | None,
) -> str:
    if provider == "paddleocr":
        return await ocr_with_paddle(image_bytes)
    if provider == "groq_vision":
        selected_model = model or DEFAULT_GROQ_OCR_MODEL
        return await ocr_with_groq_vision(image_bytes, selected_model)
    if provider == "ollama_vision":
        return await ocr_with_ollama_vision(image_bytes, model, ollama_url, ollama_api_key)
    raise ValueError(f"Proveedor OCR no soportado: {provider}")


async def _ocr_with_fallback(image_bytes: bytes, provider_config: dict | None = None) -> str:
    cfg = provider_config or {}
    primary = str(cfg.get("ocr_provider") or "groq_vision").strip().lower()
    if primary not in OCR_PROVIDER_OPTIONS:
        primary = "groq_vision"

    fallback = cfg.get("ocr_fallback_provider")
    fallback = str(fallback).strip().lower() if fallback else None
    if fallback and fallback not in OCR_PROVIDER_OPTIONS:
        fallback = None

    primary_model = str(cfg.get("ocr_model") or "").strip()
    fallback_model = str(cfg.get("ocr_fallback_model") or "").strip()
    ollama_url = str(cfg.get("ollama_url") or "http://host.docker.internal:11434").strip()
    ollama_api_key = str(cfg.get("ollama_api_key") or "").strip() or None

    attempts: list[tuple[str, str]] = [(primary, primary_model)]
    if fallback and fallback != "none":
        if fallback != primary or fallback_model != primary_model:
            attempts.append((fallback, fallback_model))

    errors = []
    for provider, model in attempts:
        try:
            text = await _ocr_with_provider(image_bytes, provider, model, ollama_url, ollama_api_key)
            if isinstance(text, str) and text.strip():
                return text
            errors.append(f"{provider}({model or 'sin_modelo'}): texto vacío")
        except Exception as exc:
            errors.append(f"{provider}({model or 'sin_modelo'}): {str(exc)}")

    raise RuntimeError("No fue posible extraer texto con OCR configurado. " + " | ".join(errors))


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
    questions_map: dict = {}
    current_num: int | None = None

    # Accept custom OCR prefixes (1-4 letters) plus common keywords like RESPUESTA.
    answer_prefix_pattern = re.compile(
        r"^(?:[A-Z]{1,4}|RESPUESTA|RESP|ANS)\s*[-_ ]*(\d{1,3})\s*([HV])?\s*[:.)-]\s*(.*)$",
        flags=re.IGNORECASE,
    )

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
        ans_num_match = answer_prefix_pattern.match(line)
        if ans_num_match:
            num = int(ans_num_match.group(1))
            direction = (ans_num_match.group(2) or "").strip().upper()
            answer = ans_num_match.group(3).strip()
            if direction:
                answer = f"{direction}: {answer}" if answer else direction
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

    numeric_keys = [key for key in questions_map.keys() if isinstance(key, int)]
    extra_keys = [key for key in questions_map.keys() if not isinstance(key, int)]

    ordered = [questions_map[num] for num in sorted(numeric_keys)]
    ordered.extend(questions_map[key] for key in sorted(extra_keys, key=lambda v: str(v)))
    return ordered


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


async def process_exam_image(file_bytes: bytes, filename: str, provider_config: dict | None = None) -> dict:
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
                page_text = await _ocr_with_fallback(proc_bytes, provider_config)
                all_text.append(page_text)
            doc.close()
            text = "\n".join(all_text)
            writing_type = "manuscrito"
    else:
        # Image processing
        processed = preprocess_image(file_bytes)
        proc_bytes = image_to_bytes(processed)
        text = await _ocr_with_fallback(proc_bytes, provider_config)
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

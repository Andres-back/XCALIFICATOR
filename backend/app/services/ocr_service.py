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
    """Parse extracted text into structured questions and answers."""
    lines = raw_text.strip().split("\n")
    questions = []
    current_q = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Detect question numbers: 1., 2., 1), 2), etc.
        import re
        match = re.match(r"^(\d+)[.)]\s*(.*)", line)
        if match:
            if current_q:
                questions.append(current_q)
            current_q = {
                "numero": int(match.group(1)),
                "texto": match.group(2),
                "respuesta": "",
            }
        elif current_q:
            # Check if it's an answer line
            if line.startswith(("R:", "Respuesta:", "R/", "→")):
                current_q["respuesta"] = line.split(":", 1)[-1].strip() if ":" in line else line[1:].strip()
            else:
                current_q["texto"] += " " + line

    if current_q:
        questions.append(current_q)

    return questions


async def process_exam_image(file_bytes: bytes, filename: str) -> dict:
    """Full pipeline: preprocess → OCR → parse."""
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

    return {
        "texto_extraido": text,
        "preguntas": questions,
        "tipo_escritura": writing_type,
    }

import json
import re
import base64
import logging
import cv2
import numpy as np
import httpx
import fitz  # PyMuPDF
from groq import Groq
from app.core.config import get_settings, normalize_ollama_native_url
from app.services.open_code_service import (
    OPEN_CODE_RECOMMENDED_MODELS,
    open_code_vision_json,
)

settings = get_settings()
logger = logging.getLogger(__name__)

OCR_PROVIDER_OPTIONS = {"groq_vision", "ollama_vision", "open_code_vision"}
DEFAULT_OLLAMA_OCR_MODEL = "gemma3"
DEFAULT_GROQ_OCR_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
DEFAULT_OPEN_CODE_VISION_MODEL = OPEN_CODE_RECOMMENDED_MODELS["vision"]


def _groq_client(api_key: str | None = None) -> Groq:
    selected_api_key = str(api_key or settings.GROQ_API_KEY or "").strip()
    if not selected_api_key:
        raise RuntimeError("GROQ_API_KEY no configurada para OCR por vision")
    return Groq(api_key=selected_api_key)


def normalize_image_to_png(image_bytes: bytes) -> bytes:
    """Decode and re-encode as PNG without thresholding, preserving handwriting detail."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar la imagen")

    h, w = img.shape[:2]
    max_dim = 2048
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


async def _vision_json_extract(
    images_b64: list[str],
    prompt: str,
    provider: str,
    model: str,
    cfg: dict,
) -> dict:
    """Call a vision provider expecting JSON output."""
    if provider == "open_code_vision":
        base_url = str(cfg.get("open_code_base_url") or settings.OPEN_CODE_BASE_URL or "").strip()
        api_key = str(cfg.get("open_code_api_key") or settings.OPEN_CODE_API_KEY or "").strip() or None
        return await open_code_vision_json(
            image_payloads=images_b64,
            prompt=prompt,
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.0,
            max_tokens=2048,
        )

    if provider == "ollama_vision":
        ollama_url = str(cfg.get("ollama_url") or "http://host.docker.internal:11434").strip()
        ollama_api_key = str(cfg.get("ollama_api_key") or "").strip() or None
        base_url = normalize_ollama_native_url(ollama_url)
        payload = {
            "model": model,
            "stream": False,
            "format": "json",
            "messages": [{"role": "user", "content": prompt, "images": images_b64}],
        }
        headers = {"Authorization": f"Bearer {ollama_api_key}"} if ollama_api_key else None
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{base_url}/api/chat", json=payload, headers=headers)
            resp.raise_for_status()
            text = (((resp.json() or {}).get("message") or {}).get("content") or "").strip()
        try:
            return json.loads(text)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", text)
            if m:
                return json.loads(m.group(0))
            raise ValueError("Ollama no devolvió JSON válido")

    # groq_vision
    groq_api_key = str(cfg.get("groq_api_key") or settings.GROQ_API_KEY or "").strip() or None
    content_parts: list[dict] = [{"type": "text", "text": prompt}]
    for img_b64 in images_b64:
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{img_b64}"},
        })
    chat = _groq_client(groq_api_key).chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content_parts}],  # type: ignore[arg-type]
        temperature=0.0,
        max_tokens=2048,
        response_format={"type": "json_object"},
    )
    text = (chat.choices[0].message.content or "").strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise ValueError("Groq no devolvió JSON válido")


async def direct_vision_extract_exam_answers(
    file_bytes: bytes,
    filename: str,
    preguntas: list[dict],
    provider_config: dict | None = None,
) -> dict:
    """
    Send the exam image directly to a vision model and get structured answers back.
    Skips text OCR + regex parsing entirely — the model reads the image and returns JSON.

    Returns: {texto_extraido, preguntas, tipo_escritura, ocr_quality, ocr_motivo}
    """
    cfg = provider_config or {}
    provider = str(cfg.get("ocr_provider") or "open_code_vision").strip().lower()
    if provider not in {"open_code_vision", "ollama_vision", "groq_vision"}:
        provider = "open_code_vision"

    model = str(
        cfg.get("ocr_model")
        or cfg.get("open_code_vision_model")
        or (DEFAULT_OPEN_CODE_VISION_MODEL if provider == "open_code_vision" else "")
        or (DEFAULT_GROQ_OCR_MODEL if provider == "groq_vision" else "")
        or DEFAULT_OLLAMA_OCR_MODEL
    ).strip()

    # Build question context so the model knows what numbers to look for
    preguntas_ctx: list[dict] = []
    for p in preguntas:
        if not isinstance(p, dict):
            continue
        num = p.get("numero")
        if num is None:
            continue
        item: dict = {"numero": num}
        tipo = p.get("tipo", "")
        if tipo:
            item["tipo"] = tipo
        opciones = p.get("opciones")
        if isinstance(opciones, list) and opciones:
            item["opciones"] = [
                str(o.get("letra", o) if isinstance(o, dict) else o) for o in opciones
            ]
        preguntas_ctx.append(item)

    context_str = json.dumps(preguntas_ctx, ensure_ascii=False) if preguntas_ctx else "[]"

    prompt = (
        "Eres un corrector de exámenes. Analiza la imagen del examen resuelto por el estudiante.\n"
        "Extrae EXACTAMENTE lo que el estudiante escribió o marcó para cada número de pregunta.\n\n"
        "REGLAS:\n"
        "- seleccion_multiple: devuelve solo la letra minúscula marcada (a, b, c, d)\n"
        "- verdadero_falso: devuelve 'verdadero' o 'falso'\n"
        "- preguntas abiertas: devuelve exactamente lo que el estudiante escribió\n"
        "- Si no puedes leer la respuesta claramente, usa null\n"
        "- NO inventes ni completes respuestas\n"
        "- Incluye TODAS las preguntas del listado aunque no tengan respuesta\n\n"
        'Devuelve SOLO JSON con este schema exacto:\n{"preguntas": [{"numero": 1, "respuesta": "b"}, {"numero": 2, "respuesta": null}]}\n\n'
        f"Preguntas del examen: {context_str}"
    )

    # Encode image(s) to base64
    images_b64: list[str] = []
    is_pdf = filename.lower().endswith(".pdf")
    if is_pdf:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for idx, page in enumerate(doc):
            if idx >= 3:
                break
            pix = page.get_pixmap(dpi=200)
            images_b64.append(base64.b64encode(pix.tobytes("png")).decode("utf-8"))
        doc.close()
    else:
        norm = normalize_image_to_png(file_bytes)
        images_b64.append(base64.b64encode(norm).decode("utf-8"))

    if not images_b64:
        raise ValueError("No se pudo preparar la imagen para extracción directa por visión")

    data = await _vision_json_extract(images_b64, prompt, provider, model, cfg)

    preguntas_raw = data.get("preguntas") if isinstance(data, dict) else []
    preguntas_raw = preguntas_raw if isinstance(preguntas_raw, list) else []

    structured: list[dict] = []
    for p in preguntas_raw:
        if not isinstance(p, dict):
            continue
        num = p.get("numero")
        resp = p.get("respuesta")
        if num is None:
            continue
        structured.append({
            "numero": num,
            "texto": "",
            "respuesta": str(resp).strip() if resp is not None else "",
        })

    # Quality assessment based on how many answers were extracted
    expected = len(preguntas_ctx)
    answered = sum(1 for p in structured if p.get("respuesta"))

    if not structured or (expected > 0 and answered == 0):
        quality: str = "baja"
        motivo: str = "El modelo de visión no extrajo respuestas — imagen posiblemente ilegible"
    elif expected > 0 and answered < expected * 0.3:
        quality = "baja"
        motivo = f"Solo {answered}/{expected} respuestas detectadas — verificar imagen"
    elif expected > 0 and answered < expected * 0.6:
        quality = "media"
        motivo = f"{answered}/{expected} respuestas detectadas — verificar manualmente"
    else:
        quality = "alta"
        motivo = ""

    return {
        "texto_extraido": "",
        "preguntas": structured,
        "tipo_escritura": "manuscrito",
        "ocr_quality": quality,
        "ocr_motivo": motivo,
    }

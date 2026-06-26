from __future__ import annotations

import base64
import httpx

from app.core.config import get_settings

settings = get_settings()

_IMAGES_URL = "https://api.openai.com/v1/images/generations"

# OpenAI queda RESTRINGIDO a generación de imágenes, en calidad "low" por economía.
# Modelos gpt-image-* devuelven b64_json de forma nativa y aceptan quality/output_format/
# moderation. Los modelos dall-e-* (legacy) usan response_format y no aceptan quality.


def _is_gpt_image(model: str) -> bool:
    return model.lower().startswith("gpt-image")


async def openai_image_generate(
    prompt: str,
    api_key: str,
    *,
    model: str | None = None,
    quality: str | None = None,
    size: str | None = None,
    output_format: str | None = None,
    moderation: str | None = None,
    timeout_seconds: float = 40.0,
) -> tuple[bytes, str]:
    """Genera una imagen con la API de OpenAI (gpt-image en low por defecto).

    Devuelve (bytes, content_type). Lanza ValueError en error de API.
    """
    model = (model or settings.OPENAI_IMAGE_MODEL or "gpt-image-1").strip()
    quality = (quality or settings.OPENAI_IMAGE_QUALITY or "low").strip()
    size = (size or settings.OPENAI_IMAGE_SIZE or "1024x1024").strip()
    fmt = (output_format or settings.OPENAI_IMAGE_FORMAT or "jpeg").strip().lower()
    moderation = (moderation or settings.OPENAI_IMAGE_MODERATION or "low").strip().lower()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    if _is_gpt_image(model):
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "quality": quality,
            "output_format": fmt,
            "moderation": moderation,
        }
    else:
        # Legacy dall-e-* fallback (no soporta quality/output_format)
        payload = {
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": size if "x" in size else "1024x1024",
            "response_format": "b64_json",
        }
        fmt = "png"

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.post(_IMAGES_URL, json=payload, headers=headers)

    if response.status_code >= 400:
        raise ValueError(f"OpenAI image error {response.status_code}: {response.text[:300]}")

    data = response.json()
    b64 = ((data.get("data") or [{}])[0].get("b64_json") or "").strip()
    if not b64:
        raise ValueError("OpenAI no devolvió imagen en base64")

    content_type = "image/jpeg" if fmt in ("jpeg", "jpg") else f"image/{fmt}"
    return base64.b64decode(b64), content_type


async def openai_dalle_generate(
    prompt: str,
    api_key: str,
    model: str | None = None,
    size: str | None = None,
) -> bytes:
    """Compat: devuelve solo bytes (usa la API gpt-image en low)."""
    image_bytes, _ = await openai_image_generate(
        prompt, api_key, model=model, size=size
    )
    return image_bytes

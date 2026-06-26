import asyncio
import base64
import hashlib
import html
import io
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.dependencies import require_role
from app.models.models import User

settings = get_settings()
router = APIRouter(tags=["AI Assets"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_CLOUDFLARE_IMAGE_MODEL = "@cf/bytedance/stable-diffusion-xl-lightning"
DEFAULT_CLOUDFLARE_IMAGE_FALLBACK_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0"
ALLOWED_BETA_CLOUDFLARE_IMAGE_MODELS = {
    DEFAULT_CLOUDFLARE_IMAGE_MODEL,
    DEFAULT_CLOUDFLARE_IMAGE_FALLBACK_MODEL,
}

PEOPLE_IMAGE_TERMS = (
    "persona", "personas", "person", "people", "humano", "humana", "human",
    "estudiante", "estudiantes", "student", "students", "profesor", "profesora",
    "teacher", "docente", "maestro", "maestra", "niño", "niña", "niños", "niñas",
    "nino", "nina", "child", "children", "kid", "boy", "girl", "aula", "classroom",
    "rostro", "cara", "face", "familia", "padre", "madre", "familiares",
)

OPENAI_DETAIL_TERMS = (
    "texto", "text", "letra", "letter", "palabra", "word", "rotulo", "rótulo",
    "label", "formula", "fórmula", "ecuacion", "ecuación", "equation",
    "matemat", "quimic", "químic", "molecula", "molécula", "molecule", "tabla",
    "table", "grafica", "gráfica", "chart", "diagrama", "diagram", "mapa",
    "timeline", "linea de tiempo", "línea de tiempo", "worksheet", "ficha",
    "detalle", "detailed", "preciso", "exact", "pizarra con", "whiteboard with",
)


def _norm_text(value: str) -> str:
    compact = re.sub(r"\s+", " ", str(value or "").lower()).strip()
    return f" {compact} "


def _has_people_context(text: str) -> bool:
    normalized = _norm_text(text)
    return any(term in normalized for term in PEOPLE_IMAGE_TERMS)


def _needs_openai_detail(text: str) -> bool:
    normalized = _norm_text(text)
    return any(term in normalized for term in OPENAI_DETAIL_TERMS)


def _balanced_openai_slot(text: str) -> bool:
    digest = hashlib.sha256(_norm_text(text).encode("utf-8")).digest()
    return digest[0] % 2 == 0


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1200)
    mode: Literal["illustration", "diagram", "graph"] = "diagram"
    materia_id: Optional[str] = None
    question_id: Optional[str] = None


def _asset_dir() -> Path:
    root = Path(settings.UPLOAD_DIR) / "question-assets"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _public_url(filename: str) -> str:
    return f"/uploads/question-assets/{filename}"


def _safe_ext(content_type: str) -> str:
    ctype = (content_type or "").lower()
    if ctype in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if ctype == "image/webp":
        return ".webp"
    return ".png"


def classify_image_policy(prompt: str, *, kind: str = "general") -> str:
    """Return cloudflare_first or openai_first for educational image generation.

    Calidad primero:
    - Personas/escenas de aula -> OpenAI primero.
    - Texto, formulas, diagramas o detalle tecnico -> OpenAI primero.
    - Ilustraciones simples -> balance 50/50 aproximado para usar Cloudflare.
    """
    text = f"{kind} {prompt}".lower()
    if _has_people_context(text) or _needs_openai_detail(text):
        return "openai_first"
    if kind in {"coloring_letters", "diagram", "graph", "exercise"}:
        return "openai_first"
    return "openai_first" if _balanced_openai_slot(text) else "cloudflare_first"


def _enhance_prompt(prompt: str, *, kind: str = "general") -> str:
    base = re.sub(r"\s+", " ", str(prompt or "")).strip()
    people = _has_people_context(base)
    if kind == "coloring":
        return (
            f"{base}. Printable educational coloring worksheet, clean black and white line art, "
            "thick outlines, white background, age appropriate, no watermark."
        )
    if kind == "slide":
        people_rules = (
            " classroom scene with natural faces and hands, fully clothed people, "
            "clean blank board or simple shapes on board, no readable text inside the image,"
            if people
            else " clear visual metaphor, no people unless explicitly needed,"
        )
        return (
            f"{base}. Friendly educational cartoon illustration for a Spanish classroom slide, "
            f"textbook style,{people_rules} complete subject inside frame, no crop, "
            "wholesome and age-appropriate, no watermark."
        )
    if kind == "exercise":
        return (
            f"{base}. Educational exercise visual, accurate, clean composition, readable if labels are needed, "
            "no clutter, no watermark."
        )
    return (
        f"{base}. Educational, kid-friendly, clear composition, complete subject inside frame, "
        "no watermark, no unnecessary text."
    )


def _simple_svg(prompt: str, mode: str) -> bytes:
    clean = html.escape(prompt.strip())
    title = "Grafica educativa" if mode == "graph" else "Diagrama educativo"
    words = [w for w in re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+", prompt) if len(w) > 2][:6]
    if not words:
        words = ["Idea", "Ejemplo", "Resultado"]

    if mode == "graph":
        bars = []
        max_h = 190
        for idx, word in enumerate(words[:5]):
            value = 40 + ((idx * 37 + len(word) * 11) % 140)
            x = 80 + idx * 105
            y = 300 - value
            bars.append(
                f'<rect x="{x}" y="{y}" width="62" height="{value}" rx="8" fill="#2563eb"/>'
                f'<text x="{x + 31}" y="326" text-anchor="middle" font-size="16" fill="#111827">{html.escape(word[:10])}</text>'
            )
        body = "".join(bars) + f'<line x1="55" y1="300" x2="650" y2="300" stroke="#111827" stroke-width="3"/>'
    else:
        nodes = []
        connectors = []
        coords = [(120, 190), (320, 95), (520, 190), (320, 285)]
        for idx, word in enumerate(words[:4]):
            x, y = coords[idx]
            nodes.append(
                f'<rect x="{x-72}" y="{y-34}" width="144" height="68" rx="16" fill="#ecfeff" stroke="#0891b2" stroke-width="3"/>'
                f'<text x="{x}" y="{y+6}" text-anchor="middle" font-size="18" font-weight="700" fill="#0f172a">{html.escape(word[:14])}</text>'
            )
            if idx > 0:
                px, py = coords[idx - 1]
                connectors.append(f'<line x1="{px}" y1="{py}" x2="{x}" y2="{y}" stroke="#64748b" stroke-width="3"/>')
        body = "".join(connectors + nodes)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
  <rect width="720" height="420" fill="#ffffff"/>
  <text x="360" y="48" text-anchor="middle" font-size="28" font-weight="800" fill="#111827">{title}</text>
  <text x="360" y="82" text-anchor="middle" font-size="15" fill="#475569">{clean[:120]}</text>
  {body}
</svg>'''
    return svg.encode("utf-8")


async def _generate_openai_image(prompt: str, api_key: str, *, model: str | None = None) -> tuple[bytes, str]:
    """OpenAI gpt-image (calidad low por economia). Devuelve (bytes, content_type)."""
    from app.services.openai_service import openai_image_generate
    return await openai_image_generate(prompt, api_key, model=model)


def _openai_model_candidates(*, people: bool) -> list[str | None]:
    candidates: list[str | None] = []
    if people:
        candidates.append((settings.OPENAI_IMAGE_PEOPLE_MODEL or "gpt-image-2").strip())
    candidates.append((settings.OPENAI_IMAGE_MODEL or "gpt-image-1").strip())
    candidates.append(None)
    unique: list[str | None] = []
    for item in candidates:
        if item not in unique:
            unique.append(item)
    return unique


async def _generate_image_bytes_with_policy(
    prompt: str,
    openai_api_key: str = "",
    cloudflare: dict | None = None,
    *,
    kind: str = "general",
) -> tuple[bytes, str, str, str]:
    """Hybrid image generation: Cloudflare for simple images, OpenAI for precision."""
    enhanced_prompt = _enhance_prompt(prompt, kind=kind)
    people = _has_people_context(prompt)
    policy = classify_image_policy(prompt, kind=kind)
    attempts = ("openai", "cloudflare") if policy == "openai_first" else ("cloudflare", "openai")
    last_error: Exception | None = None

    for provider in attempts:
        try:
            if provider == "openai":
                if not openai_api_key:
                    continue
                provider_error: Exception | None = None
                for model in _openai_model_candidates(people=people):
                    try:
                        img_bytes, content_type = await _generate_openai_image(
                            enhanced_prompt,
                            openai_api_key,
                            model=model,
                        )
                        return img_bytes, content_type, provider, policy
                    except Exception as exc:
                        provider_error = exc
                        logging.getLogger(__name__).warning(
                            "OpenAI image model %s failed; people=%s policy=%s: %s",
                            model or settings.OPENAI_IMAGE_MODEL or "default",
                            people,
                            policy,
                            exc,
                        )
                if provider_error:
                    raise provider_error
            else:
                img_bytes, content_type = await _generate_cloudflare_image(enhanced_prompt, cloudflare)
            return img_bytes, content_type, provider, policy
        except Exception as exc:
            last_error = exc
            logging.getLogger(__name__).warning(
                "Image provider %s failed; policy=%s: %s",
                provider,
                policy,
                exc,
            )

    if last_error:
        raise last_error
    raise HTTPException(status_code=400, detail="No hay proveedor de imagen configurado")


async def _generate_image_bytes(
    prompt: str, openai_api_key: str = "", cloudflare: dict | None = None
) -> tuple[bytes, str]:
    img_bytes, content_type, _provider, _policy = await _generate_image_bytes_with_policy(
        prompt,
        openai_api_key=openai_api_key,
        cloudflare=cloudflare,
    )
    return img_bytes, content_type



async def generate_coloring_image(
    prompt: str, openai_api_key: str = "", cloudflare: dict | None = None
) -> str:
    """Generate a coloring page, save to disk, return public URL. Empty string on failure."""
    try:
        img_bytes, content_type = await _generate_image_bytes(
            prompt, openai_api_key=openai_api_key, cloudflare=cloudflare
        )
        filename = f"{uuid.uuid4().hex}{_safe_ext(content_type)}"
        path = _asset_dir() / filename
        path.write_bytes(img_bytes)
        return _public_url(filename)
    except Exception:
        return ""


async def generate_coloring_image_asset(
    prompt: str,
    openai_api_key: str = "",
    cloudflare: dict | None = None,
    *,
    allow_text: bool = False,
) -> dict:
    """Generate a coloring image and return non-sensitive generation metadata."""
    kind = "coloring_letters" if allow_text else "coloring"
    try:
        img_bytes, content_type, provider, policy = await _generate_image_bytes_with_policy(
            prompt,
            openai_api_key=openai_api_key,
            cloudflare=cloudflare,
            kind=kind,
        )
        filename = f"{uuid.uuid4().hex}{_safe_ext(content_type)}"
        (_asset_dir() / filename).write_bytes(img_bytes)
        return {
            "url": _public_url(filename),
            "image_provider": provider,
            "image_policy": policy,
            "image_prompt": prompt,
        }
    except Exception:
        try:
            img_bytes = _placeholder_image_bytes(prompt)
            filename = f"{uuid.uuid4().hex}.jpg"
            (_asset_dir() / filename).write_bytes(img_bytes)
            return {
                "url": _public_url(filename),
                "image_provider": "placeholder",
                "image_policy": classify_image_policy(prompt, kind=kind),
                "image_prompt": prompt,
            }
        except Exception:
            pass
        return {
            "url": "",
            "image_provider": "none",
            "image_policy": classify_image_policy(prompt, kind=kind),
            "image_prompt": prompt,
        }


async def _generate_cloudflare_image(prompt: str, cloudflare: dict | None = None) -> tuple[bytes, str]:
    """Generate an image via Cloudflare Workers AI.

    Reads credentials/models from the admin/profesor config (DB) first, falling back
    to environment settings so deployments configured only via env keep working.
    """
    cf = cloudflare or {}
    account_id = (str(cf.get("cloudflare_account_id") or "").strip() or settings.CLOUDFLARE_ACCOUNT_ID.strip())
    token = (str(cf.get("cloudflare_api_token") or "").strip() or settings.CLOUDFLARE_API_TOKEN.strip())
    if not account_id or not token:
        raise HTTPException(
            status_code=400,
            detail="Cloudflare Workers AI no esta configurado. Agrega Account ID y API Token en Configuracion IA (o por variables de entorno).",
        )

    configured_models = [
        (str(cf.get("cloudflare_image_model") or "").strip() or settings.CLOUDFLARE_IMAGE_MODEL.strip()) or DEFAULT_CLOUDFLARE_IMAGE_MODEL,
        (str(cf.get("cloudflare_image_fallback_model") or "").strip() or settings.CLOUDFLARE_IMAGE_FALLBACK_MODEL.strip()) or DEFAULT_CLOUDFLARE_IMAGE_FALLBACK_MODEL,
    ]
    models: list[str] = []
    for configured_model in configured_models:
        model = configured_model if configured_model in ALLOWED_BETA_CLOUDFLARE_IMAGE_MODELS else DEFAULT_CLOUDFLARE_IMAGE_MODEL
        if model not in models:
            models.append(model)
    if DEFAULT_CLOUDFLARE_IMAGE_FALLBACK_MODEL not in models:
        models.append(DEFAULT_CLOUDFLARE_IMAGE_FALLBACK_MODEL)

    payload = {
        "prompt": prompt,
        "negative_prompt": "text, watermark, logo, blurry, violent, inappropriate",
        "height": 1024,
        "width": 1024,
    }
    headers = {"Authorization": f"Bearer {token}"}
    last_error = ""
    async with httpx.AsyncClient(timeout=90.0) as client:
        for model in models:
            url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code >= 400:
                last_error = f"{response.status_code}: {response.text[:180]}"
                continue

            content_type = response.headers.get("content-type", "")
            if content_type.startswith("image/"):
                return response.content, content_type

            data = response.json() if response.content else {}
            image_b64 = ((data.get("result") or {}).get("image") or data.get("image") or "").strip()
            if image_b64:
                return base64.b64decode(image_b64), "image/jpeg"
            last_error = "Cloudflare no devolvio imagen"
    raise HTTPException(status_code=502, detail=f"Cloudflare Workers AI no genero imagen con modelos Beta: {last_error}")


@router.post("/uploads/question-image")
async def upload_question_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Solo se permiten imagenes PNG, JPG o WEBP")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Imagen vacia")
    filename = f"{uuid.uuid4().hex}{_safe_ext(file.content_type or '')}"
    path = _asset_dir() / filename
    path.write_bytes(content)
    return {"url": _public_url(filename), "image_type": "uploaded", "image_alt": file.filename or "Imagen de pregunta"}


@router.post("/ai/images/generate")
async def generate_question_image(
    payload: ImageGenerationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    prompt = payload.prompt.strip()
    if payload.mode in {"diagram", "graph"}:
        filename = f"{uuid.uuid4().hex}.svg"
        (_asset_dir() / filename).write_bytes(_simple_svg(prompt, payload.mode))
        return {
            "url": _public_url(filename),
            "image_type": payload.mode,
            "image_prompt": prompt,
            "image_alt": prompt,
        }

    # Profesores use their own override; admins use the global config.
    profesor_id = str(current_user.id) if current_user.rol == "profesor" else None
    ai_cfg = await get_profesor_ai_config(db, profesor_id)
    image_bytes, content_type, provider, policy = await _generate_image_bytes_with_policy(
        prompt,
        openai_api_key=str(ai_cfg.get("openai_api_key") or settings.OPENAI_API_KEY or "").strip(),
        cloudflare=ai_cfg,
        kind="exercise",
    )
    filename = f"{uuid.uuid4().hex}{_safe_ext(content_type)}"
    (_asset_dir() / filename).write_bytes(image_bytes)
    return {
        "url": _public_url(filename),
        "image_type": "generated",
        "image_provider": provider,
        "image_policy": policy,
        "image_prompt": prompt,
        "image_alt": prompt,
    }


# ─────────────────────────────────────────────────────────────────────
#  PROXY DE IMÁGENES PARA PRESENTON (OpenAI-compatible)
#  Presenton (proveedor open_webui) llama aquí para generar imágenes de
#  diapositivas. Reutiliza la key de OpenAI guardada en la config global
#  (DB) y nuestro pipeline gpt-image low — sin duplicar la key en env.
# ─────────────────────────────────────────────────────────────────────

class _OpenAIImageProxyRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    n: int = 1
    size: Optional[str] = None


def _presenton_image_cache_dir() -> Path:
    path = Path(settings.UPLOAD_DIR) / "presenton_image_cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_key(prompt: str) -> str:
    return hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()


def _placeholder_image_bytes(prompt: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (1024, 1024), "#f8fafc")
    draw = ImageDraw.Draw(img)
    try:
        font_title = ImageFont.truetype("DejaVuSans-Bold.ttf", 54)
        font_body = ImageFont.truetype("DejaVuSans.ttf", 34)
    except Exception:
        font_title = ImageFont.load_default()
        font_body = ImageFont.load_default()

    colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"]
    for i, color in enumerate(colors):
        x0 = 120 + i * 150
        y0 = 210 + (i % 2) * 90
        draw.rounded_rectangle((x0, y0, x0 + 170, y0 + 170), radius=28, fill=color)
    draw.text((120, 520), "Imagen educativa", fill="#0f172a", font=font_title)
    text = re.sub(r"\s+", " ", prompt).strip()[:120]
    words = text.split(" ")
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if len(candidate) > 36:
            if line:
                lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    for idx, line in enumerate(lines[:4]):
        draw.text((120, 610 + idx * 48), line, fill="#334155", font=font_body)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


@router.post("/internal/presenton-images/images/generations")
async def presenton_image_proxy(
    body: _OpenAIImageProxyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Endpoint interno (token compartido) para que Presenton genere imágenes
    de slides con gpt-image low usando la key de OpenAI de la config global."""
    token = (settings.PRESENTON_IMAGE_PROXY_TOKEN or "").strip()
    auth = request.headers.get("authorization", "")
    if not token or auth != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="No autorizado")

    ai_cfg = await get_profesor_ai_config(db, None)  # config global
    openai_key = str(ai_cfg.get("openai_api_key") or settings.OPENAI_API_KEY or "").strip()
    policy = classify_image_policy(body.prompt, kind="slide")
    cache_file = _presenton_image_cache_dir() / f"{_cache_key(policy + ':' + body.prompt)}.jpg"
    if cache_file.exists():
        img_bytes = cache_file.read_bytes()
        return {"data": [{"b64_json": base64.b64encode(img_bytes).decode("utf-8")}]}

    # Tope interno: el proxy SIEMPRE responde rápido y 200. Así Presenton nunca
    # dispara su propio asset-timeout (que descartaría la imagen y pondría el
    # placeholder negro estático). Si vence, devolvemos un placeholder claro y
    # NO lo cacheamos (para que una regeneración posterior pueda tener éxito).
    proxy_timeout = float(os.getenv("PRESENTON_IMAGE_PROXY_TIMEOUT", "45"))
    try:
        img_bytes, _ct, _provider, _policy = await asyncio.wait_for(
            _generate_image_bytes_with_policy(
                body.prompt,
                openai_api_key=openai_key,
                cloudflare=ai_cfg,
                kind="slide",
            ),
            timeout=proxy_timeout,
        )
        try:
            cache_file.write_bytes(img_bytes)  # solo cacheamos imágenes reales
        except Exception:
            pass
    except Exception as exc:
        reason = type(exc).__name__ if isinstance(exc, asyncio.TimeoutError) else exc
        logging.getLogger(__name__).warning(
            "Presenton image fallback for prompt %r: %s", body.prompt[:80], reason
        )
        img_bytes = _placeholder_image_bytes(body.prompt)

    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"data": [{"b64_json": b64}]}

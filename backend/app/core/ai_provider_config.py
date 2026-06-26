from copy import deepcopy
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings, normalize_ollama_native_url
from app.services.open_code_service import (
    OPEN_CODE_MODEL_CATALOG,
    OPEN_CODE_RECOMMENDED_MODELS,
    fetch_open_code_models as fetch_open_code_models_from_gateway,
)

GRADING_PROVIDER_OPTIONS = ("groq", "ollama", "open_code")
CONTENT_PROVIDER_OPTIONS = ("groq", "ollama", "open_code")
OCR_PROVIDER_OPTIONS = ("groq_vision", "ollama_vision", "open_code_vision")

_AUDIO_MODEL_HINTS = (
    "whisper",
    "orpheus",
    "tts",
    "speech",
)

_VISION_MODEL_HINTS = (
    "llama-4-scout",
    "vision",
    "-vl",
    "qwen2.5-vl",
)

FAST_CHAT_MODEL = "MiMo-V2.5"
LEGACY_GROQ_CHAT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

DEFAULT_CONFIG: dict = {
    "content_provider": "open_code",
    "content_model": OPEN_CODE_RECOMMENDED_MODELS["content"],
    "content_fallback_provider": "ollama",
    "content_fallback_model": "",
    "grading_provider": "open_code",
    "grading_model": OPEN_CODE_RECOMMENDED_MODELS["feedback"],
    "grading_fallback_provider": "ollama",
    "grading_fallback_model": "",
    "ocr_provider": "open_code_vision",
    "ocr_model": OPEN_CODE_RECOMMENDED_MODELS["vision"],
    "ocr_fallback_provider": "ollama_vision",
    "ocr_fallback_model": "",
    "chat_model": FAST_CHAT_MODEL,
    "groq_api_key": "",
    "ollama_url": "http://host.docker.internal:11434",
    "ollama_api_key": "",
    "ollama_cloud_url": "https://ollama.com",
    "ollama_cloud_api_key": "",
    "ollama_cloud_ocr_model": "qwen3-vl:235b-cloud",
    "open_code_base_url": "",
    "open_code_api_key": "",
    "open_code_content_model": OPEN_CODE_RECOMMENDED_MODELS["content"],
    "open_code_vision_model": OPEN_CODE_RECOMMENDED_MODELS["vision"],
    "open_code_feedback_model": OPEN_CODE_RECOMMENDED_MODELS["feedback"],
    "presenton_api_key": "",
    "openai_api_key": "",
    "cloudflare_account_id": "",
    "cloudflare_api_token": "",
    "cloudflare_image_model": "@cf/bytedance/stable-diffusion-xl-lightning",
    "cloudflare_image_fallback_model": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "updated_at": None,
    "updated_by": None,
}

_INHERIT_IF_EMPTY_KEYS = {
    "content_model",
    "content_fallback_model",
    "grading_model",
    "grading_fallback_model",
    "ocr_model",
    "ocr_fallback_model",
    "chat_model",
    "groq_api_key",
    "ollama_url",
    "ollama_api_key",
    "ollama_cloud_url",
    "ollama_cloud_api_key",
    "ollama_cloud_ocr_model",
    "open_code_base_url",
    "open_code_api_key",
    "open_code_content_model",
    "open_code_vision_model",
    "open_code_feedback_model",
    "presenton_api_key",
    "openai_api_key",
    "cloudflare_account_id",
    "cloudflare_api_token",
    "cloudflare_image_model",
    "cloudflare_image_fallback_model",
}


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    clean = str(value).strip()
    return clean if clean else None


def _normalize_provider(
    value: str | None,
    allowed: tuple[str, ...],
    fallback: str | None,
    allow_none: bool = False,
) -> str | None:
    clean = _normalize_text(value)
    if clean is None:
        return None if allow_none else fallback
    clean = clean.lower()
    if clean == "none" and allow_none:
        return None
    if clean not in allowed:
        return None if allow_none else fallback
    return clean


def normalize_ai_config(raw: dict | None) -> dict:
    cfg = deepcopy(DEFAULT_CONFIG)
    if isinstance(raw, dict):
        cfg.update(raw)

    cfg["content_provider"] = _normalize_provider(
        cfg.get("content_provider"),
        CONTENT_PROVIDER_OPTIONS,
        "open_code",
    )
    cfg["content_fallback_provider"] = _normalize_provider(
        cfg.get("content_fallback_provider"),
        CONTENT_PROVIDER_OPTIONS,
        None,
        allow_none=True,
    )
    cfg["grading_provider"] = _normalize_provider(
        cfg.get("grading_provider"),
        GRADING_PROVIDER_OPTIONS,
        "open_code",
    )
    cfg["grading_fallback_provider"] = _normalize_provider(
        cfg.get("grading_fallback_provider"),
        GRADING_PROVIDER_OPTIONS,
        None,
        allow_none=True,
    )
    cfg["ocr_provider"] = _normalize_provider(
        cfg.get("ocr_provider"),
        OCR_PROVIDER_OPTIONS,
        "open_code_vision",
    )
    cfg["ocr_fallback_provider"] = _normalize_provider(
        cfg.get("ocr_fallback_provider"),
        OCR_PROVIDER_OPTIONS,
        None,
        allow_none=True,
    )

    cfg["content_model"] = _normalize_text(cfg.get("content_model")) or ""
    cfg["content_fallback_model"] = _normalize_text(cfg.get("content_fallback_model")) or ""
    cfg["grading_model"] = _normalize_text(cfg.get("grading_model")) or ""
    cfg["grading_fallback_model"] = _normalize_text(cfg.get("grading_fallback_model")) or ""
    cfg["ocr_model"] = _normalize_text(cfg.get("ocr_model")) or ""
    cfg["ocr_fallback_model"] = _normalize_text(cfg.get("ocr_fallback_model")) or ""
    chat_model = _normalize_text(cfg.get("chat_model"))
    cfg["chat_model"] = FAST_CHAT_MODEL if not chat_model or chat_model == LEGACY_GROQ_CHAT_MODEL else chat_model
    cfg["groq_api_key"] = _normalize_text(cfg.get("groq_api_key")) or ""
    cfg["ollama_url"] = _normalize_text(cfg.get("ollama_url")) or DEFAULT_CONFIG["ollama_url"]
    cfg["ollama_api_key"] = _normalize_text(cfg.get("ollama_api_key")) or ""
    cfg["ollama_cloud_url"] = _normalize_text(cfg.get("ollama_cloud_url")) or DEFAULT_CONFIG["ollama_cloud_url"]
    cfg["ollama_cloud_api_key"] = _normalize_text(cfg.get("ollama_cloud_api_key")) or ""
    cfg["ollama_cloud_ocr_model"] = _normalize_text(cfg.get("ollama_cloud_ocr_model")) or DEFAULT_CONFIG["ollama_cloud_ocr_model"]
    cfg["open_code_base_url"] = _normalize_text(cfg.get("open_code_base_url")) or ""
    cfg["open_code_api_key"] = _normalize_text(cfg.get("open_code_api_key")) or ""
    cfg["open_code_content_model"] = _normalize_text(cfg.get("open_code_content_model")) or DEFAULT_CONFIG["open_code_content_model"]
    cfg["open_code_vision_model"] = _normalize_text(cfg.get("open_code_vision_model")) or DEFAULT_CONFIG["open_code_vision_model"]
    cfg["open_code_feedback_model"] = _normalize_text(cfg.get("open_code_feedback_model")) or DEFAULT_CONFIG["open_code_feedback_model"]
    cfg["presenton_api_key"] = _normalize_text(cfg.get("presenton_api_key")) or ""
    cfg["openai_api_key"] = _normalize_text(cfg.get("openai_api_key")) or ""
    cfg["cloudflare_account_id"] = _normalize_text(cfg.get("cloudflare_account_id")) or ""
    cfg["cloudflare_api_token"] = _normalize_text(cfg.get("cloudflare_api_token")) or ""
    cfg["cloudflare_image_model"] = _normalize_text(cfg.get("cloudflare_image_model")) or DEFAULT_CONFIG["cloudflare_image_model"]
    cfg["cloudflare_image_fallback_model"] = _normalize_text(cfg.get("cloudflare_image_fallback_model")) or DEFAULT_CONFIG["cloudflare_image_fallback_model"]
    return cfg


async def ensure_ai_provider_table(db: AsyncSession) -> None:
    await db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS ai_global_config (
            id SMALLINT PRIMARY KEY DEFAULT 1,
            content_provider VARCHAR(30) NOT NULL DEFAULT 'open_code',
            content_model VARCHAR(120),
            content_fallback_provider VARCHAR(30),
            content_fallback_model VARCHAR(120),
            grading_provider VARCHAR(30) NOT NULL DEFAULT 'open_code',
            grading_model VARCHAR(120),
            grading_fallback_provider VARCHAR(30),
            grading_fallback_model VARCHAR(120),
            ocr_provider VARCHAR(30) NOT NULL DEFAULT 'open_code_vision',
            ocr_model VARCHAR(120),
            ocr_fallback_provider VARCHAR(30),
            ocr_fallback_model VARCHAR(120),
            chat_model VARCHAR(120),
            groq_api_key VARCHAR(255),
            ollama_url VARCHAR(255) NOT NULL DEFAULT 'http://host.docker.internal:11434',
            ollama_api_key VARCHAR(255),
            ollama_cloud_url VARCHAR(255) DEFAULT 'https://ollama.com',
            ollama_cloud_api_key VARCHAR(255),
            ollama_cloud_ocr_model VARCHAR(120) DEFAULT 'qwen3-vl:235b-cloud',
            open_code_base_url VARCHAR(255),
            open_code_api_key VARCHAR(255),
            open_code_content_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash',
            open_code_vision_model VARCHAR(120) DEFAULT 'Qwen3.7 Plus',
            open_code_feedback_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash',
            presenton_api_key VARCHAR(255),
            openai_api_key VARCHAR(255),
            cloudflare_account_id VARCHAR(255),
            cloudflare_api_token VARCHAR(255),
            cloudflare_image_model VARCHAR(120) DEFAULT '@cf/bytedance/stable-diffusion-xl-lightning',
            cloudflare_image_fallback_model VARCHAR(120) DEFAULT '@cf/stabilityai/stable-diffusion-xl-base-1.0',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            CHECK (id = 1)
        )
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS content_provider VARCHAR(30) NOT NULL DEFAULT 'groq'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS content_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS content_fallback_provider VARCHAR(30)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS content_fallback_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS chat_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS groq_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS ollama_cloud_url VARCHAR(255) DEFAULT 'https://ollama.com'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS ollama_cloud_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS ollama_cloud_ocr_model VARCHAR(120) DEFAULT 'qwen3-vl:235b-cloud'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS open_code_base_url VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS open_code_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS open_code_content_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS open_code_vision_model VARCHAR(120) DEFAULT 'Qwen3.7 Plus'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS open_code_feedback_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS presenton_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS cloudflare_account_id VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS cloudflare_api_token VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS cloudflare_image_model VARCHAR(120) DEFAULT '@cf/bytedance/stable-diffusion-xl-lightning'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS ai_global_config
        ADD COLUMN IF NOT EXISTS cloudflare_image_fallback_model VARCHAR(120) DEFAULT '@cf/stabilityai/stable-diffusion-xl-base-1.0'
        """
    ))

    await db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS profesor_ai_configs (
            profesor_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            content_provider VARCHAR(30) NOT NULL DEFAULT 'open_code',
            content_model VARCHAR(120),
            content_fallback_provider VARCHAR(30),
            content_fallback_model VARCHAR(120),
            grading_provider VARCHAR(30) NOT NULL DEFAULT 'open_code',
            grading_model VARCHAR(120),
            grading_fallback_provider VARCHAR(30),
            grading_fallback_model VARCHAR(120),
            ocr_provider VARCHAR(30) NOT NULL DEFAULT 'open_code_vision',
            ocr_model VARCHAR(120),
            ocr_fallback_provider VARCHAR(30),
            ocr_fallback_model VARCHAR(120),
            chat_model VARCHAR(120),
            groq_api_key VARCHAR(255),
            ollama_url VARCHAR(255) NOT NULL DEFAULT 'http://host.docker.internal:11434',
            ollama_api_key VARCHAR(255),
            ollama_cloud_url VARCHAR(255) DEFAULT 'https://ollama.com',
            ollama_cloud_api_key VARCHAR(255),
            ollama_cloud_ocr_model VARCHAR(120) DEFAULT 'qwen3-vl:235b-cloud',
            open_code_base_url VARCHAR(255),
            open_code_api_key VARCHAR(255),
            open_code_content_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash',
            open_code_vision_model VARCHAR(120) DEFAULT 'Qwen3.7 Plus',
            open_code_feedback_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash',
            presenton_api_key VARCHAR(255),
            openai_api_key VARCHAR(255),
            cloudflare_account_id VARCHAR(255),
            cloudflare_api_token VARCHAR(255),
            cloudflare_image_model VARCHAR(120) DEFAULT '@cf/bytedance/stable-diffusion-xl-lightning',
            cloudflare_image_fallback_model VARCHAR(120) DEFAULT '@cf/stabilityai/stable-diffusion-xl-base-1.0',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
        """
    ))

    # Backward compatibility for environments where table already existed
    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS content_provider VARCHAR(30) NOT NULL DEFAULT 'groq'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS content_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS content_fallback_provider VARCHAR(30)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS content_fallback_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS chat_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS groq_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS ollama_cloud_url VARCHAR(255) DEFAULT 'https://ollama.com'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS ollama_cloud_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS ollama_cloud_ocr_model VARCHAR(120) DEFAULT 'qwen3-vl:235b-cloud'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS open_code_base_url VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS open_code_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS open_code_content_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS open_code_vision_model VARCHAR(120) DEFAULT 'Qwen3.7 Plus'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS open_code_feedback_model VARCHAR(120) DEFAULT 'DeepSeek V4 Flash'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS presenton_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS cloudflare_account_id VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS cloudflare_api_token VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS cloudflare_image_model VARCHAR(120) DEFAULT '@cf/bytedance/stable-diffusion-xl-lightning'
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS cloudflare_image_fallback_model VARCHAR(120) DEFAULT '@cf/stabilityai/stable-diffusion-xl-base-1.0'
        """
    ))


async def _get_global_ai_row(db: AsyncSession) -> dict | None:
    result = await db.execute(
        text(
            """
            SELECT
                content_provider,
                content_model,
                content_fallback_provider,
                content_fallback_model,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                groq_api_key,
                ollama_url,
                ollama_api_key,
                ollama_cloud_url,
                ollama_cloud_api_key,
                ollama_cloud_ocr_model,
                open_code_base_url,
                open_code_api_key,
                open_code_content_model,
                open_code_vision_model,
                open_code_feedback_model,
                presenton_api_key,
                openai_api_key,
                cloudflare_account_id,
                cloudflare_api_token,
                cloudflare_image_model,
                cloudflare_image_fallback_model,
                updated_at,
                updated_by
            FROM ai_global_config
            WHERE id = 1
            """
        )
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_global_ai_config(db: AsyncSession) -> dict:
    await ensure_ai_provider_table(db)
    row = await _get_global_ai_row(db)
    return normalize_ai_config(row)


async def upsert_global_ai_config(
    db: AsyncSession,
    config: dict,
    updated_by: str | None,
) -> dict:
    await ensure_ai_provider_table(db)
    # Merge the incoming (possibly partial) update over the EXISTING config so that
    # a partial payload never silently wipes fields it didn't include. Callers send
    # only the keys they want to change (the API uses exclude_none).
    existing = await get_global_ai_config(db)
    merged = {**existing, **(config or {})}
    normalized = normalize_ai_config(merged)

    await db.execute(
        text(
            """
            INSERT INTO ai_global_config (
                id,
                content_provider,
                content_model,
                content_fallback_provider,
                content_fallback_model,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                groq_api_key,
                ollama_url,
                ollama_api_key,
                ollama_cloud_url,
                ollama_cloud_api_key,
                ollama_cloud_ocr_model,
                open_code_base_url,
                open_code_api_key,
                open_code_content_model,
                open_code_vision_model,
                open_code_feedback_model,
                presenton_api_key,
                openai_api_key,
                cloudflare_account_id,
                cloudflare_api_token,
                cloudflare_image_model,
                cloudflare_image_fallback_model,
                updated_at,
                updated_by
            )
            VALUES (
                1,
                :content_provider,
                :content_model,
                :content_fallback_provider,
                :content_fallback_model,
                :grading_provider,
                :grading_model,
                :grading_fallback_provider,
                :grading_fallback_model,
                :ocr_provider,
                :ocr_model,
                :ocr_fallback_provider,
                :ocr_fallback_model,
                :chat_model,
                :groq_api_key,
                :ollama_url,
                :ollama_api_key,
                :ollama_cloud_url,
                :ollama_cloud_api_key,
                :ollama_cloud_ocr_model,
                :open_code_base_url,
                :open_code_api_key,
                :open_code_content_model,
                :open_code_vision_model,
                :open_code_feedback_model,
                :presenton_api_key,
                :openai_api_key,
                :cloudflare_account_id,
                :cloudflare_api_token,
                :cloudflare_image_model,
                :cloudflare_image_fallback_model,
                NOW(),
                :updated_by
            )
            ON CONFLICT (id) DO UPDATE SET
                content_provider = EXCLUDED.content_provider,
                content_model = EXCLUDED.content_model,
                content_fallback_provider = EXCLUDED.content_fallback_provider,
                content_fallback_model = EXCLUDED.content_fallback_model,
                grading_provider = EXCLUDED.grading_provider,
                grading_model = EXCLUDED.grading_model,
                grading_fallback_provider = EXCLUDED.grading_fallback_provider,
                grading_fallback_model = EXCLUDED.grading_fallback_model,
                ocr_provider = EXCLUDED.ocr_provider,
                ocr_model = EXCLUDED.ocr_model,
                ocr_fallback_provider = EXCLUDED.ocr_fallback_provider,
                ocr_fallback_model = EXCLUDED.ocr_fallback_model,
                chat_model = EXCLUDED.chat_model,
                groq_api_key = EXCLUDED.groq_api_key,
                ollama_url = EXCLUDED.ollama_url,
                ollama_api_key = EXCLUDED.ollama_api_key,
                ollama_cloud_url = EXCLUDED.ollama_cloud_url,
                ollama_cloud_api_key = EXCLUDED.ollama_cloud_api_key,
                ollama_cloud_ocr_model = EXCLUDED.ollama_cloud_ocr_model,
                open_code_base_url = EXCLUDED.open_code_base_url,
                open_code_api_key = EXCLUDED.open_code_api_key,
                open_code_content_model = EXCLUDED.open_code_content_model,
                open_code_vision_model = EXCLUDED.open_code_vision_model,
                open_code_feedback_model = EXCLUDED.open_code_feedback_model,
                presenton_api_key = EXCLUDED.presenton_api_key,
                openai_api_key = EXCLUDED.openai_api_key,
                cloudflare_account_id = EXCLUDED.cloudflare_account_id,
                cloudflare_api_token = EXCLUDED.cloudflare_api_token,
                cloudflare_image_model = EXCLUDED.cloudflare_image_model,
                cloudflare_image_fallback_model = EXCLUDED.cloudflare_image_fallback_model,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """
        ),
        {
            "content_provider": normalized["content_provider"],
            "content_model": normalized["content_model"] or None,
            "content_fallback_provider": normalized["content_fallback_provider"],
            "content_fallback_model": normalized["content_fallback_model"] or None,
            "grading_provider": normalized["grading_provider"],
            "grading_model": normalized["grading_model"] or None,
            "grading_fallback_provider": normalized["grading_fallback_provider"],
            "grading_fallback_model": normalized["grading_fallback_model"] or None,
            "ocr_provider": normalized["ocr_provider"],
            "ocr_model": normalized["ocr_model"] or None,
            "ocr_fallback_provider": normalized["ocr_fallback_provider"],
            "ocr_fallback_model": normalized["ocr_fallback_model"] or None,
            "chat_model": normalized["chat_model"] or None,
            "groq_api_key": normalized["groq_api_key"] or None,
            "ollama_url": normalized["ollama_url"],
            "ollama_api_key": normalized["ollama_api_key"] or None,
            "ollama_cloud_url": normalized["ollama_cloud_url"],
            "ollama_cloud_api_key": normalized["ollama_cloud_api_key"] or None,
            "ollama_cloud_ocr_model": normalized["ollama_cloud_ocr_model"] or None,
            "open_code_base_url": normalized["open_code_base_url"] or None,
            "open_code_api_key": normalized["open_code_api_key"] or None,
            "open_code_content_model": normalized["open_code_content_model"] or None,
            "open_code_vision_model": normalized["open_code_vision_model"] or None,
            "open_code_feedback_model": normalized["open_code_feedback_model"] or None,
            "presenton_api_key": normalized["presenton_api_key"] or None,
            "openai_api_key": normalized["openai_api_key"] or None,
            "cloudflare_account_id": normalized["cloudflare_account_id"] or None,
            "cloudflare_api_token": normalized["cloudflare_api_token"] or None,
            "cloudflare_image_model": normalized["cloudflare_image_model"] or None,
            "cloudflare_image_fallback_model": normalized["cloudflare_image_fallback_model"] or None,
            "updated_by": updated_by,
        },
    )

    return await get_global_ai_config(db)


async def _get_profesor_ai_row(db: AsyncSession, profesor_id: str) -> dict | None:
    result = await db.execute(
        text(
            """
            SELECT
                content_provider,
                content_model,
                content_fallback_provider,
                content_fallback_model,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                groq_api_key,
                ollama_url,
                ollama_api_key,
                ollama_cloud_url,
                ollama_cloud_api_key,
                ollama_cloud_ocr_model,
                open_code_base_url,
                open_code_api_key,
                open_code_content_model,
                open_code_vision_model,
                open_code_feedback_model,
                presenton_api_key,
                openai_api_key,
                cloudflare_account_id,
                cloudflare_api_token,
                cloudflare_image_model,
                cloudflare_image_fallback_model,
                updated_at,
                updated_by
            FROM profesor_ai_configs
            WHERE profesor_id = :profesor_id
            """
        ),
        {"profesor_id": profesor_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def has_profesor_ai_override(db: AsyncSession, profesor_id: str | None) -> bool:
    await ensure_ai_provider_table(db)
    if not profesor_id:
        return False
    row = await _get_profesor_ai_row(db, profesor_id)
    return row is not None


async def clear_profesor_ai_override(db: AsyncSession, profesor_id: str) -> None:
    await ensure_ai_provider_table(db)
    await db.execute(
        text("DELETE FROM profesor_ai_configs WHERE profesor_id = :profesor_id"),
        {"profesor_id": profesor_id},
    )


async def get_profesor_ai_config(db: AsyncSession, profesor_id: str | None) -> dict:
    await ensure_ai_provider_table(db)
    global_cfg = await get_global_ai_config(db)
    if not profesor_id:
        return global_cfg

    row = await _get_profesor_ai_row(db, profesor_id)
    if not row:
        return global_cfg

    merged = deepcopy(global_cfg)
    override = dict(row)
    for key in _INHERIT_IF_EMPTY_KEYS:
        if override.get(key) in (None, ""):
            override.pop(key, None)
    merged.update(override)
    return normalize_ai_config(merged)


async def upsert_profesor_ai_config(
    db: AsyncSession,
    profesor_id: str,
    config: dict,
    updated_by: str | None,
) -> dict:
    await ensure_ai_provider_table(db)
    # Merge the incoming (possibly partial) update over this profesor's EXISTING
    # override row so a partial payload doesn't reset untouched fields to defaults.
    existing_row = await _get_profesor_ai_row(db, profesor_id) or {}
    merged = {**existing_row, **(config or {})}
    normalized = normalize_ai_config(merged)

    await db.execute(
        text(
            """
            INSERT INTO profesor_ai_configs (
                profesor_id,
                content_provider,
                content_model,
                content_fallback_provider,
                content_fallback_model,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                groq_api_key,
                ollama_url,
                ollama_api_key,
                ollama_cloud_url,
                ollama_cloud_api_key,
                ollama_cloud_ocr_model,
                open_code_base_url,
                open_code_api_key,
                open_code_content_model,
                open_code_vision_model,
                open_code_feedback_model,
                presenton_api_key,
                openai_api_key,
                cloudflare_account_id,
                cloudflare_api_token,
                cloudflare_image_model,
                cloudflare_image_fallback_model,
                updated_at,
                updated_by
            )
            VALUES (
                :profesor_id,
                :content_provider,
                :content_model,
                :content_fallback_provider,
                :content_fallback_model,
                :grading_provider,
                :grading_model,
                :grading_fallback_provider,
                :grading_fallback_model,
                :ocr_provider,
                :ocr_model,
                :ocr_fallback_provider,
                :ocr_fallback_model,
                :chat_model,
                :groq_api_key,
                :ollama_url,
                :ollama_api_key,
                :ollama_cloud_url,
                :ollama_cloud_api_key,
                :ollama_cloud_ocr_model,
                :open_code_base_url,
                :open_code_api_key,
                :open_code_content_model,
                :open_code_vision_model,
                :open_code_feedback_model,
                :presenton_api_key,
                :openai_api_key,
                :cloudflare_account_id,
                :cloudflare_api_token,
                :cloudflare_image_model,
                :cloudflare_image_fallback_model,
                NOW(),
                :updated_by
            )
            ON CONFLICT (profesor_id) DO UPDATE SET
                content_provider = EXCLUDED.content_provider,
                content_model = EXCLUDED.content_model,
                content_fallback_provider = EXCLUDED.content_fallback_provider,
                content_fallback_model = EXCLUDED.content_fallback_model,
                grading_provider = EXCLUDED.grading_provider,
                grading_model = EXCLUDED.grading_model,
                grading_fallback_provider = EXCLUDED.grading_fallback_provider,
                grading_fallback_model = EXCLUDED.grading_fallback_model,
                ocr_provider = EXCLUDED.ocr_provider,
                ocr_model = EXCLUDED.ocr_model,
                ocr_fallback_provider = EXCLUDED.ocr_fallback_provider,
                ocr_fallback_model = EXCLUDED.ocr_fallback_model,
                chat_model = EXCLUDED.chat_model,
                groq_api_key = EXCLUDED.groq_api_key,
                ollama_url = EXCLUDED.ollama_url,
                ollama_api_key = EXCLUDED.ollama_api_key,
                ollama_cloud_url = EXCLUDED.ollama_cloud_url,
                ollama_cloud_api_key = EXCLUDED.ollama_cloud_api_key,
                ollama_cloud_ocr_model = EXCLUDED.ollama_cloud_ocr_model,
                open_code_base_url = EXCLUDED.open_code_base_url,
                open_code_api_key = EXCLUDED.open_code_api_key,
                open_code_content_model = EXCLUDED.open_code_content_model,
                open_code_vision_model = EXCLUDED.open_code_vision_model,
                open_code_feedback_model = EXCLUDED.open_code_feedback_model,
                presenton_api_key = EXCLUDED.presenton_api_key,
                openai_api_key = EXCLUDED.openai_api_key,
                cloudflare_account_id = EXCLUDED.cloudflare_account_id,
                cloudflare_api_token = EXCLUDED.cloudflare_api_token,
                cloudflare_image_model = EXCLUDED.cloudflare_image_model,
                cloudflare_image_fallback_model = EXCLUDED.cloudflare_image_fallback_model,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """
        ),
        {
            "profesor_id": profesor_id,
            "content_provider": normalized["content_provider"],
            "content_model": normalized["content_model"] or None,
            "content_fallback_provider": normalized["content_fallback_provider"],
            "content_fallback_model": normalized["content_fallback_model"] or None,
            "grading_provider": normalized["grading_provider"],
            "grading_model": normalized["grading_model"] or None,
            "grading_fallback_provider": normalized["grading_fallback_provider"],
            "grading_fallback_model": normalized["grading_fallback_model"] or None,
            "ocr_provider": normalized["ocr_provider"],
            "ocr_model": normalized["ocr_model"] or None,
            "ocr_fallback_provider": normalized["ocr_fallback_provider"],
            "ocr_fallback_model": normalized["ocr_fallback_model"] or None,
            "chat_model": normalized["chat_model"] or None,
            "groq_api_key": normalized["groq_api_key"] or None,
            "ollama_url": normalized["ollama_url"],
            "ollama_api_key": normalized["ollama_api_key"] or None,
            "ollama_cloud_url": normalized["ollama_cloud_url"],
            "ollama_cloud_api_key": normalized["ollama_cloud_api_key"] or None,
            "ollama_cloud_ocr_model": normalized["ollama_cloud_ocr_model"] or None,
            "open_code_base_url": normalized["open_code_base_url"] or None,
            "open_code_api_key": normalized["open_code_api_key"] or None,
            "open_code_content_model": normalized["open_code_content_model"] or None,
            "open_code_vision_model": normalized["open_code_vision_model"] or None,
            "open_code_feedback_model": normalized["open_code_feedback_model"] or None,
            "presenton_api_key": normalized["presenton_api_key"] or None,
            "openai_api_key": normalized["openai_api_key"] or None,
            "cloudflare_account_id": normalized["cloudflare_account_id"] or None,
            "cloudflare_api_token": normalized["cloudflare_api_token"] or None,
            "cloudflare_image_model": normalized["cloudflare_image_model"] or None,
            "cloudflare_image_fallback_model": normalized["cloudflare_image_fallback_model"] or None,
            "updated_by": updated_by,
        },
    )

    return await get_profesor_ai_config(db, profesor_id)


async def fetch_ollama_models(ollama_url: str, api_key: str | None = None) -> list[str]:
    base_url = normalize_ollama_native_url(ollama_url, default="")
    if not base_url:
        return []

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.get(f"{base_url}/api/tags", headers=headers)
        response.raise_for_status()
        payload = response.json()

    models = []
    for row in payload.get("models", []):
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("model") or "").strip()
        if name:
            models.append(name)

    return sorted(set(models))


async def fetch_groq_models(api_key: str | None = None) -> list[str]:
    settings = get_settings()
    selected_api_key = (api_key or settings.GROQ_API_KEY or "").strip()
    if not selected_api_key:
        return []

    headers = {
        "Authorization": f"Bearer {selected_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.get("https://api.groq.com/openai/v1/models", headers=headers)
        response.raise_for_status()
        payload = response.json() if response.content else {}

    models = []
    for row in payload.get("data", []):
        if not isinstance(row, dict):
            continue
        model_id = str(row.get("id") or "").strip()
        if model_id:
            models.append(model_id)

    return sorted(set(models))


def split_groq_models(models: list[str]) -> dict:
    clean = [str(m).strip() for m in (models or []) if str(m).strip()]

    def is_audio(model_id: str) -> bool:
        lid = model_id.lower()
        return any(h in lid for h in _AUDIO_MODEL_HINTS)

    def is_vision(model_id: str) -> bool:
        lid = model_id.lower()
        return any(h in lid for h in _VISION_MODEL_HINTS)

    vision_models = [m for m in clean if is_vision(m)]
    grading_models = [m for m in clean if not is_audio(m)]
    chatbot_models = [m for m in clean if not is_audio(m)]

    return {
        "all_models": clean,
        "vision_models": vision_models,
        "grading_models": grading_models,
        "chatbot_models": chatbot_models,
    }


async def fetch_open_code_models(base_url: str = "", api_key: str | None = None) -> list[str]:
    return await fetch_open_code_models_from_gateway(base_url=base_url, api_key=api_key)


def split_open_code_models(models: list[str]) -> dict:
    clean = [str(m).strip() for m in (models or []) if str(m).strip()] or list(OPEN_CODE_MODEL_CATALOG)
    vision_preferred = [
        OPEN_CODE_RECOMMENDED_MODELS["vision"],
        "Qwen3.7 Max",
        "GLM-5.1",
    ]
    vision_models = [m for m in vision_preferred if m in clean]
    for model in clean:
        low = model.lower()
        if ("vision" in low or "-vl" in low or "qwen" in low or "glm" in low) and model not in vision_models:
            vision_models.append(model)

    return {
        "all_models": clean,
        "content_models": clean,
        "vision_models": vision_models or clean,
        "feedback_models": clean,
        "recommended": OPEN_CODE_RECOMMENDED_MODELS,
    }



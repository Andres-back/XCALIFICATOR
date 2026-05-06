from copy import deepcopy
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings

GRADING_PROVIDER_OPTIONS = ("groq", "ollama")
OCR_PROVIDER_OPTIONS = ("paddleocr", "groq_vision", "ollama_vision")

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

DEFAULT_CONFIG: dict = {
    "grading_provider": "groq",
    "grading_model": "llama-3.3-70b-versatile",
    "grading_fallback_provider": None,
    "grading_fallback_model": "",
    "ocr_provider": "groq_vision",
    "ocr_model": "",
    "ocr_fallback_provider": None,
    "ocr_fallback_model": "",
    "chat_model": "meta-llama/llama-4-scout-17b-16e-instruct",
    "ollama_url": "http://host.docker.internal:11434",
    "ollama_api_key": "",
    "updated_at": None,
    "updated_by": None,
}

_INHERIT_IF_EMPTY_KEYS = {
    "grading_model",
    "grading_fallback_model",
    "ocr_model",
    "ocr_fallback_model",
    "chat_model",
    "ollama_url",
    "ollama_api_key",
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

    cfg["grading_provider"] = _normalize_provider(
        cfg.get("grading_provider"),
        GRADING_PROVIDER_OPTIONS,
        "groq",
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
        "groq_vision",
    )
    cfg["ocr_fallback_provider"] = _normalize_provider(
        cfg.get("ocr_fallback_provider"),
        OCR_PROVIDER_OPTIONS,
        None,
        allow_none=True,
    )

    cfg["grading_model"] = _normalize_text(cfg.get("grading_model")) or ""
    cfg["grading_fallback_model"] = _normalize_text(cfg.get("grading_fallback_model")) or ""
    cfg["ocr_model"] = _normalize_text(cfg.get("ocr_model")) or ""
    cfg["ocr_fallback_model"] = _normalize_text(cfg.get("ocr_fallback_model")) or ""
    cfg["chat_model"] = _normalize_text(cfg.get("chat_model")) or DEFAULT_CONFIG["chat_model"]
    cfg["ollama_url"] = _normalize_text(cfg.get("ollama_url")) or DEFAULT_CONFIG["ollama_url"]
    cfg["ollama_api_key"] = _normalize_text(cfg.get("ollama_api_key")) or ""
    return cfg


async def ensure_ai_provider_table(db: AsyncSession) -> None:
    await db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS ai_global_config (
            id SMALLINT PRIMARY KEY DEFAULT 1,
            grading_provider VARCHAR(30) NOT NULL DEFAULT 'groq',
            grading_model VARCHAR(120),
            grading_fallback_provider VARCHAR(30),
            grading_fallback_model VARCHAR(120),
            ocr_provider VARCHAR(30) NOT NULL DEFAULT 'groq_vision',
            ocr_model VARCHAR(120),
            ocr_fallback_provider VARCHAR(30),
            ocr_fallback_model VARCHAR(120),
            chat_model VARCHAR(120),
            ollama_url VARCHAR(255) NOT NULL DEFAULT 'http://host.docker.internal:11434',
            ollama_api_key VARCHAR(255),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            CHECK (id = 1)
        )
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
        ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255)
        """
    ))

    await db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS profesor_ai_configs (
            profesor_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            grading_provider VARCHAR(30) NOT NULL DEFAULT 'groq',
            grading_model VARCHAR(120),
            grading_fallback_provider VARCHAR(30),
            grading_fallback_model VARCHAR(120),
            ocr_provider VARCHAR(30) NOT NULL DEFAULT 'groq_vision',
            ocr_model VARCHAR(120),
            ocr_fallback_provider VARCHAR(30),
            ocr_fallback_model VARCHAR(120),
            chat_model VARCHAR(120),
            ollama_url VARCHAR(255) NOT NULL DEFAULT 'http://host.docker.internal:11434',
            ollama_api_key VARCHAR(255),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
        """
    ))

    # Backward compatibility for environments where table already existed
    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS chat_model VARCHAR(120)
        """
    ))

    await db.execute(text(
        """
        ALTER TABLE IF EXISTS profesor_ai_configs
        ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255)
        """
    ))


async def _get_global_ai_row(db: AsyncSession) -> dict | None:
    result = await db.execute(
        text(
            """
            SELECT
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                ollama_url,
                ollama_api_key,
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
    normalized = normalize_ai_config(config)

    await db.execute(
        text(
            """
            INSERT INTO ai_global_config (
                id,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                ollama_url,
                ollama_api_key,
                updated_at,
                updated_by
            )
            VALUES (
                1,
                :grading_provider,
                :grading_model,
                :grading_fallback_provider,
                :grading_fallback_model,
                :ocr_provider,
                :ocr_model,
                :ocr_fallback_provider,
                :ocr_fallback_model,
                :chat_model,
                :ollama_url,
                :ollama_api_key,
                NOW(),
                :updated_by
            )
            ON CONFLICT (id) DO UPDATE SET
                grading_provider = EXCLUDED.grading_provider,
                grading_model = EXCLUDED.grading_model,
                grading_fallback_provider = EXCLUDED.grading_fallback_provider,
                grading_fallback_model = EXCLUDED.grading_fallback_model,
                ocr_provider = EXCLUDED.ocr_provider,
                ocr_model = EXCLUDED.ocr_model,
                ocr_fallback_provider = EXCLUDED.ocr_fallback_provider,
                ocr_fallback_model = EXCLUDED.ocr_fallback_model,
                chat_model = EXCLUDED.chat_model,
                ollama_url = EXCLUDED.ollama_url,
                ollama_api_key = EXCLUDED.ollama_api_key,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """
        ),
        {
            "grading_provider": normalized["grading_provider"],
            "grading_model": normalized["grading_model"] or None,
            "grading_fallback_provider": normalized["grading_fallback_provider"],
            "grading_fallback_model": normalized["grading_fallback_model"] or None,
            "ocr_provider": normalized["ocr_provider"],
            "ocr_model": normalized["ocr_model"] or None,
            "ocr_fallback_provider": normalized["ocr_fallback_provider"],
            "ocr_fallback_model": normalized["ocr_fallback_model"] or None,
            "chat_model": normalized["chat_model"] or None,
            "ollama_url": normalized["ollama_url"],
            "ollama_api_key": normalized["ollama_api_key"] or None,
            "updated_by": updated_by,
        },
    )

    return await get_global_ai_config(db)


async def _get_profesor_ai_row(db: AsyncSession, profesor_id: str) -> dict | None:
    result = await db.execute(
        text(
            """
            SELECT
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                ollama_url,
                ollama_api_key,
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
    normalized = normalize_ai_config(config)

    await db.execute(
        text(
            """
            INSERT INTO profesor_ai_configs (
                profesor_id,
                grading_provider,
                grading_model,
                grading_fallback_provider,
                grading_fallback_model,
                ocr_provider,
                ocr_model,
                ocr_fallback_provider,
                ocr_fallback_model,
                chat_model,
                ollama_url,
                ollama_api_key,
                updated_at,
                updated_by
            )
            VALUES (
                :profesor_id,
                :grading_provider,
                :grading_model,
                :grading_fallback_provider,
                :grading_fallback_model,
                :ocr_provider,
                :ocr_model,
                :ocr_fallback_provider,
                :ocr_fallback_model,
                :chat_model,
                :ollama_url,
                :ollama_api_key,
                NOW(),
                :updated_by
            )
            ON CONFLICT (profesor_id) DO UPDATE SET
                grading_provider = EXCLUDED.grading_provider,
                grading_model = EXCLUDED.grading_model,
                grading_fallback_provider = EXCLUDED.grading_fallback_provider,
                grading_fallback_model = EXCLUDED.grading_fallback_model,
                ocr_provider = EXCLUDED.ocr_provider,
                ocr_model = EXCLUDED.ocr_model,
                ocr_fallback_provider = EXCLUDED.ocr_fallback_provider,
                ocr_fallback_model = EXCLUDED.ocr_fallback_model,
                chat_model = EXCLUDED.chat_model,
                ollama_url = EXCLUDED.ollama_url,
                ollama_api_key = EXCLUDED.ollama_api_key,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """
        ),
        {
            "profesor_id": profesor_id,
            "grading_provider": normalized["grading_provider"],
            "grading_model": normalized["grading_model"] or None,
            "grading_fallback_provider": normalized["grading_fallback_provider"],
            "grading_fallback_model": normalized["grading_fallback_model"] or None,
            "ocr_provider": normalized["ocr_provider"],
            "ocr_model": normalized["ocr_model"] or None,
            "ocr_fallback_provider": normalized["ocr_fallback_provider"],
            "ocr_fallback_model": normalized["ocr_fallback_model"] or None,
            "chat_model": normalized["chat_model"] or None,
            "ollama_url": normalized["ollama_url"],
            "ollama_api_key": normalized["ollama_api_key"] or None,
            "updated_by": updated_by,
        },
    )

    return await get_profesor_ai_config(db, profesor_id)


async def fetch_ollama_models(ollama_url: str, api_key: str | None = None) -> list[str]:
    base_url = (ollama_url or "").strip().rstrip("/")
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


async def fetch_groq_models() -> list[str]:
    settings = get_settings()
    api_key = (settings.GROQ_API_KEY or "").strip()
    if not api_key:
        return []

    headers = {
        "Authorization": f"Bearer {api_key}",
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

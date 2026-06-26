from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    POSTGRES_USER: str = "xcalificator"
    POSTGRES_PASSWORD: str = "TU_PASSWORD_SEGURO"
    POSTGRES_DB: str = "xcalificator_db"
    DATABASE_URL: str = "postgresql+asyncpg://xcalificator:TU_PASSWORD_SEGURO@postgres:5432/xcalificator_db"

    # Redis
    REDIS_URL: str = "redis://redis:6379"

    # Groq
    GROQ_API_KEY: str = ""

    # JWT
    JWT_SECRET: str = "dev-only-change-me"
    JWT_EXPIRY: int = 3600
    JWT_REFRESH_EXPIRY: int = 604800  # 7 days

    # Google Slides export (optional, not used for login)
    GOOGLE_SERVICE_ACCOUNT_JSON: str = ""
    GOOGLE_SLIDES_EXPORT_ENABLED: bool = False
    GOOGLE_SLIDES_PARENT_FOLDER_ID: str = ""
    GOOGLE_SLIDES_SHARE_TO_ANYONE: bool = False

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # Telegram Bot (notificaciones)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""

    # Ollama/local AI
    OLLAMA_URL: str = ""
    OLLAMA_API_KEY: str = ""
    OLLAMA_PRESENTATION_MODEL: str = ""
    OCR_OLLAMA_MODEL: str = "gemma3"
    OCR_GROQ_FALLBACK_MODEL: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    # Ollama Cloud (OCR/Vision para examenes manuscritos)
    OLLAMA_CLOUD_URL: str = "https://ollama.com"
    OLLAMA_CLOUD_API_KEY: str = ""
    OLLAMA_CLOUD_OCR_MODEL: str = "qwen3-vl:235b-cloud"

    # Open Code / OpenAI-compatible gateway
    OPEN_CODE_BASE_URL: str = ""
    OPEN_CODE_API_KEY: str = ""
    OPEN_CODE_CONTENT_MODEL: str = "DeepSeek V4 Flash"
    OPEN_CODE_VISION_MODEL: str = "Qwen3.7 Plus"
    OPEN_CODE_FEEDBACK_MODEL: str = "DeepSeek V4 Flash"
    OPEN_CODE_FALLBACK_MODEL: str = "DeepSeek V4 Flash"

    # OpenAI — RESTRINGIDO A IMÁGENES (gpt-image, calidad low por economía)
    OPENAI_API_KEY: str = ""
    OPENAI_IMAGE_MODEL: str = "gpt-image-1"   # cambia a "gpt-image-2" si tu cuenta lo tiene
    OPENAI_IMAGE_PEOPLE_MODEL: str = "gpt-image-2"  # preferido para personas/escenas de aula
    OPENAI_IMAGE_QUALITY: str = "low"          # low = máxima economía
    OPENAI_IMAGE_SIZE: str = "1024x1024"       # 1024x1024 (más barato) | 1024x1536 (vertical, fichas)
    OPENAI_IMAGE_FORMAT: str = "jpeg"
    # "low" = filtro de seguridad menos restrictivo (reduce falsos positivos en
    # ilustraciones educativas de anatomía/cuerpo). "auto" = comportamiento por defecto.
    OPENAI_IMAGE_MODERATION: str = "low"
    # Token compartido para que Presenton genere imágenes vía nuestro backend
    # (proveedor open_webui) sin duplicar la API key de OpenAI.
    PRESENTON_IMAGE_PROXY_TOKEN: str = ""

    # Cloudflare Workers AI (optional image generation)
    CLOUDFLARE_ACCOUNT_ID: str = ""
    CLOUDFLARE_API_TOKEN: str = ""
    CLOUDFLARE_IMAGE_MODEL: str = "@cf/bytedance/stable-diffusion-xl-lightning"
    CLOUDFLARE_IMAGE_FALLBACK_MODEL: str = "@cf/stabilityai/stable-diffusion-xl-base-1.0"

    # Presenton (AI presentation generator)
    PRESENTON_URL: str = "http://presenton:80"
    PRESENTON_PUBLIC_URL: str = "http://localhost:5001"

    # Public domain (deploy URL, pasado por env en produccion)
    PUBLIC_DOMAIN: str = ""
    PRESENTON_TIMEOUT: int = 600  # seconds
    PRESENTON_AUTH_USERNAME: str = "xcalificator"
    PRESENTON_AUTH_PASSWORD: str = "xcalificator-dev-only"

    # Upload
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE: int = 10_485_760  # 10MB

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def normalize_ollama_native_url(ollama_url: str | None, default: str = "http://host.docker.internal:11434") -> str:
    """Return an Ollama host suitable for native `/api/*` endpoints."""
    base_url = (ollama_url or "").strip().rstrip("/")
    if not base_url:
        base_url = default

    lowered = base_url.lower()
    if lowered.endswith("/v1"):
        base_url = base_url[:-3].rstrip("/")
    elif lowered.endswith("/api"):
        base_url = base_url[:-4].rstrip("/")

    return base_url or default

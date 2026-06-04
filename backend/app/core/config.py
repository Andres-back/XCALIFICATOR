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

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_SERVICE_ACCOUNT_JSON: str = ""
    GOOGLE_SLIDES_EXPORT_ENABLED: bool = False
    GOOGLE_SLIDES_PARENT_FOLDER_ID: str = ""
    GOOGLE_SLIDES_SHARE_TO_ANYONE: bool = False

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # Whapi (WhatsApp API gratuita)
    WHAPI_API_URL: str = "https://gate.whapi.cloud"
    WHAPI_TOKEN: str = ""

    # Pollinations (image generation)
    POLLINATIONS_API_KEY: str = ""

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
    OLLAMA_CLOUD_GRADING_MODEL: str = ""
    OLLAMA_CLOUD_CHAT_MODEL: str = ""

    # OCR
    OCR_SERVICE_URL: str = "http://paddleocr:8001"

    # Presenton (AI presentation generator)
    PRESENTON_URL: str = "http://presenton:80"
    PRESENTON_PUBLIC_URL: str = "http://localhost:5001"
    PRESENTON_TIMEOUT: int = 240  # seconds
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

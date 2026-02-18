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
    JWT_SECRET: str = "xCalificator_S3cR3t_K3y_2026"
    JWT_EXPIRY: int = 3600
    JWT_REFRESH_EXPIRY: int = 604800  # 7 days

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # Whapi (WhatsApp API gratuita)
    WHAPI_API_URL: str = "https://gate.whapi.cloud"
    WHAPI_TOKEN: str = ""

    # OCR
    OCR_SERVICE_URL: str = "http://paddleocr:8001"

    # Upload
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE: int = 10_485_760  # 10MB

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

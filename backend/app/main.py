from datetime import datetime, timezone
import time
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from sqlalchemy import text

from app.core.rate_limiter import RateLimiter
from app.core.database import AsyncSessionLocal
from app.core.redis import check_redis_health
from app.routers import auth, admin, materias, examenes, grading, generation, chat, notifications, ai_assets
from app.routers import periodos, herramientas, asistencia, reportes, grupos, tesis, presentaciones, xali_master, xali_settings
from app.routers import telegram as telegram_router
from app.services.telegram_bot import get_telegram_bot

app = FastAPI(
    title="XCalificator API",
    description="Plataforma Educativa IA - Sistema de gestión académica con calificación automática",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS — allow local dev + production domain (from env or Cloudflare tunnel)
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:80",
    "http://localhost",
]
# Add domain from env var (ej: https://xcalificator.midominio.com)
public_domain = (os.getenv("PUBLIC_DOMAIN") or "").strip()
if public_domain:
    CORS_ORIGINS.append(public_domain)
# Parse CORS_EXTRA from env (comma-separated)
extra = (os.getenv("CORS_EXTRA_ORIGINS") or "").strip()
if extra:
    CORS_ORIGINS.extend(o.strip() for o in extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter
app.add_middleware(RateLimiter)

# Static files for uploads
upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Routers
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(materias.router, prefix="/api")
app.include_router(examenes.router, prefix="/api")
app.include_router(grading.router, prefix="/api")
app.include_router(generation.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(ai_assets.router, prefix="/api")
app.include_router(periodos.router, prefix="/api")
app.include_router(herramientas.router, prefix="/api")
app.include_router(asistencia.router, prefix="/api")
app.include_router(reportes.router, prefix="/api")
app.include_router(grupos.router, prefix="/api")
app.include_router(tesis.router, prefix="/api")
app.include_router(presentaciones.router, prefix="/api")
app.include_router(xali_master.router, prefix="/api")
app.include_router(xali_settings.router, prefix="/api")
app.include_router(telegram_router.router, prefix="/api")
app.include_router(telegram_router.notifications_router, prefix="/api")


async def check_db_health() -> dict:
    started = time.perf_counter()
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))

        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "status": "up",
            "latency_ms": latency_ms,
        }
    except Exception as exc:
        return {
            "status": "down",
            "error": exc.__class__.__name__,
        }


@app.get("/api/health")
async def health_check():
    db = await check_db_health()
    redis = await check_redis_health()

    dependencies_ok = db["status"] == "up" and redis["status"] == "up"
    response = {
        "status": "ok" if dependencies_ok else "degraded",
        "service": "XCalificator API",
        "version": "1.0.0",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "dependencies": {
            "database": db,
            "redis": redis,
        },
    }

    return JSONResponse(
        status_code=status.HTTP_200_OK if dependencies_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=response,
    )


@app.on_event("startup")
async def ensure_legacy_schema_columns():
    """Apply small idempotent schema fixes for VPS databases created before recent features."""
    async with AsyncSessionLocal() as session:
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS preferencias_notif
            ADD COLUMN IF NOT EXISTS acepta_telegram BOOLEAN DEFAULT FALSE
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS preferencias_notif
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS users
            ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50)
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS users
            ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(10)
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS users
            ADD COLUMN IF NOT EXISTS telegram_link_code_expires TIMESTAMPTZ
            """
        ))
        await session.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_users_telegram_chat_id
            ON users (telegram_chat_id)
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS materias
            ADD COLUMN IF NOT EXISTS dba_json JSONB
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS materias
            ADD COLUMN IF NOT EXISTS plan_json JSONB
            """
        ))
        await session.execute(text(
            """
            CREATE TABLE IF NOT EXISTS materia_curriculo_documentos (
                id UUID PRIMARY KEY,
                materia_id UUID NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
                profesor_id UUID REFERENCES users(id) ON DELETE SET NULL,
                titulo VARCHAR(300) NOT NULL,
                fuente_tipo VARCHAR(30) NOT NULL DEFAULT 'texto',
                texto TEXT NOT NULL DEFAULT '',
                chunks_json JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        ))
        await session.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_materia_curriculo_documentos_materia
            ON materia_curriculo_documentos (materia_id)
            """
        ))
        await session.execute(text(
            """
            CREATE TABLE IF NOT EXISTS ocr_grading_jobs (
                id UUID PRIMARY KEY,
                examen_id UUID NOT NULL REFERENCES examenes(id) ON DELETE CASCADE,
                estudiante_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                profesor_id UUID REFERENCES users(id) ON DELETE SET NULL,
                materia_id UUID NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
                estado VARCHAR(20) NOT NULL DEFAULT 'queued',
                filename VARCHAR(300) NOT NULL,
                content_type VARCHAR(100),
                file_url TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                result_json JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        ))
        await session.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_ocr_grading_jobs_examen_created
            ON ocr_grading_jobs (examen_id, created_at)
            """
        ))
        await session.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_ocr_grading_jobs_estado
            ON ocr_grading_jobs (estado)
            """
        ))
        await session.execute(text(
            """
            ALTER TABLE IF EXISTS examenes
            ADD COLUMN IF NOT EXISTS activo_fisico BOOLEAN DEFAULT FALSE
            """
        ))
        await session.execute(text(
            """
            CREATE TABLE IF NOT EXISTS reportes_generados (
                id UUID PRIMARY KEY,
                materia_id UUID NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
                periodo_id UUID NOT NULL REFERENCES periodos_academicos(id) ON DELETE CASCADE,
                profesor_id UUID REFERENCES users(id) ON DELETE SET NULL,
                titulo VARCHAR(300) NOT NULL,
                contenido_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        ))
        await session.execute(text(
            """
            CREATE INDEX IF NOT EXISTS ix_reportes_generados_materia_created
            ON reportes_generados (materia_id, created_at)
            """
        ))
        await session.commit()


@app.on_event("startup")
async def startup_telegram_bot():
    """Start the Telegram bot (webhook or polling) if configured."""
    bot = get_telegram_bot()
    if not bot.enabled:
        return
    if bot.settings.TELEGRAM_WEBHOOK_URL:
        await bot.set_webhook(bot.settings.TELEGRAM_WEBHOOK_URL)
    else:
        import asyncio
        bot._polling_task = asyncio.create_task(bot.start_polling())


@app.on_event("shutdown")
async def shutdown_telegram_bot():
    bot = get_telegram_bot()
    await bot.stop_polling()

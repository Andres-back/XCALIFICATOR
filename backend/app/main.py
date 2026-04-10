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
from app.routers import auth, admin, materias, examenes, grading, generation, chat, notifications
from app.routers import periodos, herramientas, asistencia, reportes, grupos, tesis

app = FastAPI(
    title="XCalificator API",
    description="Plataforma Educativa IA - Sistema de gestión académica con calificación automática",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:80", "http://localhost"],
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
app.include_router(periodos.router, prefix="/api")
app.include_router(herramientas.router, prefix="/api")
app.include_router(asistencia.router, prefix="/api")
app.include_router(reportes.router, prefix="/api")
app.include_router(grupos.router, prefix="/api")
app.include_router(tesis.router, prefix="/api")


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

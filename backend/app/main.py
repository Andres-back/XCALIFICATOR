from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.rate_limiter import RateLimiter
from app.routers import auth, admin, materias, examenes, grading, generation, chat, notifications

app = FastAPI(
    title="Xalificator API",
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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Xalificator API", "version": "1.0.0"}

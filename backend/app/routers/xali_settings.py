from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.dependencies import require_role
from app.models.models import User

settings = get_settings()
router = APIRouter(tags=["Xali Settings"])

DEFAULT_MASCOT_URL = "/xali/mascota-principal.png"
ALLOWED_MASCOT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_MASCOT_BYTES = 3 * 1024 * 1024
MascotRole = Literal["profesor", "estudiante"]


class XaliSettingsResponse(BaseModel):
    profesor_mascot_url: str = DEFAULT_MASCOT_URL
    estudiante_mascot_url: str = DEFAULT_MASCOT_URL


def _settings_dir() -> Path:
    root = Path(settings.UPLOAD_DIR) / "xali"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _settings_path() -> Path:
    return _settings_dir() / "settings.json"


def _default_settings() -> dict[str, str]:
    return {
        "profesor_mascot_url": DEFAULT_MASCOT_URL,
        "estudiante_mascot_url": DEFAULT_MASCOT_URL,
    }


def _read_settings() -> dict[str, str]:
    data = _default_settings()
    path = _settings_path()
    if not path.exists():
        return data
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            for key in data:
                value = str(raw.get(key) or "").strip()
                if value:
                    data[key] = value
    except (OSError, json.JSONDecodeError):
        return data
    return data


def _write_settings(data: dict[str, str]) -> dict[str, str]:
    normalized = _default_settings()
    for key in normalized:
        value = str(data.get(key) or "").strip()
        if value:
            normalized[key] = value
    _settings_path().write_text(
        json.dumps(normalized, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return normalized


def _public_url(filename: str) -> str:
    return f"/uploads/xali/{filename}"


@router.get("/xali/settings", response_model=XaliSettingsResponse)
async def get_xali_settings(
    current_user: User = Depends(require_role("profesor", "admin", "estudiante")),
):
    return _read_settings()


@router.get("/admin/xali-settings", response_model=XaliSettingsResponse)
async def get_admin_xali_settings(
    current_user: User = Depends(require_role("admin")),
):
    return _read_settings()


@router.post("/admin/xali-settings/mascot/{role}", response_model=XaliSettingsResponse)
async def upload_xali_mascot(
    role: MascotRole,
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin")),
):
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_MASCOT_TYPES.get(content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Solo se permiten imagenes PNG, JPG, WEBP o GIF")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Imagen vacia")
    if len(content) > MAX_MASCOT_BYTES:
        raise HTTPException(status_code=400, detail="La mascota no puede superar 3 MB")

    filename = f"mascota-{role}-{secrets.token_hex(8)}{ext}"
    (_settings_dir() / filename).write_bytes(content)

    data = _read_settings()
    data[f"{role}_mascot_url"] = _public_url(filename)
    return _write_settings(data)

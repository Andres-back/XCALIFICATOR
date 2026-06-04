"""Telegram integration endpoints:
- POST /api/telegram/webhook — receive updates from Telegram (production)
- POST /api/notifications/telegram/request-code — generate 6-digit code (called by user from Perfil)
- GET  /api/notifications/telegram/status — check if user is linked
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import User
from app.services.telegram_bot import get_telegram_bot


router = APIRouter(prefix="/telegram", tags=["Telegram"])


@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive updates from Telegram. Public endpoint (no auth)."""
    bot = get_telegram_bot()
    if not bot.enabled:
        return {"ok": True, "skipped": "bot_disabled"}
    try:
        update = await request.json()
    except Exception:
        return {"ok": True, "skipped": "invalid_json"}
    await bot.process_update(update)
    return {"ok": True}


notifications_router = APIRouter(prefix="/notifications", tags=["Notificaciones"])


@notifications_router.post("/telegram/request-code")
async def request_telegram_link_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a 6-digit code to link this user to a Telegram chat_id.
    The user sends /start <code> to the bot; bot's /start handler links the chat_id.
    Code expires in 10 minutes.
    """
    if not current_user.celular:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Agrega tu celular en tu perfil antes de vincular Telegram.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    current_user.telegram_link_code = code
    current_user.telegram_link_code_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await db.commit()
    await db.refresh(current_user)
    return {
        "code": code,
        "expires_at": current_user.telegram_link_code_expires.isoformat(),
        "bot_username": get_telegram_bot().bot_username or None,
    }


@notifications_router.get("/telegram/status")
async def telegram_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    return {
        "linked": bool(user.telegram_chat_id),
        "chat_id_masked": (user.telegram_chat_id[:6] + "...") if user.telegram_chat_id else None,
        "bot_enabled": get_telegram_bot().enabled,
    }

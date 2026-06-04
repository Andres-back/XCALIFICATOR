"""Telegram Bot service: handles inbound updates (link by code) and outbound messages.

Two modes:
- Webhook: when TELEGRAM_WEBHOOK_URL is set, Telegram pushes updates to /api/telegram/webhook
- Polling: fallback, a background task calls getUpdates every N seconds

The bot's only job is to:
1. Receive /start <code> from a user → call backend link endpoint
2. /help command
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import get_settings


logger = logging.getLogger(__name__)


class TelegramBot:
    API = "https://api.telegram.org"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.token = (self.settings.TELEGRAM_BOT_TOKEN or "").strip()
        self.bot_username = (self.settings.TELEGRAM_BOT_USERNAME or "").strip()
        self._polling_task: asyncio.Task | None = None
        self._offset: int = 0
        self._running: bool = False

    @property
    def enabled(self) -> bool:
        return bool(self.token)

    @property
    def base_url(self) -> str:
        return f"{self.API}/bot{self.token}"

    async def send_message(self, chat_id: str | int, text: str, parse_mode: str = "Markdown") -> bool:
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f"{self.base_url}/sendMessage",
                    json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
                )
                return r.status_code == 200
        except Exception as exc:
            logger.warning("Telegram send_message failed: %s", exc)
            return False

    async def set_webhook(self, url: str) -> bool:
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    f"{self.base_url}/setWebhook",
                    json={"url": url, "drop_pending_updates": True},
                )
                data = r.json() if r.status_code == 200 else {}
                ok = bool(data.get("result"))
                if ok:
                    logger.info("Telegram webhook set: %s", url)
                else:
                    logger.warning("Telegram setWebhook failed: %s", data)
                return ok
        except Exception as exc:
            logger.warning("Telegram set_webhook failed: %s", exc)
            return False

    async def delete_webhook(self) -> bool:
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(f"{self.base_url}/deleteWebhook", json={})
                return r.status_code == 200
        except Exception as exc:
            logger.warning("Telegram delete_webhook failed: %s", exc)
            return False

    async def get_updates(self, timeout: int = 25) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=float(timeout + 5)) as client:
                r = await client.post(
                    f"{self.base_url}/getUpdates",
                    json={"offset": self._offset, "timeout": timeout, "allowed_updates": ["message"]},
                )
                if r.status_code != 200:
                    return []
                data = r.json()
                results = data.get("result", []) or []
                if results:
                    self._offset = max(int(u.get("update_id", 0)) for u in results) + 1
                return results
        except Exception as exc:
            logger.debug("Telegram getUpdates timeout/error (normal in polling): %s", exc)
            return []

    async def process_update(self, update: dict[str, Any]) -> None:
        """Handle one Telegram update. Only /start <code> for now."""
        message = update.get("message") or {}
        text = (message.get("text") or "").strip()
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        from_user = message.get("from") or {}

        if not chat_id or not text:
            return

        if text.startswith("/start"):
            payload = text.split(maxsplit=1)
            code = payload[1].strip() if len(payload) > 1 else ""
            if not code:
                await self.send_message(
                    chat_id,
                    "👋 Hola! Para vincular tu cuenta a XCalificator, "
                    "genera un código desde tu perfil y envíamelo así:\n\n"
                    "/start <código>",
                )
                return

            linked = await self._link_chat_to_code(chat_id, code, from_user)
            if linked:
                await self.send_message(
                    chat_id,
                    "✅ *Cuenta vinculada correctamente*\n\n"
                    "Ahora recibirás notificaciones de XCalificator aquí. "
                    "Escribe /help para ver los comandos disponibles.",
                )
            else:
                await self.send_message(
                    chat_id,
                    "❌ No pude vincular tu cuenta. Verifica que el código sea correcto "
                    "y que no haya expirado (válido por 10 minutos). "
                    "Genera uno nuevo desde tu perfil.",
                )
            return

        if text == "/help":
            await self.send_message(
                chat_id,
                "*XCalificator Bot*\n\n"
                "Comandos disponibles:\n"
                "/start <código> — Vincular tu cuenta\n"
                "/help — Ver esta ayuda",
            )
            return

        await self.send_message(chat_id, "🤖 Escribe /help para ver los comandos disponibles.")

    async def _link_chat_to_code(self, chat_id: int | str, code: str, from_user: dict) -> bool:
        """Call backend endpoint to link chat_id to user with the given code."""
        from app.core.database import AsyncSessionLocal
        from app.models.models import User
        from sqlalchemy import select
        from datetime import datetime, timezone

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(User.telegram_link_code == code.strip())
            )
            user = result.scalar_one_or_none()
            if not user:
                return False

            if not user.telegram_link_code_expires or user.telegram_link_code_expires < datetime.now(timezone.utc):
                return False

            user.telegram_chat_id = str(chat_id)
            user.telegram_link_code = None
            user.telegram_link_code_expires = None

            if user.preferencia_notif is None:
                from app.models.models import PreferenciaNotif
                user.preferencia_notif = PreferenciaNotif(user_id=user.id)

            await db.commit()
            logger.info("Telegram linked: user=%s chat_id=%s", user.id, chat_id)
            return True

    async def start_polling(self) -> None:
        """Run polling in background. Stops when _running is False."""
        if not self.enabled or self._running:
            return
        self._running = True
        logger.info("Telegram polling started (offset=%s)", self._offset)
        while self._running:
            try:
                updates = await self.get_updates(timeout=25)
                for u in updates:
                    await self.process_update(u)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.exception("Telegram polling loop error: %s", exc)
                await asyncio.sleep(2)
        logger.info("Telegram polling stopped")

    async def stop_polling(self) -> None:
        self._running = False
        if self._polling_task and not self._polling_task.done():
            self._polling_task.cancel()
            try:
                await self._polling_task
            except (asyncio.CancelledError, Exception):
                pass
        self._polling_task = None


_telegram_bot: TelegramBot | None = None


def get_telegram_bot() -> TelegramBot:
    global _telegram_bot
    if _telegram_bot is None:
        _telegram_bot = TelegramBot()
    return _telegram_bot

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings


settings = get_settings()


class PexelsService:
    """Thin client for Pexels search API used by presentation slides."""

    BASE_URL = "https://api.pexels.com/v1/search"

    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or settings.PEXELS_API_KEY or "").strip()

    async def search_image(self, query: str, per_page: int = 1) -> str:
        query_text = str(query or "").strip()
        if not query_text:
            return ""

        if not self.api_key:
            return ""

        safe_per_page = max(1, min(int(per_page or 1), 5))
        headers = {"Authorization": self.api_key}
        params = {
            "query": query_text,
            "per_page": safe_per_page,
            "orientation": "landscape",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(self.BASE_URL, params=params, headers=headers)
            response.raise_for_status()
            payload: dict[str, Any] = response.json() if response.content else {}
        except Exception:
            return ""

        photos = payload.get("photos") or []
        for photo in photos:
            if not isinstance(photo, dict):
                continue
            src = photo.get("src") or {}
            if not isinstance(src, dict):
                continue
            # Prefer large2x then large then original.
            for key in ("large2x", "large", "original"):
                value = str(src.get(key) or "").strip()
                if value:
                    return value

        return ""

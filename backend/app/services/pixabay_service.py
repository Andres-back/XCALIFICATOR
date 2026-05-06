from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings


settings = get_settings()


class PixabayService:
    """Thin client for Pixabay search API used by presentation slides."""

    BASE_URL = "https://pixabay.com/api/"

    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or settings.PIXABAY_API_KEY or "").strip()

    async def search_image(self, query: str, per_page: int = 1) -> str:
        query_text = str(query or "").strip()
        if not query_text:
            return ""

        if not self.api_key:
            return ""

        safe_per_page = max(1, min(int(per_page or 1), 5))
        params = {
            "key": self.api_key,
            "q": query_text,
            "per_page": safe_per_page,
            "image_type": "photo",
            "orientation": "horizontal",
            "safesearch": "true",
            "lang": "es",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            payload: dict[str, Any] = response.json() if response.content else {}
        except Exception:
            return ""

        hits = payload.get("hits") or []
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            for key in ("largeImageURL", "webformatURL", "previewURL"):
                value = str(hit.get(key) or "").strip()
                if value:
                    return value

        return ""

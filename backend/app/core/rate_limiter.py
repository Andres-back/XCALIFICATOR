import asyncio
import logging
import time
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import redis_client
from app.core.security import decode_token


logger = logging.getLogger(__name__)


class RateLimiter(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis for LLM endpoints."""

    # Limits per minute per user for expensive endpoints.
    RATE_LIMIT_RULES = (
        {
            "name": "generate",
            "prefix": "/api/generate/",
            "methods": {"POST"},
            "limit": 10,
        },
        {
            "name": "grading",
            "prefix": "/api/grading/",
            "methods": {"POST"},
            "limit": 15,
        },
        {
            "name": "chat",
            "exact_path": "/api/chat/",
            "methods": {"POST"},
            "limit": 30,
        },
    )
    WINDOW = 60  # seconds
    FALLBACK_MAX_KEYS = 10_000

    _fallback_store: dict[str, tuple[int, float]] = {}
    _fallback_lock = asyncio.Lock()

    @classmethod
    async def _fallback_check_and_increment(cls, key: str, limit: int) -> int | None:
        now = time.time()

        async with cls._fallback_lock:
            current, expires_at = cls._fallback_store.get(key, (0, now + cls.WINDOW))

            if expires_at <= now:
                current = 0
                expires_at = now + cls.WINDOW

            if current >= limit:
                retry_after = max(1, int(expires_at - now))
                return retry_after

            cls._fallback_store[key] = (current + 1, expires_at)

            # Best-effort cleanup to avoid unbounded growth while Redis is down.
            if len(cls._fallback_store) > cls.FALLBACK_MAX_KEYS:
                expired = [k for k, (_, exp) in cls._fallback_store.items() if exp <= now]
                for stale_key in expired[: cls.FALLBACK_MAX_KEYS // 2]:
                    cls._fallback_store.pop(stale_key, None)

        return None

    @staticmethod
    def _rate_limited_response(limit: int, retry_after: int, mode: str) -> JSONResponse:
        fallback_suffix = " (fallback)" if mode == "memory-fallback" else ""
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit excedido{fallback_suffix}. Máximo {limit} solicitudes por minuto.",
            },
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Reason": "per-minute",
                "X-RateLimit-Mode": mode,
            },
        )

    @classmethod
    def _resolve_rule(cls, path: str, method: str) -> tuple[str | None, int | None]:
        request_method = (method or "").upper()
        for rule in cls.RATE_LIMIT_RULES:
            methods = rule.get("methods") or set()
            if methods and request_method not in methods:
                continue

            exact_path = rule.get("exact_path")
            if exact_path is not None:
                if path != exact_path:
                    continue
            else:
                prefix = rule.get("prefix") or ""
                if not path.startswith(prefix):
                    continue

            return str(rule.get("name") or "generic"), int(rule.get("limit") or 0)

        return None, None

    @staticmethod
    def _get_request_identifier(request: Request) -> str:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
            payload = decode_token(token)
            sub = str(payload.get("sub") or "").strip() if isinstance(payload, dict) else ""
            if sub:
                return f"user:{sub}"

        client_ip = request.client.host if request.client else "unknown"
        return f"ip:{client_ip}"

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        bucket, limit = self._resolve_rule(path, request.method)

        if not bucket or not limit:
            return await call_next(request)

        identifier = self._get_request_identifier(request)
        key = f"rate_limit:{bucket}:{identifier}"
        limiter_mode = "redis"
        rate_limited_response = None

        try:
            current = await redis_client.incr(key)
            if current == 1:
                await redis_client.expire(key, self.WINDOW)

            if current > limit:
                ttl = await redis_client.ttl(key)
                retry_after = ttl if ttl and ttl > 0 else self.WINDOW
                rate_limited_response = self._rate_limited_response(limit, retry_after, "redis")
        except Exception as exc:
            limiter_mode = "memory-fallback"
            logger.warning(
                "Redis unavailable for rate limiting, using in-memory fallback",
                exc_info=exc,
            )
            retry_after = await self._fallback_check_and_increment(key, limit)
            if retry_after is not None:
                rate_limited_response = self._rate_limited_response(limit, retry_after, limiter_mode)

        if rate_limited_response is not None:
            return rate_limited_response

        response = await call_next(request)
        response.headers["X-RateLimit-Mode"] = limiter_mode

        return response

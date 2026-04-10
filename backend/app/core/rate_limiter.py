import asyncio
import logging
import time
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import redis_client


logger = logging.getLogger(__name__)


class RateLimiter(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis for LLM endpoints."""

    # Limits per minute per user
    RATE_LIMITS = {
        "/api/generate/": 10,
        "/api/grading/": 15,
        "/api/chat/": 30,
    }
    WINDOW = 60  # seconds
    FALLBACK_MAX_KEYS = 10_000

    _fallback_store: dict[str, tuple[int, float]] = {}
    _fallback_lock = asyncio.Lock()

    @classmethod
    async def _fallback_check_and_increment(cls, key: str, limit: int):
        now = time.time()

        async with cls._fallback_lock:
            current, expires_at = cls._fallback_store.get(key, (0, now + cls.WINDOW))

            if expires_at <= now:
                current = 0
                expires_at = now + cls.WINDOW

            if current >= limit:
                retry_after = max(1, int(expires_at - now))
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit excedido (fallback). Máximo {limit} solicitudes por minuto.",
                    headers={"Retry-After": str(retry_after)},
                )

            cls._fallback_store[key] = (current + 1, expires_at)

            # Best-effort cleanup to avoid unbounded growth while Redis is down.
            if len(cls._fallback_store) > cls.FALLBACK_MAX_KEYS:
                expired = [k for k, (_, exp) in cls._fallback_store.items() if exp <= now]
                for stale_key in expired[: cls.FALLBACK_MAX_KEYS // 2]:
                    cls._fallback_store.pop(stale_key, None)

    async def dispatch(self, request: Request, call_next):
        # Check if this request needs rate limiting
        path = request.url.path
        limit = None
        for prefix, rpm in self.RATE_LIMITS.items():
            if path.startswith(prefix):
                limit = rpm
                break

        if limit is None:
            return await call_next(request)

        # Get user identifier (IP or user ID from token)
        client_ip = request.client.host if request.client else "unknown"
        auth_header = request.headers.get("Authorization", "")
        identifier = auth_header[-20:] if auth_header else client_ip

        key = f"rate_limit:{path.split('/')[2]}:{identifier}"
        limiter_mode = "redis"

        try:
            current = await redis_client.incr(key)
            if current == 1:
                await redis_client.expire(key, self.WINDOW)

            if current > limit:
                ttl = await redis_client.ttl(key)
                retry_after = ttl if ttl and ttl > 0 else self.WINDOW
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit excedido. Máximo {limit} solicitudes por minuto.",
                    headers={"Retry-After": str(retry_after)},
                )
        except HTTPException:
            raise
        except Exception as exc:
            limiter_mode = "memory-fallback"
            logger.warning(
                "Redis unavailable for rate limiting, using in-memory fallback",
                exc_info=exc,
            )
            await self._fallback_check_and_increment(key, limit)

        response = await call_next(request)
        response.headers["X-RateLimit-Mode"] = limiter_mode

        return response

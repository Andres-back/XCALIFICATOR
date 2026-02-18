import time
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import redis_client


class RateLimiter(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis for LLM endpoints."""

    # Limits per minute per user
    RATE_LIMITS = {
        "/api/generate/": 10,
        "/api/grading/": 15,
        "/api/chat/": 30,
    }
    WINDOW = 60  # seconds

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

        try:
            current = await redis_client.get(key)
            if current and int(current) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit excedido. Máximo {limit} solicitudes por minuto.",
                )

            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, self.WINDOW)
            await pipe.execute()
        except HTTPException:
            raise
        except Exception:
            # If Redis fails, let the request through
            pass

        return await call_next(request)

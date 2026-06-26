import time
import os
from urllib.parse import urlparse
import redis.asyncio as redis
from app.core.config import get_settings

settings = get_settings()

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


async def get_redis():
    return redis_client


async def check_redis_health() -> dict:
    started = time.perf_counter()
    last_error = None

    for _ in range(2):
        health_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await health_client.ping()
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            return {
                "status": "up",
                "latency_ms": latency_ms,
            }
        except Exception as exc:
            last_error = exc
        finally:
            await health_client.aclose()

    if last_error and last_error.__class__.__name__ == "AuthenticationError":
        parsed = urlparse(settings.REDIS_URL)
        fallback_client = redis.Redis(
            host=parsed.hostname or "redis",
            port=parsed.port or 6379,
            db=int((parsed.path or "/0").lstrip("/") or 0),
            password=os.getenv("REDIS_PASSWORD") or None,
            decode_responses=True,
        )
        try:
            await fallback_client.ping()
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            return {
                "status": "up",
                "latency_ms": latency_ms,
            }
        except Exception as fallback_exc:
            return {
                "status": "down",
                "error": fallback_exc.__class__.__name__,
            }
        finally:
            await fallback_client.aclose()

    return {
        "status": "down",
        "error": last_error.__class__.__name__ if last_error else "UnknownError",
    }

import time
import redis.asyncio as redis
from app.core.config import get_settings

settings = get_settings()

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


async def get_redis():
    return redis_client


async def check_redis_health() -> dict:
    started = time.perf_counter()
    try:
        await redis_client.ping()
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "status": "up",
            "latency_ms": latency_ms,
        }
    except Exception as exc:
        return {
            "status": "down",
            "error": exc.__class__.__name__,
        }

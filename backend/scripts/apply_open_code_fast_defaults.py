import asyncio

from app.core.ai_provider_config import get_global_ai_config, upsert_global_ai_config
from app.core.database import AsyncSessionLocal


FAST_MODEL = "DeepSeek V4 Flash"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        cfg = await get_global_ai_config(db)
        before = {
            "content_provider": cfg.get("content_provider"),
            "content_model": cfg.get("content_model"),
            "content_fallback_provider": cfg.get("content_fallback_provider"),
            "content_fallback_model": cfg.get("content_fallback_model"),
            "grading_provider": cfg.get("grading_provider"),
            "grading_model": cfg.get("grading_model"),
            "grading_fallback_provider": cfg.get("grading_fallback_provider"),
            "grading_fallback_model": cfg.get("grading_fallback_model"),
            "open_code_content_model": cfg.get("open_code_content_model"),
            "open_code_feedback_model": cfg.get("open_code_feedback_model"),
            "open_code_vision_model": cfg.get("open_code_vision_model"),
        }

        cfg["open_code_content_model"] = FAST_MODEL
        cfg["open_code_feedback_model"] = FAST_MODEL
        if cfg.get("content_provider") == "open_code":
            cfg["content_model"] = FAST_MODEL
        if cfg.get("content_fallback_provider") == "open_code":
            cfg["content_fallback_model"] = FAST_MODEL
        if cfg.get("grading_provider") == "open_code":
            cfg["grading_model"] = FAST_MODEL
        if cfg.get("grading_fallback_provider") == "open_code":
            cfg["grading_fallback_model"] = FAST_MODEL

        updated = await upsert_global_ai_config(db, cfg, updated_by=None)
        await db.commit()

        after = {
            "content_provider": updated.get("content_provider"),
            "content_model": updated.get("content_model"),
            "content_fallback_provider": updated.get("content_fallback_provider"),
            "content_fallback_model": updated.get("content_fallback_model"),
            "grading_provider": updated.get("grading_provider"),
            "grading_model": updated.get("grading_model"),
            "grading_fallback_provider": updated.get("grading_fallback_provider"),
            "grading_fallback_model": updated.get("grading_fallback_model"),
            "open_code_content_model": updated.get("open_code_content_model"),
            "open_code_feedback_model": updated.get("open_code_feedback_model"),
            "open_code_vision_model": updated.get("open_code_vision_model"),
        }

    print("before=", before)
    print("after=", after)


if __name__ == "__main__":
    asyncio.run(main())

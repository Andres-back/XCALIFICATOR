-- 2026-04-10
-- Add chat model config for professor AI settings.

ALTER TABLE IF EXISTS profesor_ai_configs
ADD COLUMN IF NOT EXISTS chat_model VARCHAR(120);

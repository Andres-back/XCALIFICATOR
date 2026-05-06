ALTER TABLE IF EXISTS ai_global_config ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255);
ALTER TABLE IF EXISTS profesor_ai_configs ADD COLUMN IF NOT EXISTS ollama_api_key VARCHAR(255);

INSERT INTO ai_global_config (
  id,
  grading_provider,
  grading_model,
  grading_fallback_provider,
  grading_fallback_model,
  ocr_provider,
  ocr_model,
  ocr_fallback_provider,
  ocr_fallback_model,
  chat_model,
  ollama_url,
  ollama_api_key,
  updated_at,
  updated_by
)
VALUES (
  1,
  'ollama',
  'glm-5.1:cloud',
  'groq',
  'llama-3.3-70b-versatile',
  'ollama_vision',
  'qwen3-vl:235b-cloud',
  'groq_vision',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  NULL,
  'http://host.docker.internal:11434',
  NULL,
  NOW(),
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  grading_provider = EXCLUDED.grading_provider,
  grading_model = EXCLUDED.grading_model,
  grading_fallback_provider = EXCLUDED.grading_fallback_provider,
  grading_fallback_model = EXCLUDED.grading_fallback_model,
  ocr_provider = EXCLUDED.ocr_provider,
  ocr_model = EXCLUDED.ocr_model,
  ocr_fallback_provider = EXCLUDED.ocr_fallback_provider,
  ocr_fallback_model = EXCLUDED.ocr_fallback_model,
  ollama_url = EXCLUDED.ollama_url,
  ollama_api_key = EXCLUDED.ollama_api_key,
  updated_at = NOW(),
  updated_by = EXCLUDED.updated_by;

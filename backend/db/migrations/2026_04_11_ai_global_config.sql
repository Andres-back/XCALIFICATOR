-- 2026-04-11
-- Configuración IA/OCR global (preferida) con override opcional por profesor.

CREATE TABLE IF NOT EXISTS ai_global_config (
  id                         SMALLINT PRIMARY KEY DEFAULT 1,
  grading_provider           VARCHAR(30) NOT NULL DEFAULT 'groq',
  grading_model              VARCHAR(120),
  grading_fallback_provider  VARCHAR(30),
  grading_fallback_model     VARCHAR(120),
  ocr_provider               VARCHAR(30) NOT NULL DEFAULT 'paddleocr',
  ocr_model                  VARCHAR(120),
  ocr_fallback_provider      VARCHAR(30),
  ocr_fallback_model         VARCHAR(120),
  chat_model                 VARCHAR(120),
  ollama_url                 VARCHAR(255) NOT NULL DEFAULT 'http://host.docker.internal:11434',
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK (id = 1)
);

INSERT INTO ai_global_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

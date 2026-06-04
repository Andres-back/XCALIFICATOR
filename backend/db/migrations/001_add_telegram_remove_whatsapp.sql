-- =============================================
-- Migration 001: Add Telegram linking, remove WhatsApp/Whapi
-- =============================================
-- Date: 2026-06-04
-- Author: Tesis cleanup
--
-- Aditiva: agrega columnas Telegram, elimina columna Whapi.
-- Si ejecuta en una DB con init.sql ya aplicado, solo hace ALTER.
-- Si ejecuta en una DB nueva, no hace nada (init.sql ya la deja correcta).

BEGIN;

-- 1. Eliminar columna WhatsApp/Whapi
ALTER TABLE preferencias_notif DROP COLUMN IF EXISTS acepta_whatsapp;

-- 2. Agregar columna acepta_telegram (idempotente)
ALTER TABLE preferencias_notif ADD COLUMN IF NOT EXISTS acepta_telegram BOOLEAN DEFAULT FALSE;

-- 3. Agregar columnas de vinculacion Telegram en users (idempotente)
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code_expires TIMESTAMPTZ;

-- 4. Indice para busqueda por chat_id (idempotente)
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);

-- 5. Limpiar referencias en notificaciones viejas (canal='whatsapp' → 'telegram' solo donde aplique; aqui solo a tipo descriptivo)
UPDATE notificaciones SET canal = 'telegram' WHERE canal = 'whatsapp';

COMMIT;

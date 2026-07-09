-- Migración para añadir el campo de bloqueo de concurrencia al bot
-- Ejecutar en Supabase SQL Editor

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS bot_bloqueado_hasta timestamp with time zone DEFAULT '2000-01-01T00:00:00Z';
UPDATE conversaciones SET bot_bloqueado_hasta = '2000-01-01T00:00:00Z' WHERE bot_bloqueado_hasta IS NULL;

-- Migración para guardar la escuela/prepa de cada prospecto y poder usarla como
-- variable {escuela} en las plantillas de WhatsApp.
-- Ejecutar en Supabase SQL Editor ANTES de desplegar.

ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS escuela text;

CREATE INDEX IF NOT EXISTS prospectos_escuela_idx ON prospectos (escuela);

-- Migración para guardar el estado real de entrega que reporta WhatsApp por cada mensaje enviado
-- Ejecutar en Supabase SQL Editor ANTES de desplegar

ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS wamid text;           -- id del mensaje en Meta, para cruzar los estados
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS estado_entrega text;  -- sent | delivered | read | failed
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS error_entrega text;   -- motivo cuando estado_entrega = failed

CREATE INDEX IF NOT EXISTS mensajes_wamid_idx ON mensajes (wamid);

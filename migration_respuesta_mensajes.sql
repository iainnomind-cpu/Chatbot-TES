-- Migración para guardar a qué mensaje responde cada mensaje del inbox
-- Ejecutar en Supabase SQL Editor ANTES de desplegar la función de responder

ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS respuesta_a_id uuid REFERENCES mensajes(id) ON DELETE SET NULL;

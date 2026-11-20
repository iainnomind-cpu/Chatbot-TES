-- Migración para guardar en cada campaña el valor de las variables de su plantilla
-- (antes se rellenaban solas con el nombre de la campaña y un link de seguimiento).
-- Ejecutar en Supabase SQL Editor ANTES de desplegar.

ALTER TABLE campanas ADD COLUMN IF NOT EXISTS variables jsonb;

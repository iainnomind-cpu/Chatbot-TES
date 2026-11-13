-- Migración para los seguimientos automáticos configurables (hasta 4 intentos)
-- Ejecutar en Supabase SQL Editor ANTES de desplegar

ALTER TABLE configuracion_bot ADD COLUMN IF NOT EXISTS seguimiento jsonb;
-- Si queda en NULL se usan los valores por defecto del código (ver src/lib/seguimientos.js)

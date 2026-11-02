-- Migración para permitir varias suscripciones push por usuario (una por dispositivo)
-- Ejecutar en Supabase SQL Editor ANTES de desplegar

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS endpoint text;

-- subscription se guardó como texto JSON dentro de jsonb: #>> '{}' lo convierte de nuevo a objeto
UPDATE push_subscriptions
SET endpoint = (subscription #>> '{}')::jsonb ->> 'endpoint'
WHERE endpoint IS NULL;

ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
DROP INDEX IF EXISTS push_subscriptions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions (endpoint);

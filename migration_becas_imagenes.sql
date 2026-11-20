-- Imágenes que acompañan las respuestas de la beca (por ejemplo la tabla de precios).
-- Se suben desde Campañas → Becas. Ejecutar en Supabase SQL Editor.

ALTER TABLE becas_convenio ADD COLUMN IF NOT EXISTS imagen_inicial text;
ALTER TABLE becas_convenio ADD COLUMN IF NOT EXISTS imagen_precios text;

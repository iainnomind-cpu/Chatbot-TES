-- Migración: Agregar soporte para cursos especiales/temporales
-- Ejecutar en Supabase SQL Editor

ALTER TABLE cursos ADD COLUMN IF NOT EXISTS es_especial boolean DEFAULT false;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS fecha_inicio_vigencia date;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS fecha_fin_vigencia date;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS edad_minima integer;
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS edad_maxima integer;

-- Comentarios para documentar los campos
COMMENT ON COLUMN cursos.es_especial IS 'Si true, el bot recomienda este curso directamente sin hacer el perfilamiento completo';
COMMENT ON COLUMN cursos.fecha_inicio_vigencia IS 'Fecha desde la cual el curso está activo (para cursos temporales)';
COMMENT ON COLUMN cursos.fecha_fin_vigencia IS 'Fecha hasta la cual el curso está activo (para cursos temporales)';
COMMENT ON COLUMN cursos.edad_minima IS 'Edad mínima del alumno para este curso';
COMMENT ON COLUMN cursos.edad_maxima IS 'Edad máxima del alumno para este curso';

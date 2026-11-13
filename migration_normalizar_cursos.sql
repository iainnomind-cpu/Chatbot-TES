-- Migración opcional: unifica el curso de interés ya guardado con el nombre exacto de la tabla cursos
-- (ej. "MY TIME" -> "My Time"). Ejecutar en Supabase SQL Editor. Se puede repetir sin riesgo.

UPDATE prospectos p
SET curso_interes = c.nombre
FROM cursos c
WHERE p.curso_interes IS NOT NULL
  AND lower(trim(p.curso_interes)) = lower(trim(c.nombre))
  AND p.curso_interes <> c.nombre;

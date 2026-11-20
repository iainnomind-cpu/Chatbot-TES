-- Becas por convenio con escuelas (Beca Alianza Educativa).
-- Cuando un alumno escribe una palabra clave (ej. "BECA PREPA"), Alex responde con los
-- textos de esta tabla, sin inventar cifras. Para agregar otra escuela, copia el INSERT
-- de abajo y cambia los datos, o usa la pestaña Becas en Campañas.
-- Ejecutar en Supabase SQL Editor ANTES de desplegar.

CREATE TABLE IF NOT EXISTS becas_convenio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  escuela text NOT NULL,
  palabras_clave text[] NOT NULL DEFAULT '{}',
  respuesta_inicial text NOT NULL,
  respuesta_precios text,
  detalles text,
  activa boolean DEFAULT true,
  creado_en timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- La conversación recuerda de qué beca se habló, para responder dudas posteriores
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS beca_id uuid REFERENCES becas_convenio(id) ON DELETE SET NULL;

INSERT INTO becas_convenio (escuela, palabras_clave, respuesta_inicial, respuesta_precios, detalles)
SELECT
  'Prepa ICEP',
  ARRAY['beca prepa', 'beca alianza', 'prepa icep', 'icep'],
  '¡Hola! Por ser estudiante de Prepa ICEP, puedes solicitar la Beca Alianza Educativa ICEP – Total English, con inscripción y colegiaturas preferenciales en el Diplomado PRIME.

Practicas y elevas tu Inglés, desde tu nivel actual, en grupos reducidos y con tutorías sin costo. Además nuestro sistema te GARANTIZA speaking real.

¿Te gustaría agendar una visita para tomar una clase de cortesía y hacer un diagnóstico personalizado de Inglés? Ambos son sin costo.',
  'Con el convenio de Prepa ICEP, estos son tus beneficios en pesos mexicanos:

Inscripción única: $800 en lugar de $2,400. Ahorras $1,600 (67% aprox.).
Meses 1 a 3: $1,100 al mes. Ahorras $750 al mes (41% aprox.).
Meses 4 a 10: $1,300 al mes. Ahorras $550 al mes (30% aprox.).

Tu ahorro anual es de $8,800 en 12 meses, con inscripción incluida. La colegiatura regular es de $1,850 al mes y tienes un ahorro de $550 al mes del mes 4 al 12.

¿Te ayudo a agendar tu clase de cortesía y tu diagnóstico personalizado de Inglés? Ambos son sin costo.',
  'MATERIAL: $900 por nivel en los niveles 1 y 2, y $1,300 en los niveles 3 a 5. El material va aparte del cálculo de ahorro.
PROGRAMA: PRIME es para jóvenes desde los 14 años y va de A1 a B2 en cinco niveles.
GARANTÍA DE NIVEL: un asesor la explica (TRANSFER_HUMANO si insisten en el detalle).
PROGRAMA COMPLETO: $18,700 de ahorro en 30 meses, con inscripción incluida, y $550 de ahorro mensual del mes 4 al 30. El asesor confirma las cuotas de esos meses.'
WHERE NOT EXISTS (SELECT 1 FROM becas_convenio WHERE escuela = 'Prepa ICEP');

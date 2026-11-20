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
  '¡Hola! 👋 Qué gusto que nos escribas.

Por ser estudiante de Prepa ICEP 🎓 puedes solicitar la Beca Alianza Educativa ICEP – Total English, con inscripción y colegiaturas preferenciales en el Diplomado PRIME 🇬🇧

✨ Avanzas desde tu nivel actual
👥 Grupos reducidos
📚 Tutorías sin costo
🗣️ Y nuestro sistema te GARANTIZA speaking real

¿Te gustaría venir a una clase de cortesía y hacer tu diagnóstico de Inglés? 😊 Los dos son sin costo ✅',
  '¡Claro! 😊 Con el convenio de Prepa ICEP estos son tus beneficios 👇

💳 Inscripción única: $800 en lugar de $2,400 → ahorras $1,600 (67% aprox.)
📅 Meses 1 a 3: $1,100 al mes → ahorras $750 al mes (41% aprox.)
📅 Meses 4 a 10: $1,300 al mes → ahorras $550 al mes (30% aprox.)

🎉 Tu ahorro anual es de $8,800 en 12 meses, con inscripción incluida. La colegiatura regular es de $1,850 al mes, así que ahorras $550 cada mes del 4 al 12.

¿Te aparto tu lugar para la clase de cortesía y tu diagnóstico de Inglés? ✨ Ambos sin costo.',
  'TONO: cálido y cercano, de tú, con 1 o 2 emojis por mensaje. Nunca cambies las cifras.
MATERIAL 📚: $900 por nivel en los niveles 1 y 2, y $1,300 en los niveles 3 a 5. Va aparte del cálculo de ahorro.
PROGRAMA 🎓: PRIME es para jóvenes desde los 14 años y va de A1 a B2 en cinco niveles.
GARANTÍA DE NIVEL: un asesor la explica (TRANSFER_HUMANO si piden el detalle).
PROGRAMA COMPLETO 🎉: $18,700 de ahorro en 30 meses, con inscripción incluida, y $550 de ahorro mensual del mes 4 al 30. El asesor confirma las cuotas de esos meses.'
WHERE NOT EXISTS (SELECT 1 FROM becas_convenio WHERE escuela = 'Prepa ICEP');

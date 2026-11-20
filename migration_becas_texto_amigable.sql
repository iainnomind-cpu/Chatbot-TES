-- Textos más cálidos y con emojis para la Beca Prepa ICEP.
-- Las cifras son exactamente las mismas; solo cambia la forma de decirlo.
-- Ejecutar en Supabase SQL Editor (también se pueden editar en Campañas → Becas).

UPDATE becas_convenio SET
  respuesta_inicial = '¡Hola! 👋 Qué gusto que nos escribas.

Por ser estudiante de Prepa ICEP 🎓 puedes solicitar la Beca Alianza Educativa ICEP – Total English, con inscripción y colegiaturas preferenciales en el Diplomado PRIME 🇬🇧

✨ Avanzas desde tu nivel actual
👥 Grupos reducidos
📚 Tutorías sin costo
🗣️ Y nuestro sistema te GARANTIZA speaking real

¿Te gustaría venir a una clase de cortesía y hacer tu diagnóstico de Inglés? 😊 Los dos son sin costo ✅',

  respuesta_precios = '¡Claro! 😊 Con el convenio de Prepa ICEP estos son tus beneficios 👇

💳 Inscripción única: $800 en lugar de $2,400 → ahorras $1,600 (67% aprox.)
📅 Meses 1 a 3: $1,100 al mes → ahorras $750 al mes (41% aprox.)
📅 Meses 4 a 10: $1,300 al mes → ahorras $550 al mes (30% aprox.)

🎉 Tu ahorro anual es de $8,800 en 12 meses, con inscripción incluida. La colegiatura regular es de $1,850 al mes, así que ahorras $550 cada mes del 4 al 12.

¿Te aparto tu lugar para la clase de cortesía y tu diagnóstico de Inglés? ✨ Ambos sin costo.',

  detalles = 'TONO: cálido y cercano, de tú, con 1 o 2 emojis por mensaje. Nunca cambies las cifras.
MATERIAL 📚: $900 por nivel en los niveles 1 y 2, y $1,300 en los niveles 3 a 5. Va aparte del cálculo de ahorro.
PROGRAMA 🎓: PRIME es para jóvenes desde los 14 años y va de A1 a B2 en cinco niveles.
GARANTÍA DE NIVEL: un asesor la explica (TRANSFER_HUMANO si piden el detalle).
PROGRAMA COMPLETO 🎉: $18,700 de ahorro en 30 meses, con inscripción incluida, y $550 de ahorro mensual del mes 4 al 30. El asesor confirma las cuotas de esos meses.'
WHERE escuela = 'Prepa ICEP';

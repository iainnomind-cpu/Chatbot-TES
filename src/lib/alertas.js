// Alertas para los asesores sobre conversaciones que se están quedando sin atención.
// Lógica pura; el cron horario la ejecuta y manda las notificaciones push.

export const HORAS_SIN_RESPUESTA_ASESOR = 2   // conversación en manos de un asesor
export const MINUTOS_SIN_RESPUESTA_BOT = 20    // conversación en manos de Alex (algo falló)

// Para no repetir la misma alerta cada corrida, solo se avisa dentro de la primera
// ventana de una hora después de cumplirse el plazo (el cron corre cada hora).
const enVentana = (horasDesde, umbralHoras) => horasDesde >= umbralHoras && horasDesde < umbralHoras + 1

// conversaciones: [{ id, asignado_a_humano, prospectos, ultimo: { remitente, creado_en } }]
export function alertasPendientes(conversaciones, ahora = new Date()) {
  const alertas = []
  for (const c of conversaciones || []) {
    if (!c?.ultimo || c.ultimo.remitente !== 'usuario') continue
    const horas = (ahora - new Date(c.ultimo.creado_en)) / 36e5
    const nombre = c.prospectos?.nombre_alumno || c.prospectos?.nombre || c.id_plataforma || 'Prospecto'
    const caliente = /CALIENTE/i.test(c.prospectos?.lead_score || '')

    if (c.asignado_a_humano) {
      if (enVentana(horas, HORAS_SIN_RESPUESTA_ASESOR)) {
        alertas.push({
          conversacionId: c.id,
          tipo: 'asesor_sin_responder',
          title: caliente ? '🔥 Prospecto caliente sin respuesta' : '⏰ Prospecto sin respuesta',
          body: `${nombre} escribió hace ${HORAS_SIN_RESPUESTA_ASESOR} h y nadie le ha contestado`,
        })
      }
    } else if (enVentana(horas, MINUTOS_SIN_RESPUESTA_BOT / 60)) {
      // Alex debió contestar en segundos: si no lo hizo, algo falló y hay que atenderlo a mano
      alertas.push({
        conversacionId: c.id,
        tipo: 'bot_sin_responder',
        title: '⚠️ Alex no respondió',
        body: `${nombre} escribió hace ${MINUTOS_SIN_RESPUESTA_BOT} min y el bot no contestó. Revísalo.`,
      })
    }
  }
  return alertas
}

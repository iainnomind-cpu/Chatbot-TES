// Estado de entrega de los mensajes enviados por WhatsApp.
// Meta avisa por webhook: sent -> delivered -> read, o failed. Nunca se baja de nivel
// (si "delivered" llega después de "read", se conserva "read").

const NIVEL = { sent: 1, delivered: 2, read: 3 }

// Mensajes de error de Meta más comunes, en palabras que entienda el asesor
const ERRORES_CONOCIDOS = {
  131026: 'El número no tiene WhatsApp o no acepta mensajes',
  131047: 'Pasaron más de 24 h sin respuesta del prospecto: solo se puede enviar una plantilla',
  131049: 'Meta limitó la entrega a este número (frecuencia de mensajes)',
  131051: 'Tipo de mensaje no soportado por el destinatario',
  130472: 'El número forma parte de un experimento de Meta y no recibe mensajes de negocios',
  131000: 'Error interno de WhatsApp al entregar',
}

export function describirErrorMeta(error) {
  if (!error) return 'No se pudo entregar'
  return ERRORES_CONOCIDOS[error.code] || error.error_data?.details || error.title || error.message || `Error ${error.code}`
}

// Aplica un objeto "status" del webhook de WhatsApp al mensaje que tenga ese wamid.
// Algunos envíos antiguos guardaron el wamid en id_mensaje_meta: también se buscan ahí.
export async function registrarEstadoEntrega(supabase, status) {
  const wamid = status?.id
  const estado = status?.status
  if (!wamid || !estado) return 0

  let consulta = supabase.from('mensajes')
  if (estado === 'failed') {
    consulta = consulta.update({ estado_entrega: 'failed', error_entrega: describirErrorMeta(status.errors?.[0]) })
  } else if (NIVEL[estado]) {
    const inferiores = Object.keys(NIVEL).filter(e => NIVEL[e] < NIVEL[estado])
    consulta = consulta
      .update({ estado_entrega: estado, error_entrega: null })
      .or(`estado_entrega.is.null,estado_entrega.in.(${[...inferiores, 'failed'].join(',')})`)
  } else {
    return 0
  }

  const { data, error } = await consulta.or(`wamid.eq.${wamid},id_mensaje_meta.eq.${wamid}`).select('id')
  if (error) {
    console.error('[ENTREGA] No se pudo guardar el estado', estado, 'de', wamid, ':', error.message)
    return 0
  }
  return data?.length || 0
}

// Tras enviar un mensaje del bot: guarda el wamid (si Meta lo devolvió) o lo marca como fallido
export async function marcarEnvio(supabase, idMensaje, resultado) {
  if (!idMensaje) return
  const cambios = typeof resultado === 'string' && resultado
    ? { wamid: resultado, estado_entrega: 'sent' }
    : resultado
      ? { estado_entrega: 'sent' } // Messenger/Instagram no devuelven id reutilizable
      : { estado_entrega: 'failed', error_entrega: 'Meta rechazó el envío (ver registros del servidor)' }
  const { error } = await supabase.from('mensajes').update(cambios).eq('id', idMensaje)
  if (error) console.error('[ENTREGA] No se pudo marcar el envío', idMensaje, ':', error.message)
}

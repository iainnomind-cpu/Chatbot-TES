// Reglas de los seguimientos automáticos a prospectos que dejaron de responder.
// Lógica pura (sin red ni base de datos) para poder probarla; el cron la ejecuta.

export const MAX_INTENTOS = 4
export const ZONA_HORARIA = 'America/Mexico_City'

export const CONFIG_SEGUIMIENTO_DEFAULT = {
  activo: true,
  // Horas de silencio del prospecto para cada intento
  horas: [3, 24, 72, 168],
  // Plantilla aprobada por intento (obligatoria cuando el prospecto lleva más de 24 h sin escribir).
  // Vacío = mensaje libre, que WhatsApp solo entrega dentro de las 24 h.
  plantillas: ['', '', '', ''],
  scores: { FRIO: true, TIBIO: true, SIN_SCORE: true },
  hora_inicio: '09:00',
  hora_fin: '20:00',
}

export function normalizarConfig(guardada) {
  const c = { ...CONFIG_SEGUIMIENTO_DEFAULT, ...(guardada || {}) }
  c.horas = Array.from({ length: MAX_INTENTOS }, (_, i) => Number(c.horas?.[i]) || CONFIG_SEGUIMIENTO_DEFAULT.horas[i])
  c.plantillas = Array.from({ length: MAX_INTENTOS }, (_, i) => (c.plantillas?.[i] || '').trim())
  c.scores = { ...CONFIG_SEGUIMIENTO_DEFAULT.scores, ...(c.scores || {}) }
  return c
}

// FRÍO/frio/Frio -> FRIO; vacío -> SIN_SCORE
export function claveScore(leadScore) {
  const s = (leadScore || '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return s === '' ? 'SIN_SCORE' : s
}

export const esSeguimientoAutomatico = (m) => String(m.id_mensaje_meta || '').startsWith('seguimiento_auto')

function horaLocal(fecha) {
  const partes = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(fecha)
  const h = Number(partes.find(p => p.type === 'hour').value) % 24
  const m = Number(partes.find(p => p.type === 'minute').value)
  return h * 60 + m
}

const minutosDe = (hhmm) => { const [h, m] = (hhmm || '00:00').split(':').map(Number); return h * 60 + (m || 0) }

export function dentroDeHorario(ahora, config) {
  const actual = horaLocal(ahora)
  return actual >= minutosDe(config.hora_inicio) && actual < minutosDe(config.hora_fin)
}

const ESTADOS_CERRADOS = ['convertido', 'perdido', 'descartado']

// Decide si a una conversación le toca seguimiento ahora.
// mensajes: historial completo en orden cronológico ({ remitente, creado_en, id_mensaje_meta }).
export function decidirSeguimiento({ ahora, config, mensajes, prospecto, conversacion, citaPendiente }) {
  const omitir = (motivo) => ({ enviar: false, motivo })
  if (!config.activo) return omitir('desactivado')
  if (!conversacion || conversacion.plataforma !== 'whatsapp') return omitir('no_whatsapp')
  if (conversacion.asignado_a_humano) return omitir('asignado_a_humano')
  if (!prospecto) return omitir('sin_prospecto')
  if (citaPendiente) return omitir('tiene_cita')
  if (ESTADOS_CERRADOS.includes((prospecto.estado || '').toLowerCase())) return omitir('cerrado')
  if ((prospecto.etapa_funnel || '').includes('Descartado') || (prospecto.etapa_funnel || '').startsWith('6.')) return omitir('cerrado')
  if (!config.scores[claveScore(prospecto.lead_score)]) return omitir('score_excluido')
  if (!mensajes || mensajes.length === 0) return omitir('sin_mensajes')

  const ultimo = mensajes[mensajes.length - 1]
  if (ultimo.remitente === 'usuario') return omitir('prospecto_respondio')

  // El contador se reinicia cada vez que el prospecto escribe
  let idxUltimoUsuario = -1
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].remitente === 'usuario') { idxUltimoUsuario = i; break }
  }
  if (idxUltimoUsuario === -1) return omitir('nunca_escribio')
  const desdeUltimoUsuario = mensajes.slice(idxUltimoUsuario + 1)
  const intentosHechos = desdeUltimoUsuario.filter(esSeguimientoAutomatico).length
  if (intentosHechos >= MAX_INTENTOS) return omitir('maximo_alcanzado')

  const ultimoUsuario = new Date(mensajes[idxUltimoUsuario].creado_en)
  const horasSilencio = (ahora - ultimoUsuario) / 36e5
  const intento = intentosHechos + 1
  if (horasSilencio < config.horas[intento - 1]) return omitir('todavia_no')

  // Que no se amontonen dos intentos en la misma corrida si el cron estuvo detenido
  const ultimoEnvio = new Date(ultimo.creado_en)
  if ((ahora - ultimoEnvio) / 36e5 < 1) return omitir('envio_reciente')

  if (!dentroDeHorario(ahora, config)) return omitir('fuera_de_horario')

  const ventanaAbierta = horasSilencio < 24
  const plantilla = config.plantillas[intento - 1]
  if (!ventanaAbierta && !plantilla) return omitir('falta_plantilla')

  return {
    enviar: true,
    intento,
    horasSilencio,
    modo: plantilla ? 'plantilla' : 'texto',
    plantilla: plantilla || null,
    esUltimo: intento === MAX_INTENTOS,
  }
}

// Mensaje libre (solo dentro de las 24 h): corto y según lo que falte del perfil
export function mensajeSeguimientoTexto(prospecto, intento) {
  const nombre = prospecto.nombre_alumno || prospecto.nombre || ''
  const saludo = nombre && nombre !== 'Prospecto' && nombre !== 'Interesado' ? `¡Hola ${nombre}!` : '¡Hola!'
  const tieneEdad = !!prospecto.edad
  const tieneNivel = prospecto.nivel && prospecto.nivel !== 'Desconocido'
  const tieneCurso = prospecto.curso_interes && prospecto.curso_interes !== 'Desconocido'

  if (intento >= 3) {
    return `${saludo} Soy Alex de Total English 🏫 No quiero insistir de más: si todavía te interesa el curso, respóndeme y seguimos cuando tú quieras. 😊`
  }
  if (!tieneEdad) {
    return `${saludo} Soy Alex de Total English 😊 Nos quedamos a medias. ¿Para quién es el curso y qué edad tiene? Con eso te recomiendo el programa ideal.`
  }
  if (!tieneNivel) {
    return `${saludo} Solo me falta un dato para recomendarte el curso ideal: ¿tiene nivel previo de inglés o empezaría desde Nivel 1? 🇬🇧`
  }
  if (tieneCurso) {
    return `${saludo} ¿Te quedó alguna duda sobre ${prospecto.curso_interes}? 😊 Si quieres, agendamos una visita o una llamada rápida para resolverla.`
  }
  return `${saludo} ¿Seguimos con tu recomendación de curso? 😊 Estoy aquí para ayudarte.`
}

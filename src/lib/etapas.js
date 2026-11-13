// Etapas del embudo (las mismas de la pestaña Seguimiento). El bot solo las avanza,
// nunca las regresa; "Inscripción" y "Descartado" se marcan a mano.

export const ETAPAS = [
  '1. Prospecto nuevo',
  '2. Contactado',
  '3. Lead calificado',
  '4. DX / Cita agendada',
  '5. DX / Cita asistida',
  '6. Inscripción',
  '❌ Sin interés / Descartado',
]

export const ETAPA_CONTACTADO = ETAPAS[1]
export const ETAPA_CALIFICADO = ETAPAS[2]
export const ETAPA_CITA = ETAPAS[3]

const AUTOMATICAS = [ETAPA_CONTACTADO, ETAPA_CALIFICADO, ETAPA_CITA]

// Etapa que le corresponde al prospecto según lo que pasó en la conversación
export function etapaSugerida({ intencion, prospecto, citaAgendada }) {
  if (citaAgendada || intencion === 'CIERRE_CITA') return ETAPA_CITA
  const score = (prospecto?.lead_score || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const perfilCompleto = !!prospecto?.edad && !!prospecto?.nivel && prospecto.nivel !== 'Desconocido'
  const avanzado = ['COURSE_RECOMMENDED', 'PRICE_FOLLOWUP', 'VISIT_INTENT', 'CALL_ACCEPTED', 'SCHEDULING_DATE'].includes(intencion)
  if (avanzado || score === 'CALIENTE' || score === 'TIBIO' || perfilCompleto) return ETAPA_CALIFICADO
  return ETAPA_CONTACTADO
}

// Devuelve la nueva etapa si la sugerida va más adelante que la actual; si no, null
export function etapaAAvanzar(actual, sugerida) {
  if (!AUTOMATICAS.includes(sugerida)) return null
  const idxActual = ETAPAS.indexOf(actual || ETAPAS[0])
  // Etapa manual (inscrito, asistió, descartado): no se toca
  if (idxActual >= ETAPAS.indexOf(ETAPAS[4])) return null
  const idxSugerida = ETAPAS.indexOf(sugerida)
  return idxSugerida > idxActual ? sugerida : null
}

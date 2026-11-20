// Becas por convenio con escuelas: el alumno escribe una palabra clave (ej. "BECA PREPA")
// y Alex contesta con los textos exactos que capturó la escuela, sin inventar cifras.

const limpiar = (t) => (t || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Devuelve la beca que corresponde al mensaje, o null.
// Gana la palabra clave más específica; si varias escuelas empatan con una palabra genérica
// (ej. "prepa"), no se elige ninguna para no ofrecerle a alguien el convenio de otra escuela.
export function detectarBeca(texto, becas) {
  const mensaje = limpiar(texto)
  if (!mensaje) return null
  const coincidencias = []
  for (const beca of becas || []) {
    if (beca.activa === false) continue
    for (const clave of beca.palabras_clave || []) {
      const limpia = limpiar(clave)
      if (limpia && mensaje.includes(limpia)) coincidencias.push({ beca, largo: limpia.length })
    }
  }
  if (coincidencias.length === 0) return null
  coincidencias.sort((a, b) => b.largo - a.largo)
  const mejor = coincidencias[0]
  const empatados = coincidencias.filter(c => c.largo === mejor.largo && c.beca.id !== mejor.beca.id)
  return empatados.length > 0 ? null : mejor.beca
}

// La beca de la escuela registrada en la ficha del prospecto
export function becaDeEscuela(escuela, becas) {
  const buscada = limpiar(escuela)
  if (!buscada) return null
  return (becas || []).find(b => b.activa !== false && limpiar(b.escuela) === buscada) || null
}

// Primeros caracteres útiles de un texto, para reconocerlo dentro de la respuesta
const inicioDe = (t) => limpiar(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

// Imagen que debe acompañar la respuesta: la tabla de precios cuando contesta costos,
// o la del mensaje inicial. Devuelve null si esa beca no tiene imagen configurada.
export function imagenParaRespuesta(beca, respuesta, intencion) {
  if (!beca) return null
  const texto = limpiar(respuesta).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (beca.imagen_precios && beca.respuesta_precios && texto.includes(inicioDe(beca.respuesta_precios))) return beca.imagen_precios
  if (beca.imagen_inicial && beca.respuesta_inicial && texto.includes(inicioDe(beca.respuesta_inicial))) return beca.imagen_inicial
  // Respaldo: contestó sobre costos aunque haya cambiado el saludo
  if (beca.imagen_precios && intencion === 'PRICE_FOLLOWUP') return beca.imagen_precios
  return null
}

// Bloque que se añade al contexto de Alex con los textos exactos de la beca
export function construirContextoBeca(beca) {
  if (!beca) return ''
  return `
BECA_CONVENIO ACTIVA — ESCUELA: ${beca.escuela}
RESPUESTA_INICIAL (envíala tal cual, completa):
"""
${beca.respuesta_inicial}
"""
${beca.respuesta_precios ? `RESPUESTA_PRECIOS (solo si pregunta por costos, envíala tal cual y completa):
"""
${beca.respuesta_precios}
"""` : ''}
${beca.detalles ? `DETALLES (responde SOLO lo que pregunten, con estos datos):
"""
${beca.detalles}
"""` : ''}
`
}

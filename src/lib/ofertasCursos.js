// Alex a veces ofrece un curso especial ("🌟 Por cierto, también contamos con...") aunque la edad
// del alumno no entra en el rango del curso. Esta revisión en código quita esa oferta.

const numerosDe = (texto) => [...String(texto ?? '').matchAll(/\d{1,2}/g)].map(m => Number(m[0]))

export function quitarOfertasFueraDeEdad(texto, opciones, cursos, edadesConocidas = []) {
  const especiales = (cursos || []).filter(c => c.es_especial && c.nombre)
  if (!texto || especiales.length === 0) return { texto, opciones, quitadas: [] }

  const quitadas = []
  const parrafos = texto.split('\n\n').filter(parrafo => {
    if (!/por cierto/i.test(parrafo)) return true
    const curso = especiales.find(c => parrafo.toLowerCase().includes(c.nombre.toLowerCase()))
    if (!curso) return true
    // Edades del perfil, más las que el propio párrafo menciona ("para 14 años")
    const edades = [...edadesConocidas.flatMap(numerosDe), ...[...parrafo.matchAll(/(\d{1,2})\s*años/gi)].map(m => Number(m[1]))]
    if (edades.length === 0) return true
    const min = curso.edad_minima ?? 0
    const max = curso.edad_maxima ?? 99
    if (edades.some(e => e >= min && e <= max)) return true
    quitadas.push(curso.nombre)
    return false
  })

  if (quitadas.length === 0) return { texto, opciones, quitadas }
  return {
    texto: parrafos.join('\n\n'),
    // El botón "Sí, cuéntame" solo tenía sentido para la oferta quitada
    opciones: opciones ? opciones.filter(o => !/cu[eé]ntame/i.test(o)) : opciones,
    quitadas,
  }
}

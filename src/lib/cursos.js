// El curso de interés lo escribe la IA ("MY TIME", "my time", "diplomado My Time")
// y así no se puede filtrar ni agrupar. Aquí se lleva al nombre exacto de la tabla de cursos.

export const CURSO_DIAGNOSTICO = 'Diagnóstico'

const limpiar = (t) => (t || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(diplomado|curso|taller|programa|de|del|el|la)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const INVALIDOS = ['', '...', 'desconocido', 'n/a', 'null', 'por definir', 'sin especificar', 'ninguno']

// Devuelve el nombre oficial del curso, "Diagnóstico", el texto original si no coincide con nada, o null si no es un valor útil
export function normalizarCurso(valor, cursos = []) {
  const original = (valor || '').toString().trim()
  if (INVALIDOS.includes(original.toLowerCase())) return null

  // Varios cursos separados por coma (dos hijos): se normaliza cada uno
  if (original.includes(',')) {
    const partes = original.split(',').map(p => normalizarCurso(p, cursos)).filter(Boolean)
    return partes.length > 0 ? [...new Set(partes)].join(', ') : null
  }

  const buscado = limpiar(original)
  if (!buscado) return null
  if (buscado === limpiar(CURSO_DIAGNOSTICO) || buscado === 'dx') return CURSO_DIAGNOSTICO

  const candidatos = (cursos || []).filter(c => c?.nombre).map(c => ({ nombre: c.nombre.trim(), clave: limpiar(c.nombre) })).filter(c => c.clave)
  const exacto = candidatos.find(c => c.clave === buscado)
  if (exacto) return exacto.nombre
  // "business english" dentro de "business english workshop", o al revés; gana la coincidencia más larga
  const parciales = candidatos
    .filter(c => c.clave.includes(buscado) || buscado.includes(c.clave))
    .sort((a, b) => b.clave.length - a.clave.length)
  if (parciales.length > 0) return parciales[0].nombre

  return original
}

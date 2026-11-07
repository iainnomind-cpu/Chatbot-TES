// Mismo formato que guarda el webhook (52 + 10 dígitos para México) para que las respuestas
// se vinculen al prospecto. Devuelve null si no parece un número de WhatsApp.
export function normalizarTelefono(texto) {
  const digitos = (texto || '').replace(/\D/g, '')
  if (digitos.length === 10) return '52' + digitos
  if (digitos.length === 13 && digitos.startsWith('521')) return '52' + digitos.slice(3)
  if (digitos.length >= 11 && digitos.length <= 15) return digitos
  return null
}

// Cada línea: "número" o "número, nombre"
export function interpretarLineas(texto) {
  const validos = new Map()
  const invalidos = []
  for (const linea of (texto || '').split('\n')) {
    if (!linea.trim()) continue
    const [parteNumero, ...resto] = linea.split(/[,;\t]/)
    const telefono = normalizarTelefono(parteNumero)
    if (!telefono) { invalidos.push(linea.trim()); continue }
    const nombre = resto.join(' ').trim()
    if (!validos.has(telefono) || nombre) validos.set(telefono, nombre)
  }
  return { validos, invalidos }
}

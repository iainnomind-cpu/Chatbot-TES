// Última barrera antes de enviar una respuesta de Alex: si menciona una cifra de dinero
// que no está en la información autorizada (tabla de cursos), se transfiere a un asesor
// en lugar de arriesgar un precio inventado.

const PATRON_CIFRA = /(?:\$\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:mxn|pesos|usd|dólares|dolares)\b)/gi

const soloDigitos = (t) => t.replace(/[^\d]/g, '').replace(/^0+/, '')

export function cifrasEn(texto) {
  return [...new Set([...(texto || '').matchAll(PATRON_CIFRA)].map(m => soloDigitos(m[0])).filter(Boolean))]
}

// Devuelve las cifras de la respuesta que no aparecen (como número) en el texto autorizado
export function cifrasNoAutorizadas(respuesta, textoAutorizado) {
  const permitidas = new Set(cifrasEn(textoAutorizado))
  // También cuenta cualquier número suelto del texto autorizado (ej. "1750" sin signo de pesos)
  for (const n of (textoAutorizado || '').matchAll(/\d[\d,.]*/g)) permitidas.add(soloDigitos(n[0]))
  return cifrasEn(respuesta).filter(c => !permitidas.has(c))
}

export const MENSAJE_SIN_DATO = 'Para no darte un dato equivocado, prefiero que un asesor te confirme esa información. Ya le paso tu pregunta y te escribe por aquí 🙌'

// Utilidades para plantillas de WhatsApp compartidas por el servidor y el navegador

// Variables en el orden en que aparecen: {{1}}, {{2}}... o con nombre ({{nombre}}) en plantillas NAMED
export function variablesDe(texto) {
  return [...new Set([...(texto || '').matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map(m => m[1]))]
}

export const TOKEN_NOMBRE = '{nombre}'

const nombreDe = (p) => p?.nombre_alumno || p?.nombre || 'Hola'

// Reemplaza el comodín {nombre} por el nombre de cada prospecto
export function valorPara(valor, prospecto) {
  return (valor || '').split(TOKEN_NOMBRE).join(nombreDe(prospecto)).trim() || '-'
}

// Texto que verá el prospecto, para guardarlo en el inbox
export function textoFinal(plantilla, valores, prospecto) {
  const cuerpo = plantilla.components?.find(c => c.type === 'BODY')?.text || ''
  const nombres = variablesDe(cuerpo)
  return cuerpo.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, v) => valorPara(valores[nombres.indexOf(v)], prospecto))
}

// Payload de Meta para una plantilla con sus variables y su imagen de encabezado
export function construirPayload({ to, plantilla, valores, imagenUrl, prospecto }) {
  const componentes = []
  const header = plantilla.components?.find(c => c.type === 'HEADER')
  if (header?.format === 'IMAGE' && imagenUrl) {
    componentes.push({ type: 'header', parameters: [{ type: 'image', image: { link: imagenUrl } }] })
  }

  const cuerpo = plantilla.components?.find(c => c.type === 'BODY')?.text || ''
  const nombres = variablesDe(cuerpo)
  if (nombres.length > 0) {
    const conNombre = plantilla.parameter_format === 'NAMED'
    componentes.push({
      type: 'body',
      parameters: nombres.map((n, i) => ({
        type: 'text',
        text: valorPara(valores[i], prospecto),
        ...(conNombre ? { parameter_name: n } : {})
      }))
    })
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: plantilla.name, language: { code: plantilla.language || 'es_MX' }, components: componentes }
  }
}

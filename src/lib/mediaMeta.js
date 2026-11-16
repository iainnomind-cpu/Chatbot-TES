import axios from 'axios'

const MAX_BYTES = 16 * 1024 * 1024 // tope de WhatsApp para audio

const EXTENSIONES = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr' }

// Meta marca como "no recomendado" enviar media por link: reutiliza archivos ya cacheados
// y WhatsApp puede mostrarlos como reenviados. Subirlo devuelve un id nuevo cada vez.
export async function subirMediaMeta(urlArchivo, mimeType) {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('Faltan credenciales de WhatsApp')

  const { data, headers } = await axios.get(urlArchivo, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: MAX_BYTES,
  })
  const tipo = (mimeType || headers['content-type'] || 'application/octet-stream').split(';')[0].trim()

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', tipo)
  form.append('file', new Blob([data], { type: tipo }), `archivo.${EXTENSIONES[tipo] || 'bin'}`)

  const res = await axios.post(`https://graph.facebook.com/v20.0/${phoneId}/media`, form, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  })
  return res.data?.id || null
}

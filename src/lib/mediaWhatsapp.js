import axios from 'axios'
import { supabaseAdmin } from '@/lib/supabase'

// Tipos de WhatsApp que se guardan en el inbox: tipo interno y etiqueta visible
export const TIPOS_MEDIA_WHATSAPP = {
  image: { tipo: 'imagen', etiqueta: '[Imagen]' },
  sticker: { tipo: 'imagen', etiqueta: '[Imagen]' },
  video: { tipo: 'video', etiqueta: '[Video]' },
  audio: { tipo: 'audio', etiqueta: '[Audio]' },
  document: { tipo: 'archivo', etiqueta: '[Archivo]' },
}

const MAX_BYTES = 25 * 1024 * 1024 // El webhook descarga en memoria y tiene 60s de vida
const TIEMPO_MAXIMO = 15000

function extensionDe(media, mimeType) {
  const delNombre = media.filename?.includes('.') ? media.filename.split('.').pop() : null
  if (delNombre && /^[a-z0-9]{1,8}$/i.test(delNombre)) return delNombre.toLowerCase()
  // "audio/ogg; codecs=opus" -> "ogg"
  return (mimeType || '').split(';')[0].split('/')[1]?.trim() || 'bin'
}

// Las URLs de Meta requieren token y caducan en minutos: el archivo se copia a nuestro storage.
// Devuelve la URL pública, o null si no se pudo (el mensaje se guarda igual con su etiqueta).
export async function guardarMediaWhatsapp(media) {
  if (!media?.id) return null
  try {
    const headers = { Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}` }
    const { data: info } = await axios.get(`https://graph.facebook.com/v20.0/${media.id}`, { headers, timeout: TIEMPO_MAXIMO })

    if (info.file_size > MAX_BYTES) {
      console.warn(`[MEDIA] Archivo ${media.id} demasiado grande: ${info.file_size} bytes`)
      return null
    }

    const { data: contenido } = await axios.get(info.url, {
      headers,
      responseType: 'arraybuffer',
      timeout: TIEMPO_MAXIMO,
      maxContentLength: MAX_BYTES,
    })

    const mimeType = info.mime_type || media.mime_type || 'application/octet-stream'
    const ruta = `inbox/entrante_${Date.now()}_${Math.random().toString(36).substring(7)}.${extensionDe(media, mimeType)}`
    const { error } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(ruta, Buffer.from(contenido), { contentType: mimeType, cacheControl: '3600', upsert: false })
    if (error) throw new Error(error.message)

    return supabaseAdmin.storage.from('chat-media').getPublicUrl(ruta).data.publicUrl
  } catch (err) {
    console.error(`[MEDIA] No se pudo guardar el archivo ${media.id}:`, err.response?.data || err.message)
    return null
  }
}

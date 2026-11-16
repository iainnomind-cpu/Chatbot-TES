import OpenAI, { toFile } from 'openai'

// Alex no "oye": para responder una nota de voz primero se pasa a texto.
const MODELO = process.env.ALEX_MODELO_TRANSCRIPCION || 'gpt-transcribe'
const MAX_BYTES = 20 * 1024 * 1024 // límite de OpenAI: 25 MB
const TIEMPO_MAXIMO = 25000

// Contexto para que no invente nombres de cursos ni los escriba mal
const PISTA = 'Conversación de WhatsApp con una escuela de inglés en Colima, México. Cursos: Children, Pre-Teens, Teens, Young Adults, My Time, Business English Workshop, diagnóstico.'

const EXTENSIONES = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/wav': 'wav', 'audio/webm': 'webm' }

// Devuelve el texto de la nota de voz, o null si no se pudo (entonces el mensaje
// se guarda como "[Audio]" y los asesores reciben la notificación de siempre).
export async function transcribirAudio(buffer, mimeType) {
  if (!buffer?.length) return null
  if (buffer.length > MAX_BYTES) {
    console.warn(`[TRANSCRIPCION] Audio de ${Math.round(buffer.length / 1024 / 1024)} MB: demasiado grande`)
    return null
  }
  try {
    const tipo = (mimeType || 'audio/ogg').split(';')[0].trim()
    const cliente = new OpenAI({ timeout: TIEMPO_MAXIMO, maxRetries: 1 })
    const texto = await cliente.audio.transcriptions.create({
      file: await toFile(buffer, `audio.${EXTENSIONES[tipo] || 'ogg'}`, { type: tipo }),
      model: MODELO,
      language: 'es',
      prompt: PISTA,
      response_format: 'text',
    })
    const limpio = String(texto || '').trim()
    // Un audio sin voz suele devolver una palabra suelta o ruido
    return limpio.length > 1 ? limpio : null
  } catch (err) {
    console.error('[TRANSCRIPCION] No se pudo transcribir el audio:', err.message)
    return null
  }
}

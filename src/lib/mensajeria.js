// id_mensaje_meta también guarda ids internos; Meta solo acepta citar sus propios ids
const PREFIJOS_INTERNOS = ['manual_', 'seguimiento_auto', 'recordatorio_', 'test_mid_']

export const tieneIdDeMeta = (idMensajeMeta) =>
  !!idMensajeMeta && !PREFIJOS_INTERNOS.some(prefijo => idMensajeMeta.startsWith(prefijo))

// WhatsApp solo muestra como nota de voz los .ogg con codec opus; si el navegador puede
// grabar en ese formato se usa tal cual, y si no se convierte a MP3 (llega como archivo de audio).
export const FORMATO_NOTA_VOZ = 'audio/ogg;codecs=opus'

export const navegadorGrabaNotaDeVoz = () =>
  typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(FORMATO_NOTA_VOZ) === true

// MediaRecorder graba en WebM en Chrome y WhatsApp no lo acepta; MP3 funciona en todas las plataformas
export async function convertirAMp3(blob) {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const contexto = new AudioContext({ sampleRate: 44100 })
  let audio
  try {
    audio = await contexto.decodeAudioData(await blob.arrayBuffer())
  } finally {
    contexto.close()
  }

  const canal = audio.getChannelData(0)
  const muestras = new Int16Array(canal.length)
  for (let i = 0; i < canal.length; i++) {
    muestras[i] = Math.max(-1, Math.min(1, canal[i])) * 32767
  }

  const codificador = new Mp3Encoder(1, 44100, 64)
  const partes = []
  for (let i = 0; i < muestras.length; i += 1152) {
    const parte = codificador.encodeBuffer(muestras.subarray(i, i + 1152))
    if (parte.length > 0) partes.push(new Uint8Array(parte))
  }
  const final = codificador.flush()
  if (final.length > 0) partes.push(new Uint8Array(final))

  return new Blob(partes, { type: 'audio/mpeg' })
}

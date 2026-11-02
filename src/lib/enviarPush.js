import { supabaseAdmin } from '@/lib/supabase'

// Envía una notificación a todos los dispositivos suscritos, o solo a uno si se indica su endpoint.
// El webhook la llama directo: Meta no tiene sesión y /api/push/send exige cookie.
export async function enviarPush({ title, body, url, tag, endpoint }) {
  let consulta = supabaseAdmin.from('push_subscriptions').select('*')
  if (endpoint) consulta = consulta.eq('endpoint', endpoint)
  const { data: suscripciones, error } = await consulta

  if (error) throw new Error(error.message)
  if (!suscripciones || suscripciones.length === 0) return { enviadas: 0, fallidas: 0, falladasEliminadas: 0 }

  const webpush = (await import('web-push')).default

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@totalenglish.edu.mx',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'tes-notif' })

  let enviadas = 0
  let fallidas = 0
  const invalidasIds = []

  await Promise.allSettled(
    suscripciones.map(async (row) => {
      try {
        const sub = typeof row.subscription === 'string'
          ? JSON.parse(row.subscription)
          : row.subscription
        // urgency high: sin esto iOS puede retrasar la entrega con el teléfono en reposo
        await webpush.sendNotification(sub, payload, { urgency: 'high', TTL: 3600 })
        enviadas++
      } catch (err) {
        fallidas++
        console.error('Push failed for subscription:', err.statusCode, err.body || err.message)
        // Si el endpoint ya no existe (410 Gone), marcar para eliminar
        if (err.statusCode === 410 || err.statusCode === 404) {
          invalidasIds.push(row.id)
        }
      }
    })
  )

  // Limpiar suscripciones inválidas
  if (invalidasIds.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', invalidasIds)
  }

  return { enviadas, fallidas, falladasEliminadas: invalidasIds.length }
}

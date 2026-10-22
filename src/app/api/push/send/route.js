import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/push/send - Enviar notificación push a todos los usuarios suscritos
export async function POST(request) {
  try {
    const { title, body, url, tag } = await request.json()

    if (!title || !body) {
      return NextResponse.json({ error: 'title y body requeridos' }, { status: 400 })
    }

    // Obtener todas las suscripciones activas
    const { data: suscripciones, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')

    if (error) {
      console.error('Error fetching push subs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!suscripciones || suscripciones.length === 0) {
      return NextResponse.json({ ok: true, enviadas: 0 })
    }

    const webpush = (await import('web-push')).default

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@totalenglish.edu.mx',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )

    const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'tes-notif' })

    let enviadas = 0
    const falladasIds = []

    await Promise.allSettled(
      suscripciones.map(async (row) => {
        try {
          const sub = typeof row.subscription === 'string'
            ? JSON.parse(row.subscription)
            : row.subscription
          await webpush.sendNotification(sub, payload)
          enviadas++
        } catch (err) {
          console.error('Push failed for subscription:', err.statusCode)
          // Si el endpoint ya no existe (410 Gone), marcar para eliminar
          if (err.statusCode === 410 || err.statusCode === 404) {
            falladasIds.push(row.user_id)
          }
        }
      })
    )

    // Limpiar suscripciones inválidas
    if (falladasIds.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('user_id', falladasIds)
    }

    return NextResponse.json({ ok: true, enviadas, falladasEliminadas: falladasIds.length })
  } catch (err) {
    console.error('Error en /api/push/send:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

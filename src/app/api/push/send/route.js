import { NextResponse } from 'next/server'
import { enviarPush } from '@/lib/enviarPush'

// POST /api/push/send - Enviar notificación push a todos los usuarios suscritos
export async function POST(request) {
  try {
    const { title, body, url, tag } = await request.json()

    if (!title || !body) {
      return NextResponse.json({ error: 'title y body requeridos' }, { status: 400 })
    }

    const resultado = await enviarPush({ title, body, url, tag })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('Error en /api/push/send:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

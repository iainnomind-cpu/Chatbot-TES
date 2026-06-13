import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request) {
  // Verificar que sea un asesor/admin autenticado
  const auth = await requireAuth(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 })
    }

    // Generar nombre único con carpeta inbox/
    const ext = file.name.split('.').pop()
    const fileName = `inbox/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Subir al bucket chat-media usando el cliente admin (bypasa RLS)
    const { data, error } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Error Supabase Storage (chat-media):', error)
      return NextResponse.json({ error: error.message || 'Error en Supabase Storage' }, { status: 400 })
    }

    // Obtener la URL pública
    const { data: publicData } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicData.publicUrl }, { status: 200 })
  } catch (error) {
    console.error('Error subiendo media del inbox:', error)
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
  }
}

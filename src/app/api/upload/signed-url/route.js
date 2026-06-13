import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request) {
  // Verificar autenticación JWT
  const auth = await requireAuth(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { fileName, contentType } = await request.json()

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'Faltan fileName o contentType' }, { status: 400 })
    }

    // Generar nombre único en carpeta inbox/
    const ext = fileName.split('.').pop()
    const uniqueName = `inbox/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`

    // Crear URL firmada para subida directa (60 segundos de validez)
    const { data, error } = await supabaseAdmin.storage
      .from('chat-media')
      .createSignedUploadUrl(uniqueName)

    if (error) {
      console.error('Error creando signed URL:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Obtener la URL pública que tendrá el archivo una vez subido
    const { data: publicData } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(uniqueName)

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: uniqueName,
      publicUrl: publicData.publicUrl,
    })
  } catch (err) {
    console.error('Error en signed-url:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request) {
  // 1. Verificar que el usuario que intenta subir sea un administrador o asesor autenticado del ERP
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

    // Generar nombre de archivo único
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`

    // 2. Subir a Supabase usando el Cliente Administrador (Service Role)
    const { data, error } = await supabaseAdmin.storage
      .from('recursos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error de Supabase Upload:', error);
      return NextResponse.json({ error: error.message || 'Error en Supabase' }, { status: 400 })
    }

    // 3. Obtener la URL pública de la imagen
    const { data: publicData } = supabaseAdmin.storage.from('recursos').getPublicUrl(fileName)

    return NextResponse.json({ url: publicData.publicUrl }, { status: 200 })
  } catch (error) {
    console.error('Error subiendo archivo:', error)
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
  }
}

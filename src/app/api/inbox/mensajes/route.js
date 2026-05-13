import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET - Listar mensajes de una conversación
export async function GET(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const conversacion_id = searchParams.get('conversacion_id')

  if (!conversacion_id) {
    return NextResponse.json({ error: 'conversacion_id requerido' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('mensajes')
    .select('*')
    .eq('conversacion_id', conversacion_id)
    .order('creado_en', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST - Insertar un mensaje (desde el inbox del asesor)
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const { conversacion_id, remitente, contenido, tipo, url_archivo } = body

  if (!conversacion_id || !contenido) {
    return NextResponse.json({ error: 'conversacion_id y contenido requeridos' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('mensajes')
    .insert({
      conversacion_id,
      remitente: remitente || 'agente',
      contenido,
      tipo: tipo || 'texto',
      url_archivo: url_archivo || null
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actualizar último mensaje de la conversación
  await supabaseAdmin
    .from('conversaciones')
    .update({ 
      ultimo_mensaje: url_archivo ? (tipo === 'archivo' ? '📄 Documento' : '🖼️ [Imagen]') : contenido, 
      actualizado_en: new Date().toISOString() 
    })
    .eq('id', conversacion_id)

  return NextResponse.json(data, { status: 201 })
}

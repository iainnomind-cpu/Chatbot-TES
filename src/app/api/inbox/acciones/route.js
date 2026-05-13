import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST - Acciones del inbox (update conversación, crear prospecto, actualizar prospecto, etc.)
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const { accion } = body

  try {
    switch (accion) {
      // Actualizar conversación (toggle bot/humano, resolver escalamiento, etc.)
      case 'actualizar_conversacion': {
        const { id, updates } = body
        const { data, error } = await supabaseAdmin.from('conversaciones').update(updates).eq('id', id).select('*').single()
        if (error) throw error
        return NextResponse.json(data)
      }

      // Cargar prospectos relacionados por teléfono
      case 'cargar_prospectos': {
        const { telefono } = body
        const { data, error } = await supabaseAdmin
          .from('prospectos')
          .select('*, citas(id, fecha, hora, estado, tipo)')
          .eq('telefono', telefono)
          .order('creado_en', { ascending: false })
        if (error) throw error
        return NextResponse.json(data)
      }

      // Crear prospecto rápido
      case 'crear_prospecto': {
        const { nombre, telefono, conversacion_id } = body
        const { data: nuevoP, error } = await supabaseAdmin.from('prospectos').insert({
          nombre: nombre || 'Interesado',
          telefono,
          estado: 'nuevo'
        }).select('*').single()
        if (error) throw error

        await supabaseAdmin.from('conversaciones').update({ prospecto_id: nuevoP.id }).eq('id', conversacion_id)
        return NextResponse.json(nuevoP, { status: 201 })
      }

      // Actualizar estado de prospecto
      case 'actualizar_prospecto': {
        const { prospecto_id, updates: prosUpdates } = body
        const { data, error } = await supabaseAdmin.from('prospectos').update(prosUpdates).eq('id', prospecto_id).select('*').single()
        if (error) throw error
        return NextResponse.json(data)
      }

      // Crear conversación nueva (para nuevo chat)
      case 'crear_conversacion': {
        const { prospecto_id, plataforma, id_plataforma, asignado_a_humano, ultimo_mensaje } = body
        
        // Verificar si ya existe
        const { data: existing } = await supabaseAdmin.from('conversaciones')
          .select('*, prospectos(*)')
          .eq('id_plataforma', id_plataforma)
          .eq('plataforma', plataforma || 'whatsapp')
          .maybeSingle()
        
        if (existing) return NextResponse.json(existing)

        // Buscar prospecto huérfano
        let prosId = prospecto_id
        if (!prosId) {
          const { data: prosExist } = await supabaseAdmin.from('prospectos')
            .select('*').eq('telefono', id_plataforma).maybeSingle()
          if (prosExist) prosId = prosExist.id
        }

        const { data: nuevaC, error } = await supabaseAdmin.from('conversaciones').insert({
          prospecto_id: prosId || null,
          plataforma: plataforma || 'whatsapp',
          id_plataforma,
          asignado_a_humano: asignado_a_humano ?? true,
          ultimo_mensaje
        }).select('*, prospectos(*)').single()
        if (error) throw error
        return NextResponse.json(nuevaC, { status: 201 })
      }

      // Eliminar conversación
      case 'eliminar_conversacion': {
        const { conversacion_id: delId } = body
        // Primero borrar mensajes asociados
        await supabaseAdmin.from('mensajes').delete().eq('conversacion_id', delId)
        const { error } = await supabaseAdmin.from('conversaciones').delete().eq('id', delId)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error en acción inbox:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

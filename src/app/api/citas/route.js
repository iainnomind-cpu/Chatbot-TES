import { supabaseAdmin as supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

// GET - Obtener todas las citas
export async function GET(solicitud) {
  const { searchParams } = new URL(solicitud.url)
  const fecha = searchParams.get('fecha')

  let consulta = supabase
    .from('citas')
    .select('*, prospectos(nombre, telefono)')
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })

  if (fecha) {
    consulta = consulta.eq('fecha', fecha)
  }

  const { data: citas, error } = await consulta

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(citas)
}

// POST - Crear nueva cita
export async function POST(solicitud) {
  const cuerpo = await solicitud.json()

  const { data: cita, error } = await supabase
    .from('citas')
    .insert([{
      ...cuerpo,
      estado: cuerpo.estado || 'pendiente'
    }])
    .select('*, prospectos(nombre, telefono)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(cita, { status: 201 })
}

// PATCH - Actualizar estado de una cita
export async function PATCH(solicitud) {
  const cuerpo = await solicitud.json()
  const { id, ...datosActualizacion } = cuerpo

  if (!id) {
    return NextResponse.json({ error: 'Se requiere el ID de la cita' }, { status: 400 })
  }

  const { data: cita, error } = await supabase
    .from('citas')
    .update(datosActualizacion)
    .eq('id', id)
    .select('*, prospectos(id, nombre, telefono, canal)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si la cita fue confirmada, enviar mensaje de confirmación
  if (datosActualizacion.estado === 'confirmada' && cita?.prospectos?.telefono) {
    const telefono = cita.prospectos.telefono;
    const canal = cita.prospectos.canal || 'whatsapp';
    const nombre = cita.prospectos.nombre || 'amigo(a)';
    const msj = `¡Hola ${nombre}! 🎉 Te confirmamos que tu cita para el ${cita.fecha} a las ${cita.hora} ha sido agendada con éxito. ¿Tienes alguna duda al respecto antes de tu visita?`;

    try {
      if (canal === 'messenger' || canal === 'instagram') {
        const token = process.env.META_PAGE_TOKEN;
        if (token) {
          await axios.post(`https://graph.facebook.com/v20.0/me/messages`, {
            recipient: { id: telefono },
            message: { text: msj }
          }, { params: { access_token: token } });
        }
      } else {
        const token = process.env.META_WHATSAPP_TOKEN;
        const phoneId = process.env.META_PHONE_NUMBER_ID;
        if (token && phoneId) {
          await axios.post(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
            messaging_product: 'whatsapp',
            to: telefono,
            type: 'text',
            text: { body: msj }
          }, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      console.log(`✅ Mensaje de confirmación enviado a ${telefono} vía ${canal}`);
      
      // Despausar la conversación para que el bot pueda responder si el usuario tiene dudas
      if (cita.prospectos?.id) {
        const { error: errUpdate } = await supabase.from('conversaciones').update({ asignado_a_humano: false }).eq('prospecto_id', cita.prospectos.id);
        if (errUpdate) console.error("❌ Error despausando conversación:", errUpdate.message);
        else console.log("✅ Conversación despausada exitosamente para", telefono);
      }
    } catch (e) {
      console.error(`❌ Error enviando mensaje de confirmación a ${telefono}:`, e.response?.data || e.message);
    }
  }

  return NextResponse.json(cita)
}

// DELETE - Eliminar una cita
export async function DELETE(solicitud) {
  try {
    const url = solicitud.nextUrl || new URL(solicitud.url)
    const id = url.searchParams.get('id')

    console.log('🗑️ DELETE cita - ID recibido:', id)

    if (!id) {
      return NextResponse.json({ error: 'Se requiere el ID de la cita' }, { status: 400 })
    }

    const { error } = await supabase
      .from('citas')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Error eliminando cita:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Cita eliminada:', id)
    return NextResponse.json({ mensaje: 'Cita eliminada correctamente' })
  } catch (e) {
    console.error('❌ Error fatal DELETE cita:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

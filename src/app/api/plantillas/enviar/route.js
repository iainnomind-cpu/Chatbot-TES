import { supabaseAdmin as supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import axios from 'axios'
import { construirPayload, textoFinal } from '@/lib/plantillasWhatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_DESTINATARIOS = 100

// Conversación del prospecto en el inbox (o una nueva) para que el asesor vea lo enviado
async function guardarEnInbox(prospecto, texto, idMeta) {
  const tel = prospecto.telefono
  const variantes = tel.length === 12 && tel.startsWith('52') ? [tel, '521' + tel.slice(2)] : [tel]
  let { data: conv } = await supabase.from('conversaciones')
    .select('id').eq('plataforma', 'whatsapp').in('id_plataforma', variantes).limit(1).maybeSingle()
  if (!conv) {
    const { data: nueva } = await supabase.from('conversaciones')
      .insert({ plataforma: 'whatsapp', id_plataforma: tel, prospecto_id: prospecto.id, nombre_contacto: prospecto.nombre || 'Prospecto' })
      .select('id').single()
    conv = nueva
  }
  if (!conv) return
  await supabase.from('mensajes').insert({
    conversacion_id: conv.id, remitente: 'agente', tipo: 'texto', contenido: texto, id_mensaje_meta: idMeta,
    ...(idMeta.startsWith('wamid.') ? { wamid: idMeta } : {}), estado_entrega: 'sent'
  })
  await supabase.from('conversaciones').update({
    ultimo_mensaje: texto.substring(0, 200), actualizado_en: new Date().toISOString()
  }).eq('id', conv.id)
}

// POST - Enviar una plantilla a prospectos elegidos a mano, sin crear campaña
export async function POST(solicitud) {
  try {
    const { nombre_plantilla, prospectos_ids, valores = [], imagen_url } = await solicitud.json()
    if (!nombre_plantilla || !Array.isArray(prospectos_ids) || prospectos_ids.length === 0) {
      return NextResponse.json({ error: 'Elige una plantilla y al menos un prospecto' }, { status: 400 })
    }
    if (prospectos_ids.length > MAX_DESTINATARIOS) {
      return NextResponse.json({ error: `Máximo ${MAX_DESTINATARIOS} personas por envío. Para más, usa una campaña.` }, { status: 400 })
    }

    const token = process.env.META_WHATSAPP_TOKEN
    const headers = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    const { data: tpl } = await axios.get(
      `https://graph.facebook.com/v20.0/${process.env.META_BUSINESS_ACCOUNT_ID}/message_templates`,
      { params: { name: nombre_plantilla, fields: 'name,language,status,parameter_format,components' }, ...headers }
    )
    const plantilla = tpl.data?.find(t => t.name === nombre_plantilla && t.status === 'APPROVED')
    if (!plantilla) return NextResponse.json({ error: 'La plantilla no existe o no está aprobada por Meta' }, { status: 400 })

    const { data: prospectos, error } = await supabase.from('prospectos')
      .select('id, telefono, nombre, nombre_alumno, canal').in('id', prospectos_ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const url = `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`
    let enviados = 0
    const fallidos = []

    for (const prospecto of prospectos) {
      const nombre = prospecto.nombre_alumno || prospecto.nombre || prospecto.telefono
      // Messenger e Instagram guardan IDs internos, no números
      if (['messenger', 'instagram'].includes(prospecto.canal) || !/^\d{11,15}$/.test(prospecto.telefono || '')) {
        fallidos.push({ nombre, error: 'No tiene número de WhatsApp' })
        continue
      }
      const payload = construirPayload({ to: prospecto.telefono, plantilla, valores, imagenUrl: imagen_url, prospecto })
      try {
        let res
        try {
          res = await axios.post(url, payload, headers)
        } catch (err) {
          // Algunos números de México solo funcionan con 521
          if (!(payload.to.length === 12 && payload.to.startsWith('52'))) throw err
          res = await axios.post(url, { ...payload, to: '521' + payload.to.slice(2) }, headers)
        }
        enviados++
        await guardarEnInbox(prospecto, textoFinal(plantilla, valores, prospecto), res.data?.messages?.[0]?.id || 'plantilla_' + Date.now())
      } catch (err) {
        const detalle = err.response?.data?.error
        console.error(`❌ [PLANTILLA] Falló envío a ${prospecto.telefono}:`, JSON.stringify(detalle || err.message))
        fallidos.push({ nombre, error: detalle?.error_data?.details || detalle?.message || err.message })
      }
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({ enviados, fallidos })
  } catch (e) {
    console.error('Error en /api/plantillas/enviar:', e.response?.data || e.message)
    return NextResponse.json({ error: e.response?.data?.error?.message || e.message }, { status: 500 })
  }
}

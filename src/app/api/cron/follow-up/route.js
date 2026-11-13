import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import axios from 'axios'
import { normalizarConfig, decidirSeguimiento, mensajeSeguimientoTexto, MAX_INTENTOS } from '@/lib/seguimientos'
import { construirPayload, textoFinal } from '@/lib/plantillasWhatsapp'
import { enviarPush } from '@/lib/enviarPush'
import { alertasPendientes } from '@/lib/alertas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ============================================================
// CRON DE SEGUIMIENTO AUTOMÁTICO
// Hasta 4 intentos a prospectos que dejaron de responder (fríos, tibios o sin score,
// según Configuración). Se detiene en cuanto el prospecto escribe, agenda cita o pasa a un asesor.
// Después de 24 h sin respuesta WhatsApp solo acepta plantillas aprobadas.
// Pensado para correr cada hora; es seguro ejecutarlo más seguido.
// ============================================================

const LIMITE_CONVERSACIONES = 200

async function obtenerPlantillas(nombres) {
  const unicas = [...new Set(nombres.filter(Boolean))]
  if (unicas.length === 0) return {}
  const token = process.env.META_WHATSAPP_TOKEN
  const accountId = process.env.META_BUSINESS_ACCOUNT_ID
  const { data } = await axios.get(`https://graph.facebook.com/v20.0/${accountId}/message_templates`, {
    params: { limit: 100, fields: 'name,language,status,parameter_format,components' },
    headers: { Authorization: `Bearer ${token}` },
  })
  const porNombre = {}
  for (const t of data.data || []) {
    if (unicas.includes(t.name) && t.status === 'APPROVED') porNombre[t.name] = t
  }
  return porNombre
}

async function enviarWhatsApp(payload) {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) throw new Error('Faltan credenciales de WhatsApp')
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`
  const headers = { headers: { Authorization: `Bearer ${token}` } }
  try {
    const res = await axios.post(url, payload, headers)
    return res.data?.messages?.[0]?.id || null
  } catch (e) {
    // Algunos números de México solo funcionan con la otra variante del prefijo
    const to = payload.to
    const alterno = to.startsWith('521') && to.length === 13 ? '52' + to.slice(3)
      : to.startsWith('52') && to.length === 12 ? '521' + to.slice(2) : null
    if (!alterno) throw e
    const res = await axios.post(url, { ...payload, to: alterno }, headers)
    return res.data?.messages?.[0]?.id || null
  }
}

export async function GET(request) {
  // Validar que es una llamada autorizada (Vercel Cron o manual con secret)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const ahora = new Date()
  const resultados = { enviados: 0, errores: 0, omitidos: {}, intentos: {} }
  const omitir = (motivo) => { resultados.omitidos[motivo] = (resultados.omitidos[motivo] || 0) + 1 }

  try {
    const { data: cnf } = await supabase.from('configuracion_bot').select('seguimiento').eq('id', 1).maybeSingle()
    const config = normalizarConfig(cnf?.seguimiento)
    if (!config.activo) return NextResponse.json({ success: true, desactivado: true })

    let plantillas = {}
    try {
      plantillas = await obtenerPlantillas(config.plantillas)
    } catch (e) {
      console.error('⚠️ No se pudieron leer las plantillas de Meta:', e.response?.data?.error?.message || e.message)
    }

    // Conversaciones de WhatsApp con prospecto, sin asesor asignado, las más recientes primero
    const { data: conversaciones, error } = await supabase
      .from('conversaciones')
      .select('id, plataforma, id_plataforma, asignado_a_humano, prospectos(*)')
      .eq('plataforma', 'whatsapp')
      .eq('asignado_a_humano', false)
      .not('prospecto_id', 'is', null)
      .order('actualizado_en', { ascending: false })
      .limit(LIMITE_CONVERSACIONES)
    if (error) throw error

    for (const conv of conversaciones || []) {
      try {
        const prospecto = conv.prospectos
        const { data: mensajes } = await supabase
          .from('mensajes')
          .select('remitente, creado_en, id_mensaje_meta')
          .eq('conversacion_id', conv.id)
          .order('creado_en', { ascending: true })

        let citaPendiente = false
        if (prospecto?.id) {
          const { count } = await supabase.from('citas')
            .select('id', { count: 'exact', head: true })
            .eq('prospecto_id', prospecto.id).eq('estado', 'pendiente')
          citaPendiente = (count || 0) > 0
        }

        const decision = decidirSeguimiento({ ahora, config, mensajes: mensajes || [], prospecto, conversacion: conv, citaPendiente })
        if (!decision.enviar) { omitir(decision.motivo); continue }

        let payload, contenido
        if (decision.modo === 'plantilla') {
          const plantilla = plantillas[decision.plantilla]
          if (!plantilla) { omitir('plantilla_no_aprobada'); continue }
          const valores = ['{nombre}']
          payload = construirPayload({ to: conv.id_plataforma, plantilla, valores, imagenUrl: plantilla.components?.find(c => c.type === 'HEADER')?.example?.header_handle?.[0], prospecto })
          contenido = textoFinal(plantilla, valores, prospecto)
        } else {
          contenido = mensajeSeguimientoTexto(prospecto, decision.intento)
          payload = { messaging_product: 'whatsapp', to: conv.id_plataforma, type: 'text', text: { body: contenido } }
        }

        let wamid = null
        let fallo = null
        try {
          wamid = await enviarWhatsApp(payload)
        } catch (e) {
          fallo = e.response?.data?.error?.message || e.message
          console.error(`❌ Seguimiento ${decision.intento} falló para ${conv.id_plataforma}:`, fallo)
        }

        // Se registra aunque falle: así cuenta como intento y no se reintenta cada hora
        await supabase.from('mensajes').insert({
          conversacion_id: conv.id,
          remitente: 'bot',
          contenido,
          tipo: 'texto',
          id_mensaje_meta: `seguimiento_auto_${decision.intento}_${Date.now()}`,
          wamid,
          estado_entrega: fallo ? 'failed' : 'sent',
          error_entrega: fallo,
        })
        await supabase.from('conversaciones').update({
          actualizado_en: ahora.toISOString(),
          ultimo_mensaje: contenido.substring(0, 200),
        }).eq('id', conv.id)

        if (fallo) { resultados.errores++; continue }
        resultados.enviados++
        resultados.intentos[decision.intento] = (resultados.intentos[decision.intento] || 0) + 1
        console.log(`📤 Seguimiento ${decision.intento}/${MAX_INTENTOS} (${decision.modo}) a ${conv.id_plataforma}`)

        // Último intento sin respuesta: que un asesor decida si lo llama o lo descarta
        if (decision.esUltimo) {
          await enviarPush({
            title: 'Seguimientos agotados',
            body: `${prospecto.nombre_alumno || prospecto.nombre || conv.id_plataforma} no respondió a ${MAX_INTENTOS} seguimientos`,
            url: `/inbox?id=${conv.id}`,
            tag: `seguimiento-final-${conv.id}`,
          }).catch(e => console.error('Push seguimiento final:', e.message))
        }
      } catch (convErr) {
        console.error(`Error procesando conv ${conv.id}:`, convErr.message)
        resultados.errores++
      }
    }

    // ---- Alertas a asesores: prospectos que escribieron y nadie (ni Alex) les contestó ----
    try {
      const desde = new Date(ahora - 48 * 36e5).toISOString()
      const { data: recientes } = await supabase
        .from('conversaciones')
        .select('id, id_plataforma, asignado_a_humano, prospectos(nombre, nombre_alumno, lead_score)')
        .gte('actualizado_en', desde)
        .order('actualizado_en', { ascending: false })
        .limit(LIMITE_CONVERSACIONES)
      const conUltimo = []
      for (const c of recientes || []) {
        const { data: ult } = await supabase.from('mensajes').select('remitente, creado_en')
          .eq('conversacion_id', c.id).order('creado_en', { ascending: false }).limit(1).maybeSingle()
        conUltimo.push({ ...c, ultimo: ult })
      }
      const alertas = alertasPendientes(conUltimo, ahora)
      for (const a of alertas) {
        await enviarPush({ title: a.title, body: a.body, url: `/inbox?id=${a.conversacionId}`, tag: `${a.tipo}-${a.conversacionId}` })
      }
      resultados.alertas = alertas.length
    } catch (eAlertas) {
      console.error('Error generando alertas:', eAlertas.message)
    }

    console.log('📊 Resultados del cron de seguimiento:', JSON.stringify(resultados))
    return NextResponse.json({ success: true, ...resultados })
  } catch (err) {
    console.error('Error en Cron Follow-up:', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

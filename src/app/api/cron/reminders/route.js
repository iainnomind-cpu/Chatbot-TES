import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import axios from 'axios'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Vercel max for hobby

export async function GET(request) {
  // Validar que es una llamada autorizada
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const ahora = new Date()
    // Ajustar zona horaria a México
    const ahoraMx = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }))
    const fechaHoy = ahoraMx.getFullYear() + '-' + String(ahoraMx.getMonth() + 1).padStart(2, '0') + '-' + String(ahoraMx.getDate()).padStart(2, '0')

    const resultados = { enviados: 0, errores: 0, omitidos: 0 }

    // Buscar citas confirmadas para hoy
    const { data: citas, error } = await supabase
      .from('citas')
      .select('*, prospectos(nombre, telefono, canal)')
      .eq('estado', 'confirmada')
      .eq('fecha', fechaHoy)

    if (error) throw error

    for (const cita of (citas || [])) {
      if (!cita.prospectos) { resultados.omitidos++; continue }

      // Buscar si ya se envió el recordatorio consultando la tabla mensajes
      const { count: recordatoriosEnviados } = await supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('remitente', 'bot')
        .like('id_mensaje_meta', `recordatorio_${cita.id}%`)

      if (recordatoriosEnviados > 0) {
        resultados.omitidos++
        continue
      }

      const telefono = cita.prospectos.telefono
      const canal = cita.prospectos.canal || 'whatsapp'
      const nombre = cita.prospectos.nombre || 'amigo(a)'
      const msj = `⏰ ¡Hola ${nombre}! Te escribimos de Total English para recordarte que tu cita programada es hoy a las ${cita.hora}. ¡Te esperamos! 😊`

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

        // Registrar el envío en la base de datos para no repetirlo
        // Buscamos la conversacion asociada al prospecto
        const { data: convs } = await supabase.from('conversaciones').select('id').eq('prospecto_id', cita.prospectos_id || cita.prospecto_id).limit(1)
        if (convs && convs.length > 0) {
           await supabase.from('mensajes').insert({
            conversacion_id: convs[0].id,
            remitente: 'bot',
            contenido: msj,
            tipo: 'texto',
            id_mensaje_meta: `recordatorio_${cita.id}_${Date.now()}`
          })
        }

        resultados.enviados++
        console.log(`✅ Recordatorio matutino enviado a ${telefono} vía ${canal}`)
      } catch (e) {
        console.error(`❌ Error enviando recordatorio a ${telefono}:`, e.response?.data || e.message)
        resultados.errores++
      }
    }

    return NextResponse.json({ success: true, ...resultados })
  } catch (err) {
    console.error('Error en Cron Reminders:', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

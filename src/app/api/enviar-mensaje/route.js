import { NextResponse } from 'next/server'
import axios from 'axios'
import { supabaseAdmin as supabase } from "@/lib/supabase"
import { tieneIdDeMeta } from '@/lib/mensajeria'

export async function POST(solicitud) {
  try {
    const cuerpo = await solicitud.json()
    const { to, text, plataforma, tipo = 'text', nombrePlantilla = '', url_archivo, respuesta_a_id } = cuerpo

    if (!['whatsapp', 'messenger', 'instagram'].includes(plataforma)) {
      return NextResponse.json({ error: 'Plataforma no soportada' }, { status: 400 })
    }

    let idMetaCitado = null
    if (respuesta_a_id) {
      const { data: citado } = await supabase.from('mensajes')
        .select('id_mensaje_meta').eq('id', respuesta_a_id).maybeSingle()
      if (!tieneIdDeMeta(citado?.id_mensaje_meta)) {
        return NextResponse.json({ error: 'Este mensaje no se puede citar' }, { status: 400 })
      }
      idMetaCitado = citado.id_mensaje_meta
    }

    const guardarEnBD = async (resData) => {
      try {
        const { data: conv } = await supabase.from('conversaciones')
          .select('id').eq('id_plataforma', to).eq('plataforma', plataforma).maybeSingle()
        
        if (conv) {
          const contenidoMsj = text || (tipo === 'document' ? '📄 Documento' : tipo === 'video' ? '🎥 Video' : tipo === 'image' ? '🖼️ Imagen' : tipo === 'audio' ? '🎤 Audio' : 'Plantilla enviada')
          // Guardar el id real de Meta para que este mensaje también se pueda citar después
          const idMeta = resData?.messages?.[0]?.id || resData?.message_id || ('manual_' + Date.now())
          const { error: errIns } = await supabase.from('mensajes').insert({
            conversacion_id: conv.id,
            remitente: 'agente',
            contenido: contenidoMsj,
            tipo: tipo === 'document' ? 'archivo' : (tipo === 'video' ? 'video' : (tipo === 'image' ? 'imagen' : (tipo === 'audio' ? 'audio' : 'texto'))),
            url_archivo: url_archivo || null,
            id_mensaje_meta: idMeta,
            // Estado de entrega: WhatsApp lo irá actualizando por webhook a partir del wamid
            ...(idMeta.startsWith('wamid.') ? { wamid: idMeta } : {}),
            estado_entrega: 'sent',
            ...(respuesta_a_id ? { respuesta_a_id } : {})
          })
          if (errIns?.code === '23505') {
            // El echo de Messenger/Instagram ya lo guardó: solo completar la cita
            if (respuesta_a_id) await supabase.from('mensajes').update({ respuesta_a_id }).eq('id_mensaje_meta', idMeta)
          } else if (errIns) {
            console.error('Error insertando mensaje manual:', errIns.message)
          }

          await supabase.from('conversaciones').update({ 
            ultimo_mensaje: contenidoMsj,
            actualizado_en: new Date().toISOString()
          }).eq('id', conv.id)
        }
      } catch (err) {
        console.error('Error guardando en BD local:', err)
      }
    }

    if (plataforma === 'messenger' || plataforma === 'instagram') {
      const pageToken = process.env.META_PAGE_TOKEN;
      if (!pageToken) return NextResponse.json({ error: 'Falta configurar META_PAGE_TOKEN en el servidor' }, { status: 500 });
      
      const url = `https://graph.facebook.com/v20.0/me/messages`;
      let payload = {
        recipient: { id: to },
        message: {}
      };
      if (idMetaCitado) payload.message.reply_to = { mid: idMetaCitado };

      if (tipo === 'audio' && url_archivo) {
        payload.message.attachment = { type: 'audio', payload: { url: url_archivo } };
        if (plataforma === 'messenger') payload.message.attachment.payload.is_reusable = true;
      } else if (tipo === 'image' && url_archivo) {
        payload.message.attachment = { type: 'image', payload: { url: url_archivo } };
        if (plataforma === 'messenger') payload.message.attachment.payload.is_reusable = true;
      } else if (tipo === 'video' && url_archivo) {
        payload.message.attachment = { type: 'video', payload: { url: url_archivo } };
        if (plataforma === 'messenger') payload.message.attachment.payload.is_reusable = true;
      } else if (tipo === 'document' && url_archivo) {
        payload.message.attachment = { type: 'file', payload: { url: url_archivo } };
        if (plataforma === 'messenger') payload.message.attachment.payload.is_reusable = true;
      } else {
        payload.message.text = text;
      }

      try {
        const res = await axios.post(url, payload, { params: { access_token: pageToken } });
        await guardarEnBD(res.data);
        return NextResponse.json({ exito: true, metaResponse: res.data }, { status: 200 });
      } catch (error) {
        console.error(`❌ ERROR META API (${plataforma}):`, error.response?.data || error.message);
        return NextResponse.json({ error: error.response?.data?.error?.message || 'Error Meta API' }, { status: 400 });
      }
    }

    const token = process.env.META_WHATSAPP_TOKEN
    const phoneId = process.env.META_PHONE_NUMBER_ID
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`

    const payload = {
      messaging_product: 'whatsapp',
      to: to,
    }
    if (idMetaCitado) payload.context = { message_id: idMetaCitado }

    if (tipo === 'audio' && url_archivo) {
      payload.type = 'audio'
      payload.audio = { link: url_archivo }
    } else if (tipo === 'template' && nombrePlantilla) {
      payload.type = 'template'
      payload.template = { name: nombrePlantilla, language: { code: 'es_MX' } }
    } else if (tipo === 'image' && url_archivo) {
      payload.type = 'image'
      payload.image = { link: url_archivo, caption: text }
    } else if (tipo === 'video' && url_archivo) {
      payload.type = 'video'
      payload.video = { link: url_archivo, caption: text }
    } else if (tipo === 'document' && url_archivo) {
      payload.type = 'document'
      payload.document = { link: url_archivo, caption: text, filename: 'documento_total_english' }
    } else {
      payload.type = 'text'
      payload.text = { body: text }
    }

    const headers = {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    }
    console.log(`📤 [ENVIAR-MSG] Tipo: ${tipo} | Para: ${to} | URL: ${url_archivo || 'ninguna'}`)
    try {
      const res = await axios.post(url, payload, headers)
      console.log(`✅ [ENVIAR-MSG] Meta respondió OK:`, JSON.stringify(res.data))
      await guardarEnBD(res.data)
      return NextResponse.json({ exito: true, metaResponse: res.data }, { status: 200 })
    } catch (error) {
      console.error(`❌ [ENVIAR-MSG] Meta rechazó el envío a ${to}:`, JSON.stringify(error.response?.data || error.message))
      console.error(`❌ [ENVIAR-MSG] Payload enviado:`, JSON.stringify(payload))

      let toCorregido = null;
      if (to.startsWith('521') && to.length === 13) {
        toCorregido = to.replace('521', '52');
      } else if (to.startsWith('52') && to.length === 12) {
        toCorregido = to.replace('52', '521');
      }

      if (toCorregido) {
        payload.to = toCorregido
        try {
          const resRetry = await axios.post(url, payload, headers)
          await guardarEnBD(resRetry.data)
          return NextResponse.json({ exito: true, metaResponse: resRetry.data, corregido: true }, { status: 200 })
        } catch (retryError) {
          console.error(`❌ Falló también reintento manual a ${toCorregido}:`, retryError.response?.data || retryError.message)
          return NextResponse.json({ error: retryError.response?.data?.error?.message || 'Fallo total en envío manual' }, { status: 400 })
        }
      }
      return NextResponse.json({ error: error.response?.data?.error?.message || 'Error Meta API' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Error al enviar mensaje manual:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

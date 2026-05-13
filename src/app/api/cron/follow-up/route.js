import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import axios from 'axios'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Vercel max for hobby

// ============================================================
// CRON DE SEGUIMIENTO INTELIGENTE
// Se ejecuta cada 30 minutos y busca conversaciones sin respuesta
// Envía 2 seguimientos: a las 3h y a las 22h del último mensaje del lead
// ============================================================

export async function GET(request) {
  // Validar que es una llamada autorizada (Vercel Cron o manual con secret)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const ahora = new Date()
    const resultados = { enviados_3h: 0, enviados_22h: 0, errores: 0, omitidos: 0 }

    // -------------------------------------------------------
    // 1. Buscar conversaciones donde el último mensaje fue del BOT
    //    (es decir, el lead no ha respondido) y NO están en modo humano
    // -------------------------------------------------------
    const { data: conversaciones, error } = await supabase
      .from('conversaciones')
      .select('*, prospectos(*)')
      .eq('asignado_a_humano', false)
      .not('prospecto_id', 'is', null)
      .order('actualizado_en', { ascending: false })
      .limit(50)

    if (error) throw error

    for (const conv of (conversaciones || [])) {
      try {
        const pros = conv.prospectos
        if (!pros) { resultados.omitidos++; continue }

        // Obtener el último mensaje de la conversación
        const { data: ultimosMsj } = await supabase
          .from('mensajes')
          .select('remitente, contenido, creado_en')
          .eq('conversacion_id', conv.id)
          .order('creado_en', { ascending: false })
          .limit(5)

        if (!ultimosMsj || ultimosMsj.length === 0) { resultados.omitidos++; continue }

        const ultimoMsg = ultimosMsj[0]
        
        // Solo hacer seguimiento si el último mensaje fue del bot o agente (el lead no respondió)
        if (ultimoMsg.remitente === 'usuario') { resultados.omitidos++; continue }

        const tiempoDesdeUltimoMsg = ahora - new Date(ultimoMsg.creado_en)
        const horasDesde = tiempoDesdeUltimoMsg / (1000 * 60 * 60)

        // Contar cuántos seguimientos ya se enviaron (mensajes con tag de seguimiento)
        const { count: numSeguimientos } = await supabase
          .from('mensajes')
          .select('id', { count: 'exact', head: true })
          .eq('conversacion_id', conv.id)
          .eq('remitente', 'bot')
          .like('id_mensaje_meta', 'seguimiento_auto%')

        const seguimientosEnviados = numSeguimientos || 0

        // -------------------------------------------------------
        // LÓGICA DE TIEMPOS:
        // - Seguimiento 1: después de 3 horas, máximo 1 vez
        // - Seguimiento 2: después de 22 horas, máximo 1 vez
        // -------------------------------------------------------
        let debeEnviar = false
        let tipoSeguimiento = ''

        if (horasDesde >= 3 && horasDesde < 22 && seguimientosEnviados === 0) {
          debeEnviar = true
          tipoSeguimiento = '3h'
        } else if (horasDesde >= 22 && seguimientosEnviados <= 1) {
          // Solo enviar el de 22h si no se ha enviado ya (max 2 total: 3h + 22h)
          if (seguimientosEnviados === 0 || seguimientosEnviados === 1) {
            debeEnviar = true
            tipoSeguimiento = '22h'
          }
        }

        if (!debeEnviar) { resultados.omitidos++; continue }

        // -------------------------------------------------------
        // 2. GENERAR MENSAJE CONTEXTUAL según estado del prospecto
        // -------------------------------------------------------
        const nombre = pros.nombre_alumno || pros.nombre || 'amigo(a)'
        const telefono = conv.id_plataforma

        // Determinar en qué punto del flujo se quedó
        const tieneCita = false
        if (pros.id) {
          const { data: citas } = await supabase.from('citas')
            .select('id').eq('prospecto_id', pros.id)
            .eq('estado', 'pendiente').limit(1)
          if (citas && citas.length > 0) {
            // Ya tiene cita, no enviar seguimiento de venta
            resultados.omitidos++
            continue
          }
        }

        const tieneEdad = pros.edad && pros.edad !== 'Desconocida'
        const tieneNivel = pros.nivel && pros.nivel !== 'Desconocido'
        const tieneCurso = pros.curso_interes && pros.curso_interes !== 'Desconocido'
        const esCaliente = pros.lead_score === 'CALIENTE'

        let mensaje = ''

        if (tipoSeguimiento === '3h') {
          // === SEGUIMIENTO A LAS 3 HORAS ===
          if (!tieneEdad && !tieneNivel) {
            // Se quedó al inicio del perfilamiento
            mensaje = `✨ ¡Hola ${nombre}! ¿Recibiste mi mensaje anterior? Estoy para ayudarte con el mejor curso de inglés. ¿Seguimos?\n\nPor favor dime:\n1️⃣ ¿Para qué edad buscas?\n2️⃣ ¿Tienes nivel previo? 🇬🇧 o ¿quieres iniciar de Nivel 1?\n3️⃣ ¿Buscas Horarios fijos o Flexibles? ⏰`
          } else if (tieneEdad && !tieneNivel) {
            // Ya dio la edad pero no el nivel
            mensaje = `¡Hola ${nombre}! 😊 Me quedé esperando tu respuesta. Solo me falta saber:\n\n¿Tienes nivel previo de inglés o prefieres iniciar desde Nivel 1? 🇬🇧\n\nCon eso te doy la mejor recomendación al instante. ✨`
          } else if (tieneCurso && esCaliente) {
            // Ya se le recomendó curso pero no agendó
            mensaje = `¡Hola ${nombre}! 👋 Me quedé esperando tu confirmación para activar tu clase muestra gratuita, quisiera que no la perdieras.\n\nCuéntame:\n- ¿El presupuesto se sale un poco de lo planeado?\n- ¿Los horarios te preocupan o son complicados?\n- ¿Tienes alguna duda específica que no resolví?\n\n¿Cuál es tu caso? Si me cuentas, puedo revisar el mejor plan para ti. 💪`
          } else {
            // Caso genérico
            mensaje = `¡Hola ${nombre}! 😊 Vi que nos quedamos a medias. ¿Te gustaría que continuemos? Estoy aquí para ayudarte a encontrar el curso ideal de inglés. ✨`
          }
        } else {
          // === SEGUIMIENTO A LAS 22 HORAS ===
          if (!tieneEdad && !tieneNivel) {
            mensaje = `Hola ${nombre}, soy Alex de Total English School 🏫\n\nAyer me escribiste interesado/a en nuestros cursos de inglés pero no pudimos terminar. 😊\n\nSolo necesito unos datos rápidos para darte la mejor recomendación:\n\n1️⃣ ¿Para quién es el curso?\n2️⃣ ¿Qué edad tiene el alumno?\n3️⃣ ¿Tiene nivel previo?\n\n¡Respóndeme cuando puedas! 🙌`
          } else if (tieneCurso && esCaliente) {
            mensaje = `Hola ${nombre} 👋\n\nSoy Alex de Total English. Ayer platicamos sobre el curso ideal para ti y me gustaría saber si sigues interesado/a.\n\n🎟️ Tu pase de clase muestra gratuita sigue disponible, pero es por tiempo limitado.\n\n¿Te gustaría agendarlo? Solo dime qué día y hora te funcionan mejor. 📅`
          } else {
            mensaje = `¡Hola ${nombre}! Soy Alex de Total English School 🏫\n\nAyer estuvimos platicando y me encantaría seguir ayudándote. ¿Tienes un momento para continuar? 😊\n\nEstoy aquí cuando me necesites. ✨`
          }
        }

        if (!mensaje) { resultados.omitidos++; continue }

        // -------------------------------------------------------
        // 3. ENVIAR POR WHATSAPP
        // -------------------------------------------------------
        const enviado = await enviarMensajeWhatsApp(telefono, mensaje)

        if (enviado) {
          // Guardar el mensaje en la BD con tag oculto para rastrear seguimientos
          // El tag se pone al final del contenido pero invisible para el usuario
          await supabase.from('mensajes').insert({
            conversacion_id: conv.id,
            remitente: 'bot',
            contenido: mensaje,
            tipo: 'texto',
            // Marcador interno para contar seguimientos (no se muestra en WhatsApp)
            id_mensaje_meta: `seguimiento_auto_${tipoSeguimiento}_${Date.now()}`
          })

          // Actualizar conversación
          await supabase.from('conversaciones').update({
            actualizado_en: new Date().toISOString(),
            ultimo_mensaje: mensaje.substring(0, 100)
          }).eq('id', conv.id)

          if (tipoSeguimiento === '3h') resultados.enviados_3h++
          else resultados.enviados_22h++

          console.log(`📤 Seguimiento ${tipoSeguimiento} enviado a ${nombre} (${telefono})`)
        } else {
          resultados.errores++
        }
      } catch (convErr) {
        console.error(`Error procesando conv ${conv.id}:`, convErr.message)
        resultados.errores++
      }
    }

    console.log('📊 Resultados del cron:', resultados)
    return NextResponse.json({ success: true, ...resultados })
  } catch (err) {
    console.error('Error en Cron Follow-up:', err.message)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// -------------------------------------------------------
// Enviar mensaje por WhatsApp con retry para México
// -------------------------------------------------------
async function enviarMensajeWhatsApp(to, mensaje) {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`
  if (!token || !phoneId) return false

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: mensaje }
  }

  try {
    await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` } })
    return true
  } catch (e) {
    console.warn(`⚠️ Falló envío seguimiento a ${to}:`, e.response?.data?.error?.message || e.message)
    
    // Retry con variante de número mexicano
    let toCorregido = null
    if (to.startsWith('521') && to.length === 13) {
      toCorregido = to.replace('521', '52')
    } else if (to.startsWith('52') && to.length === 12) {
      toCorregido = to.replace('52', '521')
    }

    if (toCorregido) {
      payload.to = toCorregido
      try {
        await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` } })
        return true
      } catch (retryErr) {
        console.error(`❌ Falló retry seguimiento a ${toCorregido}:`, retryErr.response?.data?.error?.message || retryErr.message)
      }
    }
    return false
  }
}

import { supabaseAdmin as supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import axios from 'axios'
import { construirPayload, variablesDe, tokensSinDato } from '@/lib/plantillasWhatsapp'

export const dynamic = 'force-dynamic'

const CANALES_REDES = ['messenger', 'instagram']

// Messenger e Instagram usan IDs internos; WhatsApp necesita un teléfono. Los prospectos
// importados o creados a mano suelen traer el canal vacío y sí se les puede escribir.
export function puedeRecibir(prospecto, canalCampana) {
  const canalProspecto = (prospecto?.canal || '').toLowerCase()
  if (CANALES_REDES.includes(canalCampana)) return canalProspecto === canalCampana && !!prospecto.telefono
  if (CANALES_REDES.includes(canalProspecto)) return false
  return /^\d{10,15}$/.test((prospecto?.telefono || '').replace(/\D/g, ''))
}

export async function POST(solicitud) {
  try {
    const cuerpoSolicitud = await solicitud.json()
    const { id } = cuerpoSolicitud
    const urlObj = new URL(solicitud.url)
    const domainOrigin = urlObj.origin
    console.log('🚀 Iniciando ejecución de campaña ID:', id)

    if (!id) {
      return NextResponse.json({ error: 'Se requiere el ID de la campaña' }, { status: 400 })
    }

    // 1. Obtener la campaña
    const { data: campana, error: errCamp } = await supabase
      .from('campanas')
      .select('*')
      .eq('id', id)
      .single()

    if (errCamp || !campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (!['aprobada', 'activa', 'completada'].includes(campana.estado)) {
       return NextResponse.json({ error: `La campaña no puede ejecutarse porque está en estado: ${campana.estado}. Primero debe ser aprobada.` }, { status: 400 })
    }

    if (!campana.nombre_plantilla && campana.canal === 'whatsapp') {
       return NextResponse.json({ error: 'Falta configurar el "Nombre de Plantilla" de Meta en la campaña' }, { status: 400 })
    }

    // 2. Obtener lista de prospectos (candidatos = antes de revisar si pueden recibir el mensaje)
    let prospectos = []
    let candidatos = []

    if (cuerpoSolicitud.prospectos_ids && Array.isArray(cuerpoSolicitud.prospectos_ids) && cuerpoSolicitud.prospectos_ids.length > 0) {
      // Audiencia Dinámica temporal (desde UI rápida)
      console.log('📌 Usando prospectos_ids personalizados');
      const { data: pDatos, error: errP } = await supabase
        .from('prospectos')
        .select('id, telefono, nombre, nombre_alumno, estado, curso_interes, canal, escuela')
        .in('id', cuerpoSolicitud.prospectos_ids);

      if (errP) return NextResponse.json({ error: 'Error obteniendo audiencia: ' + errP.message }, { status: 500 });
      candidatos = pDatos || [];
    } else if (campana.audiencia_id) {
      // USAR AUDIENCIA GUARDADA
      console.log('📌 Usando Audiencia Guardada ID:', campana.audiencia_id);
      const { data: aud, error: errAud } = await supabase.from('audiencias').select('*').eq('id', campana.audiencia_id).single();
      
      if (errAud || !aud) return NextResponse.json({ error: 'Audiencia vinculada no encontrada' }, { status: 404 });

      // El canal se revisa después: los prospectos importados o creados a mano pueden
      // traer el canal vacío y antes quedaban fuera sin explicación
      let query = supabase.from('prospectos').select('id, telefono, nombre, nombre_alumno, estado, curso_interes, canal, escuela');

      if (aud.prospectos_incluidos && aud.prospectos_incluidos.length > 0) {
        query = query.in('id', aud.prospectos_incluidos);
      } else {
        if (aud.filtro_estado && aud.filtro_estado !== 'Todos') query = query.eq('estado', aud.filtro_estado);
        if (aud.filtro_curso && aud.filtro_curso !== 'Todos') query = query.ilike('curso_interes', `%${aud.filtro_curso}%`);
        if (aud.filtro_edad_min) query = query.gte('edad', aud.filtro_edad_min);
        if (aud.filtro_edad_max) query = query.lte('edad', aud.filtro_edad_max);
      }
      
      // Filtrado por flexibilidad (requiere lógica extra si es un string complejo, pero aplicamos el básico)
      const { data: pros, error: errPros } = await query;
      if (errPros) return NextResponse.json({ error: 'Error en audiencia guardada: ' + errPros.message }, { status: 500 });
      candidatos = pros || [];
    } else {
      // Audiencia Estática Tradicional (filtros directos en la campaña)
      let query = supabase.from('prospectos').select('id, telefono, nombre, nombre_alumno, estado, curso_interes, canal, escuela')

      if (campana.publico_estado && campana.publico_estado !== 'Todos') {
        const dbEstado = campana.publico_estado.toLowerCase().replace(' ', '_')
        query = query.eq('estado', dbEstado)
      }

      if (campana.publico_curso && campana.publico_curso !== 'Todos') {
        query = query.ilike('curso_interes', `%${campana.publico_curso}%`)
      }

      const { data: pros, error: errPros } = await query
      if (errPros) return NextResponse.json({ error: 'Error obteniendo audiencia estática: ' + errPros.message }, { status: 500 })
      candidatos = pros || [];
    }

    const canalCampana = campana.canal || 'whatsapp'
    prospectos = candidatos.filter(p => puedeRecibir(p, canalCampana))

    if (prospectos.length === 0) {
      return NextResponse.json({
        error: candidatos.length > 0
          ? `La audiencia tiene ${candidatos.length} contacto(s), pero ninguno puede recibir por ${canalCampana}: revisa que tengan teléfono (10 dígitos o más) y que no sean contactos de Messenger o Instagram.`
          : 'La audiencia está vacía. Nadie cumple los filtros.',
      }, { status: 400 })
    }
    if (prospectos.length < candidatos.length) {
      console.warn(`⚠️ Se omiten ${candidatos.length - prospectos.length} contacto(s) sin teléfono válido para ${canalCampana}`)
    }

    // 3. Ejecutar envío masivo a WhatsApp, Messenger o Instagram via Meta API
    const esRedes = campana.canal === 'messenger' || campana.canal === 'instagram';

    let templateMeta = null;
    if (!esRedes && campana.nombre_plantilla) {
      const wToken = process.env.META_WHATSAPP_TOKEN
      const accId = process.env.META_BUSINESS_ACCOUNT_ID
      const urlTpl = `https://graph.facebook.com/v20.0/${accId}/message_templates?name=${campana.nombre_plantilla}`
      try {
        const resTpl = await axios.get(urlTpl, { headers: { Authorization: `Bearer ${wToken}` } })
        templateMeta = resTpl.data.data?.[0]
      } catch (e) {
        console.warn('⚠️ No se pudo obtener la definición de la plantilla de Meta:', e.message)
      }
    }

    const token = esRedes ? process.env.META_PAGE_TOKEN : process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_PHONE_NUMBER_ID; // Solo WA
    const url = esRedes 
      ? `https://graph.facebook.com/v20.0/me/messages`
      : `https://graph.facebook.com/v18.0/${phoneId}/messages`;

    if (!token) {
      return NextResponse.json({ error: 'Faltan credenciales del Token de Meta en el servidor' }, { status: 500 })
    }

    const headers = {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    }

    let enviadosExitosos = 0
    const omitidosSinDato = []

    // Loop seguro para enviar mensajes
    for (const prospecto of prospectos) {
      if (!prospecto.telefono) continue;

      let to = prospecto.telefono;
      if (!esRedes) to = to.replace(/\D/g, ''); // Para WA quitamos caracteres no numéricos, para Messenger/IG es el PSID/IGSID intacto

      const baseUrl = process.env.NEXT_PUBLIC_URL || domainOrigin || 'https://total-english-crm.vercel.app'
      const uniqueLink = `${baseUrl}/api/track?p=${prospecto.id}&c=${id}`

      let payload = {};

      if (esRedes) {
        // Estructura para Messenger e Instagram
        const nombreUsar = prospecto.nombre_alumno || prospecto.nombre || "Estimado/a";
        const msgPersonalizado = campana.mensaje 
          ? campana.mensaje.replace('{Nombre}', nombreUsar).replace('{nombre}', nombreUsar)
          : `¡Hola ${nombreUsar}! Te invitamos a nuestra campaña: ${campana.nombre}.\nMás detalles: ${uniqueLink}`;

        payload = {
          recipient: { id: to },
          message: { text: msgPersonalizado },
          messaging_type: "MESSAGE_TAG",
          tag: "CONFIRMED_EVENT_UPDATE" // Permite saltar la ventana de 24 horas (ideal para campañas/anuncios)
        };

        if (campana.imagen_url && campana.imagen_url.trim() !== '') {
          const isUrlExterna = campana.imagen_url.startsWith('http');
          const finalImageUrl = isUrlExterna ? campana.imagen_url : `${baseUrl}${campana.imagen_url.startsWith('/') ? '' : '/'}${campana.imagen_url}`;
          
          payload.message = {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [{
                  title: campana.nombre,
                  image_url: finalImageUrl,
                  subtitle: msgPersonalizado,
                  default_action: { type: "web_url", url: uniqueLink }
                }]
              }
            }
          };
        }
      } else {
        // Plantilla con los mismos comodines que al enviar desde Prospectos: {nombre}, {escuela} y {link}
        if (!templateMeta) {
          return NextResponse.json({ error: 'No se pudo leer la plantilla en Meta. Revisa que siga aprobada y vuelve a intentar.' }, { status: 400 })
        }
        const variablesPlantilla = variablesDe(templateMeta.components?.find(c => c.type === 'BODY')?.text)
        const valoresCampana = (campana.variables || []).map(v => String(v ?? '').split('{link}').join(uniqueLink))
        if (valoresCampana.filter(v => v.trim()).length < variablesPlantilla.length) {
          return NextResponse.json({
            error: `La plantilla "${campana.nombre_plantilla}" usa ${variablesPlantilla.length} variable(s) y esta campaña no las tiene configuradas. Edítala y llena los valores: puedes usar {nombre}, {escuela} y {link}.`,
          }, { status: 400 })
        }

        // Mejor saltarlo que mandar la plantilla con un hueco ("visita a -")
        const faltantes = tokensSinDato(valoresCampana, prospecto)
        if (faltantes.length > 0) {
          omitidosSinDato.push(`${prospecto.nombre_alumno || prospecto.nombre || to} (sin ${faltantes.join(' ni ')})`)
          continue
        }

        const headerComp = templateMeta.components?.find(c => c.type === 'HEADER')
        let imagenEncabezado = null
        if (headerComp?.format === 'IMAGE') {
          const img = (campana.imagen_url || '').trim() || 'https://placehold.co/600x400/png?text=Notificacion'
          imagenEncabezado = img.startsWith('http') ? img : `${baseUrl}${img.startsWith('/') ? '' : '/'}${img}`
        }
        payload = construirPayload({ to, plantilla: templateMeta, valores: valoresCampana, imagenUrl: imagenEncabezado, prospecto })

        if (headerComp?.format === 'DOCUMENT' || headerComp?.format === 'VIDEO') {
          const formato = headerComp.format.toLowerCase()
          const archivo = (campana.imagen_url || '').trim()
          // Antes mandaba un dummy.mp4 que no existe: mejor avisar que enviar un archivo roto
          if (!archivo) {
            return NextResponse.json({
              error: `La plantilla "${campana.nombre_plantilla}" lleva un ${formato === 'video' ? 'video' : 'documento'} en el encabezado. Edita la campaña y pon su URL en el campo de archivo del encabezado.`,
            }, { status: 400 })
          }
          const enlace = archivo.startsWith('http') ? archivo : `${baseUrl}${archivo.startsWith('/') ? '' : '/'}${archivo}`
          payload.template.components.unshift({ type: 'header', parameters: [{ type: formato, [formato]: { link: enlace } }] })
        }
      }

      try {
        await axios.post(url, payload, headers)
        enviadosExitosos++
      } catch (error) {
         console.warn(`⚠️ Falló envío de campaña a ${to}:`, error.response?.data || error.message)
         // Lógica de fallback para México (521 -> 52)
         if (to.startsWith('521') && to.length === 13) {
            payload.to = to.replace('521', '52')
            try {
              await axios.post(url, payload, headers)
              enviadosExitosos++
            } catch (retryError) {
              console.error(`❌ Falló reintento de campaña a ${payload.to}:`, retryError.response?.data || retryError.message)
            }
         }
      }
      
      // Pequeña pausa para no romper el rate-limit de Meta
      await new Promise(r => setTimeout(r, 200)) 
    }

    // 4. Actualizar estado y métricas de la campaña a Completada
    const { data: campanaActualizada } = await supabase
      .from('campanas')
      .update({
        estado: 'completada',
        alcance: (campana.alcance || 0) + enviadosExitosos
      })
      .eq('id', id)
      .select()
      .single()

    return NextResponse.json({ 
      mensaje: 'Campaña ejecutada satisfactoriamente', 
      omitidos_sin_dato: omitidosSinDato, 
      alcance_esperado: prospectos.length,
      envios_exitosos: enviadosExitosos,
      campana: campanaActualizada
    })

  } catch (error) {
    console.error('❌ Error general en /api/campanas/ejecutar:', error.message)
    return NextResponse.json({ error: 'Error del servidor: ' + error.message }, { status: 500 })
  }
}

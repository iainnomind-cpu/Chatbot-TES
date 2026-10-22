// Vercel build fix - Clean version 1.0
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { consultarAlex } from "@/lib/alexIA";
import { escalarAHumano } from "@/lib/prospectoSync";
import { notificarEscalamientoAdmin, notificarCitaAdmin } from "@/lib/mailer";
import axios from "axios";

export const maxDuration = 60;

export async function GET(solicitud) {
  const { searchParams } = new URL(solicitud.url);
  const modo = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const desafio = searchParams.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new Response(desafio, { status: 200 });
  }
  return NextResponse.json({ error: "Verificaci├│n fallida" }, { status: 403 });
}

// === HELPER FUNCTIONS PARA LOCK DISTRIBUIDO ===
const sleep = ms => new Promise(r => setTimeout(r, ms));


// === HELPER: Enviar push a todos los asesores suscritos ===
async function enviarPushAsesores({ title, body, url, tag }) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://erp-total-english.vercel.app';
    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, tag })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Push send error:', err);
    } else {
      const data = await res.json();
      console.log('Push enviado:', data.enviadas);
    }
  } catch (e) {
    console.error('Error enviando push:', e.message);
  }
}

async function acquireLock(conversacionId) {
  const maxRetries = 20; // 20 * 1.5s = 30s de espera m├íxima
  for (let i = 0; i < maxRetries; i++) {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() + 45000); // El lock dura 45s antes de expirar solo
    
    const { data } = await supabase
      .from('conversaciones')
      .update({ bot_bloqueado_hasta: lockTimeout.toISOString() })
      .eq('id', conversacionId)
      .lte('bot_bloqueado_hasta', now.toISOString()) // Solo actualiza si ya expir├│ el anterior o est├í libre
      .select('id')
      .maybeSingle();
      
    if (data && data.id) {
      return true; // Lock adquirido exitosamente
    }
    
    // Si no obtuvimos el lock, esperamos y reintentamos
    await sleep(1500);
  }
  return false; // Tiempo de espera agotado
}

async function releaseLock(conversacionId) {
  try {
    const past = new Date('2000-01-01T00:00:00Z');
    await supabase
      .from('conversaciones')
      .update({ bot_bloqueado_hasta: past.toISOString() })
      .eq('id', conversacionId);
  } catch (e) {
    console.error("Error liberando lock:", e.message);
  }
}

export async function POST(solicitud) {
  try {
    const cuerpo = await solicitud.json();

    console.log("­ƒôÑ [1/10] WEBHOOK RECIBIDO ÔÇö object:", cuerpo.object, "| entry count:", cuerpo.entry?.length || 0);
    // Log del payload completo para diagn├│stico (solo en caso de IG/Messenger)
    if (cuerpo.object === "page" || cuerpo.object === "instagram") {
      console.log("­ƒôÑ [1/10] PAYLOAD COMPLETO (IG/MSG):", JSON.stringify(cuerpo, null, 2));
    }

    let plataforma = null;
    let remitenteId = null;
    let mensajeId = null;
    let texto = "";
    let nombrePerfil = "Prospecto";
    let vieneDeAnuncio = false;
    let referralData = null; // { source_id, headline, body, source_type }
    let receptorOriginal = "me";
    let esEchoDeHumano = false;
    let urlArchivoEntrante = null; // URL de imagen/video enviada por el prospecto
    let tipoMensajeEntrante = "texto"; // tipo del mensaje entrante

    if (cuerpo.object === "whatsapp_business_account") {
      const entrada = cuerpo.entry?.[0];
      const cambios = entrada?.changes?.[0];
      const valor = cambios?.value;

      if (valor?.statuses && valor.statuses.length > 0) {
        const st = valor.statuses[0]
        if (st.status === 'failed') {
          const err = st.errors?.[0] || {}
          console.error(`ÔØî [WA-STATUS] ENTREGA FALLIDA ÔÇö wamid: ${st.id} | recipient: ${st.recipient_id}`)
          console.error(`ÔØî [WA-STATUS] Error code: ${err.code} | title: ${err.title} | message: ${err.message} | error_data: ${JSON.stringify(err.error_data || {})}`)
        } else {
          console.log(`­ƒô¼ [WA-STATUS] Estado: ${st.status} | wamid: ${st.id} | recipient: ${st.recipient_id}`)
        }
      }

      if (valor?.messages && valor.messages.length > 0) {
        plataforma = "whatsapp";
        const msj = valor.messages[0];
        remitenteId = msj.from;

        // Normalizaci├│n para M├®xico (521 -> 52)
        if (remitenteId.startsWith("521") && remitenteId.length === 13) {
          remitenteId = "52" + remitenteId.substring(3);
        }

        nombrePerfil = valor.contacts?.[0]?.profile?.name || "Prospecto";
        mensajeId = msj.id;
        if (msj.referral) {
          vieneDeAnuncio = true;
          referralData = {
            source_id: msj.referral.source_id || null,
            headline: msj.referral.headline || '',
            body: msj.referral.body || '',
            source_type: msj.referral.source_type || 'ad',
          };
          console.log('­ƒôó [CTWA] Referral detectado:', JSON.stringify(referralData));
        }

        if (msj.type === "text") {
          texto = msj.text?.body || "";
        } else if (msj.type === "interactive") {
          texto =
            msj.interactive?.button_reply?.title ||
            msj.interactive?.list_reply?.title ||
            "";
        } else if (msj.type === "button") {
          texto = msj.button?.text || "";
        }
      }
    } else if (cuerpo.object === "page" || cuerpo.object === "instagram") {
      const entrada = cuerpo.entry?.[0];
      console.log("­ƒôÑ [2/10] IG/MSG ÔÇö entry.id:", entrada?.id, "| messaging count:", entrada?.messaging?.length || 0);
      if (entrada?.messaging && entrada.messaging.length > 0) {
        const evento = entrada.messaging[0];
        console.log("­ƒôÑ [2/10] Evento:", JSON.stringify({
          sender: evento.sender?.id,
          recipient: evento.recipient?.id,
          hasMessage: !!evento.message,
          isEcho: evento.message?.is_echo,
          text: evento.message?.text,
          mid: evento.message?.mid,
          hasAttachments: !!evento.message?.attachments,
          hasPostback: !!evento.postback
        }));
        if (evento.message) {
          plataforma = cuerpo.object === "page" ? "messenger" : "instagram";
          if (evento.message.is_echo) {
            esEchoDeHumano = true;
            remitenteId = String(evento.recipient?.id);
            receptorOriginal = String(evento.sender?.id);
          } else {
            remitenteId = String(evento.sender?.id);
            receptorOriginal = evento.recipient?.id ? String(evento.recipient.id) : "me";
          }
          mensajeId = evento.message.mid;
          texto = evento.message.text || "";

          if (evento.message.quick_reply) {
            texto = evento.message.quick_reply.payload || texto;
          } else if (evento.message.attachments) {
            var attach = evento.message.attachments[0];
            var attachType = (attach && attach.type) ? attach.type : '';
            var attachUrl = (attach && attach.payload) ? attach.payload.url : null;
            if (attachType === 'image') {
              tipoMensajeEntrante = 'imagen';
              urlArchivoEntrante = attachUrl;
              texto = texto || '[Imagen]';
            } else if (attachType === 'video') {
              tipoMensajeEntrante = 'video';
              urlArchivoEntrante = attachUrl;
              texto = texto || '[Video]';
            } else if (attachType === 'audio') {
              tipoMensajeEntrante = 'audio';
              urlArchivoEntrante = attachUrl;
              texto = texto || '[Audio]';
            } else if (attachType === 'file') {
              tipoMensajeEntrante = 'archivo';
              urlArchivoEntrante = attachUrl;
              texto = texto || '[Archivo]';
            } else {
              texto = texto || '[Archivo adjunto]';
            }
            console.log('­ƒôÄ Attachment entrante tipo:', attachType, '| con url:', !!attachUrl);
          }
          console.log(`Ô£à [2/10] Parseado OK (Echo: ${esEchoDeHumano}) ÔÇö plataforma:`, plataforma, "| remitenteId:", remitenteId, "| texto:", texto.substring(0, 50), "| mid:", mensajeId);
        }
      } else if (entrada?.changes && entrada.changes.length > 0) {
        // Soporte para el bot├│n de "Probar" en Meta for Developers
        const valor = entrada.changes[0].value;
        if (valor && valor.message) {
          plataforma = cuerpo.object === "page" ? "messenger" : "instagram";
          remitenteId = String(valor.sender.id);
          // Meta siempre env├¡a "random_mid", lo forzamos a ser ├║nico para que no lo bloquee el filtro anti-duplicados
          mensajeId = (valor.message.mid === "random_mid") ? "test_mid_" + Date.now() : (valor.message.mid || "test_mid_" + Date.now());
          texto = valor.message.text || "Mensaje de prueba";
          console.log("Ô£à [2/10] Parseado TEST OK ÔÇö plataforma:", plataforma, "| remitenteId:", remitenteId, "| texto:", texto);
        }
      } else {
        console.log("ÔÅ¡´©Å [2/10] Sin array messaging ni changes ÔÇö evento ignorado");
      }
    }

    if (!plataforma || (!texto && !vieneDeAnuncio && !urlArchivoEntrante)) {
      console.log("ÔÅ¡´©Å [3/10] IGNORADO ÔÇö plataforma:", plataforma, "| texto:", texto ? texto.substring(0, 30) : "(vac├¡o)", "| vieneDeAnuncio:", vieneDeAnuncio, "| urlArchivo:", !!urlArchivoEntrante);
      return NextResponse.json(
        { estado: "ignorado_o_no_soportado" },
        { status: 200 },
      );
    }

    remitenteId = String(remitenteId);
    console.log("Ô£à [3/10] MENSAJE ACEPTADO ÔÇö plataforma:", plataforma, "| remitente:", remitenteId, "| texto:", texto.substring(0, 80));

    if (plataforma === "messenger" || plataforma === "instagram") {
      const nombreMeta = await obtenerNombrePerfilMeta(remitenteId, plataforma);
      if (nombreMeta && nombreMeta !== "Prospecto") {
        nombrePerfil = nombreMeta;
        console.log("­ƒæñ Nombre extra├¡do de Meta API:", nombrePerfil);
      }
    }

    let enviarRespuesta = async (to, mensaje, imagen = null, opciones = null) => {
      return await enviarMensajeMetaAPI(to, mensaje, imagen, opciones, plataforma, receptorOriginal);
    };

    let marcarEscribiendoWrapper = async (to) => {
      return await marcarEscribiendoMetaAPI(to, plataforma, receptorOriginal);
    };

    // === PASO 0: JITTER PARA EVITAR RACE CONDITIONS ===
    // Webhooks concurrentes se separan por un tiempo aleatorio
    await sleep(Math.floor(Math.random() * 2000));

    // === PASO 1: OBTENER CONVERSACI├ôN ├ÜNICA ===
    const variantesId = remitenteId.startsWith("52")
      ? [remitenteId, remitenteId.replace("52", "521")]
      : [remitenteId];

    console.log(`­ƒöì [4/10] Procesando conversaci├│n para ${remitenteId}...`);
    
    let { data: todasConvs } = await supabase
      .from("conversaciones")
      .select("id")
      .in("id_plataforma", variantesId)
      .eq("plataforma", plataforma);

    let convExist = null;
    if (todasConvs && todasConvs.length > 0) {
      convExist = todasConvs[0];
      console.log(`Ô£à [4/10] Conversaci├│n encontrada: ${convExist.id}`);
    } else {
      console.log(`­ƒåò [4/10] Creando nueva conversaci├│n...`);
      const { data: nuevaC, error: errNuevaC } = await supabase.from("conversaciones").insert({
        plataforma,
        id_plataforma: remitenteId,
        nombre_contacto: nombrePerfil !== "Prospecto" ? nombrePerfil : "Prospecto"
      }).select("id").maybeSingle();
      
      if (errNuevaC) console.error("ÔØî Error creando conv:", errNuevaC.message);

      if (nuevaC) {
        await sleep(500);
        const { data: checkC } = await supabase
          .from("conversaciones")
          .select("id")
          .in("id_plataforma", variantesId)
          .eq("plataforma", plataforma);
        
        if (checkC && checkC.length > 0 && checkC[0].id !== nuevaC.id) {
          return NextResponse.json({ estado: "duplicado_conv" }, { status: 200 });
        }
        convExist = nuevaC;
      } else {
        const { data: retryC } = await supabase
          .from("conversaciones")
          .select("id")
          .in("id_plataforma", variantesId)
          .eq("plataforma", plataforma)
          .limit(1)
          .maybeSingle();
        convExist = retryC;
      }
    }

    if (!convExist) return NextResponse.json({ error: "No conv" }, { status: 200 });

    // === EARLY EXIT: CONVERSACION ASIGNADA A HUMANO ===
    // Saltamos lock/debounce/bot para no perder mensajes del usuario en modo humano
    if (!esEchoDeHumano) {
      const { data: convHumano } = await supabase
        .from('conversaciones')
        .select('asignado_a_humano')
        .eq('id', convExist.id)
        .single();

      if (convHumano && convHumano.asignado_a_humano) {
        const contenidoH = texto || (urlArchivoEntrante
          ? '[' + tipoMensajeEntrante.charAt(0).toUpperCase() + tipoMensajeEntrante.slice(1) + ']'
          : '');

        // Guardar mensaje directo sin lock
        const { error: errInsertH } = await supabase.from('mensajes').insert({
          conversacion_id: convExist.id,
          remitente: 'usuario',
          contenido: contenidoH,
          id_mensaje_meta: mensajeId,
          tipo: tipoMensajeEntrante,
          url_archivo: urlArchivoEntrante || null
        });
        if (errInsertH) {
          if (errInsertH.code === '23505' || (errInsertH.message && errInsertH.message.includes('duplicate'))) {
            console.log('[HUMANO DIRECTO] Duplicado:', mensajeId);
            return NextResponse.json({ estado: 'ya_procesado' }, { status: 200 });
          }
          console.error('Error insertando msg humano:', errInsertH.message);
        }

        // Actualizar ultimo_mensaje para que aparezca en el inbox
        await supabase.from('conversaciones').update({
          ultimo_mensaje: contenidoH.substring(0, 200),
          actualizado_en: new Date().toISOString()
        }).eq('id', convExist.id);

        // Push al asesor
        try {
          await enviarPushAsesores({
            title: 'Respuesta de ' + (nombrePerfil !== 'Prospecto' ? nombrePerfil : 'prospecto'),
            body: texto ? texto.substring(0, 100) : '[Archivo adjunto]',
            url: '/inbox?id=' + convExist.id,
            tag: 'msg-' + convExist.id
          });
        } catch(ePush) {
          console.error('Push error humano:', ePush.message);
        }

        console.log('[HUMANO DIRECTO] Guardado sin lock, conv:', convExist.id);
        return NextResponse.json({ estado: 'guardado_humano_directo' }, { status: 200 });
      }
    }

    // === PASO 2: BATALLA POR EL MENSAJE (LOCK DISTRIBUIDO) ===
    console.log(`ÔÜö´©Å [5/10] Insertando mensaje para batalla: ${mensajeId}`);
    const { data: nuevoMsg, error: errMsg } = await supabase.from("mensajes").insert({
      conversacion_id: convExist.id,
      remitente: esEchoDeHumano ? "humano" : "usuario",
      contenido: texto || (urlArchivoEntrante ? "[" + tipoMensajeEntrante.charAt(0).toUpperCase() + tipoMensajeEntrante.slice(1) + "]" : ""),
      id_mensaje_meta: mensajeId,
      tipo: tipoMensajeEntrante,
      url_archivo: urlArchivoEntrante || null
    }).select("id").maybeSingle();

    if (errMsg) {
      if (errMsg.code === "23505" || errMsg.message?.includes("duplicate")) {
        console.log("ÔÅ¡´©Å [5/10] Bloqueo por Constraint UNIQUE (Mensaje ya existe)");
        return NextResponse.json({ estado: "ya_procesado" }, { status: 200 });
      }
      console.error("ÔØî Error insertando mensaje:", errMsg.message);
    }

    await sleep(2000);
    const { data: misMsgsMeta } = await supabase
      .from("mensajes")
      .select("id")
      .eq("id_mensaje_meta", mensajeId)
      .order("creado_en", { ascending: true });

    if (misMsgsMeta && misMsgsMeta.length > 1 && nuevoMsg && misMsgsMeta[0].id !== nuevoMsg.id) {
      await supabase.from("mensajes").delete().eq("id", nuevoMsg.id);
      return NextResponse.json({ estado: "ya_procesado" }, { status: 200 });
    }

    // === PASO 3: ADQUIRIR LOCK DE CONVERSACI├ôN ===
    // Esperamos a que la conversaci├│n est├® libre para procesar (evita respuestas dobles a mensajes r├ípidos)
    const lockAdquirido = await acquireLock(convExist.id);
    if (!lockAdquirido) {
      console.log(`ÔÅ¡´©Å [LOCK] No se pudo adquirir el lock para ${convExist.id} despu├®s de esperar. Abortando.`);
      return NextResponse.json({ estado: "timeout_lock" }, { status: 200 });
    }

    try {
      // === DEBOUNCE MEJORADO ===
      // Ya tenemos el lock. Verificamos si somos el mensaje M├üS RECIENTE.
      // Si el usuario envi├│ 2 mensajes r├ípidos, el primero insert├│, esper├│ el lock, lo tom├│.
      // Pero si somos el primero y hay un segundo mensaje ya insertado en BD, dejamos que el segundo se encargue (que est├í esperando el lock).
      const { data: ultimoMsgUsuario } = await supabase
        .from("mensajes")
        .select("id_mensaje_meta, id")
        .eq("conversacion_id", convExist.id)
        .eq("remitente", "usuario")
        .order("creado_en", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultimoMsgUsuario && ultimoMsgUsuario.id_mensaje_meta !== mensajeId) {
        console.log(`ÔÅ¡´©Å [DEBOUNCE] Abortando petici├│n antigua (${mensajeId}), hay un mensaje m├ís nuevo.`);
        return NextResponse.json({ estado: "reemplazado_por_nuevo" }, { status: 200 });
      }

      console.log(`­ƒÅå [WINNER] Ejecuci├│n oficial para: ${mensajeId}`);

    // === ACTUALIZAR INBOX EN TIEMPO REAL ===
    // Actualizar ultimo_mensaje y actualizado_en en la tabla conversaciones para que el sidebar se ordene y muestre el mensaje inmediatamente
    await supabase.from("conversaciones").update({
      ultimo_mensaje: texto ? texto.substring(0, 200) : (urlArchivoEntrante ? "[" + tipoMensajeEntrante.charAt(0).toUpperCase() + tipoMensajeEntrante.slice(1) + "]" : (vieneDeAnuncio ? "[Anuncio]" : "[Mensaje]")),
      actualizado_en: new Date().toISOString(),
      ...(esEchoDeHumano ? { asignado_a_humano: true } : {})
    }).eq("id", convExist.id);

    if (esEchoDeHumano) {
      console.log(`ÔÅ©´©Å [ECHO] Mensaje del humano sincronizado. Deteniendo bot.`);
      return NextResponse.json({ estado: "echo_sincronizado" }, { status: 200 });
    }

    // Actualizar nombre si es necesario
    if (nombrePerfil && nombrePerfil !== "Prospecto") {
      await supabase.from("conversaciones").update({ nombre_contacto: nombrePerfil }).eq("id", convExist.id);
    }

    // Buscar prospecto real
    const { data: convFull } = await supabase.from("conversaciones").select("*, prospectos(*)").eq("id", convExist.id).single();
    let prosExist = convFull?.prospectos || null;
    
    if (!prosExist) {
      const { data: pTel } = await supabase.from("prospectos").select("*").eq("telefono", remitenteId).eq("canal", plataforma).maybeSingle();
      if (pTel) {
        prosExist = pTel;
        await supabase.from("conversaciones").update({ prospecto_id: pTel.id }).eq("id", convExist.id);
      }
    }

    // --- PAUSA DE BOT: SI EST├ü ASIGNADO A HUMANO, NO CONSULTA A ALEXIA ---
    if (convFull && convFull.asignado_a_humano) {
      console.log(
        `ÔÅ©´©Å [7/10] Chatbot PAUSADO para ${remitenteId} (asignado a humano). Mensaje guardado en Inbox.`,
      );
      return NextResponse.json({ estado: "pausado_humano" }, { status: 200 });
    }

    // --- SKIP BOT: SI EL MENSAJE ES SOLO UN ARCHIVO/IMAGEN SIN TEXTO REAL ---
    // El bot no puede "leer" imagenes, asi que solo la guardamos y no respondemos
    const etiquetasSoloArchivo = ["[Imagen]", "[Video]", "[Audio]", "[Archivo]", "[Archivo adjunto]"];
    if (urlArchivoEntrante && (!texto || etiquetasSoloArchivo.includes(texto))) {
      console.log(`[7/10] Archivo/imagen recibida sin texto real - guardada en Inbox sin respuesta del bot.`);
      return NextResponse.json({ estado: "imagen_guardada" }, { status: 200 });
    }
    
    // 8. Marcar como "escribiendo..." si es posible
    await marcarEscribiendoWrapper(remitenteId);

    console.log(`­ƒñû [7/10] Bot ACTIVO ÔÇö consultando AlexIA para ${remitenteId} en ${plataforma}`);

    // --- SE ELIMIN├ô LA PAUSA AUTOM├üTICA AQU├ì ---
    // Ahora permitimos que la IA analice si el usuario solo est├í agradeciendo
    // o haciendo m├ís preguntas despu├®s de agendar.
    // ---------------------------------------------------------------------

    // 4. Consultar AlexIA
    const { data: historialRaw } = await supabase
      .from("mensajes")
      .select("remitente, contenido, creado_en, id_mensaje_meta")
      .eq("conversacion_id", convExist.id)
      .order("creado_en", { ascending: false })
      .limit(40);

    let freshPros = prosExist || {};
    if (prosExist?.id) {
      const { data: pData } = await supabase
        .from("prospectos")
        .select("*")
        .eq("id", prosExist.id)
        .maybeSingle();
      if (pData) freshPros = pData;
    }

    // --- DETECCI├ôN DE TRANSICI├ôN AGENTE ÔåÆ BOT ---
    // Analizamos el historial para detectar si hubo intervenci├│n humana reciente
    // y construir un resumen de handover para que Alex retome sin confusi├│n.
    const historialCronologico = (historialRaw || []).slice().reverse();

    let huboIntervencionHumana = false;
    let resumenHandover = "";

    // Buscar bloques de mensajes del agente humano
    const mensajesAgente = historialCronologico.filter(
      (m) => m.remitente === "humano" || m.remitente === "agente",
    );
    if (mensajesAgente.length > 0) {
      huboIntervencionHumana = true;

      // Encontrar el ├¡ndice del ├║ltimo mensaje del agente
      const ultimoIdxAgente = historialCronologico.findLastIndex(
        (m) => m.remitente === "humano" || m.remitente === "agente",
      );

      // Extraer la "sesi├│n humana": desde el primer msg de agente hasta el ├║ltimo
      const primerIdxAgente = historialCronologico.findIndex(
        (m) => m.remitente === "humano" || m.remitente === "agente",
      );
      const sesionHumana = historialCronologico.slice(
        primerIdxAgente,
        ultimoIdxAgente + 1,
      );

      // Construir resumen legible de lo que el agente habl├│ con el cliente
      const lineasResumen = sesionHumana
        .map((m) => {
          if (m.remitente === "humano" || m.remitente === "agente") {
            return `  ASESOR dijo: "${m.contenido}"`;
          }
          return `  CLIENTE respondi├│: "${m.contenido}"`;
        })
        .join("\n");

      // Mensajes del usuario DESPU├ëS de la ├║ltima intervenci├│n del agente
      // (estos son los que el bot necesita atender ahora)
      const mensajesPendientes = historialCronologico
        .slice(ultimoIdxAgente + 1)
        .filter((m) => m.remitente === "usuario");
      const pendientesTexto =
        mensajesPendientes.length > 0
          ? mensajesPendientes.map((m) => `  - "${m.contenido}"`).join("\n")
          : "  (Ninguno ÔÇö este es el primer mensaje del cliente tras la reactivaci├│n del bot)";

      resumenHandover = `
­ƒöä RESUMEN DE TRANSICI├ôN AGENTE ÔåÆ BOT:
Un asesor humano tom├│ el control de esta conversaci├│n y ya habl├│ con el cliente.
Aqu├¡ est├í TODO lo que se dijo durante la intervenci├│n humana:

${lineasResumen}

MENSAJES DEL CLIENTE PENDIENTES DE RESPUESTA (despu├®s de que el agente termin├│):
${pendientesTexto}

INSTRUCCIONES CR├ìTICAS PARA TI (ALEX):
1. NO saludes como si fuera la primera vez. El cliente ya estuvo hablando con un asesor.
2. LEE cuidadosamente lo que el asesor ya habl├│ y acord├│ con el cliente.
3. Contin├║a la conversaci├│n desde el PUNTO EXACTO donde el asesor la dej├│.
4. Si el asesor ya resolvi├│ el tema, pregunta amablemente si hay algo m├ís en lo que puedas ayudar.
5. Si el asesor dej├│ algo pendiente (ej: "te confirmo ma├▒ana"), recon├│celo y ofrece ayuda adicional.
6. NUNCA repitas informaci├│n que el asesor ya proporcion├│.
7. Tu tono debe ser de continuidad natural: "┬íHola de nuevo! Veo que mi compa├▒ero ya te atendi├│..."
`;
    }

    const historialFormat = historialCronologico.map((m) => {
      if (m.remitente === "usuario") {
        return { role: "user", content: m.contenido };
      }
      // Distinguir entre bot, agente humano y seguimientos autom├íticos
      if (m.remitente === "humano" || m.remitente === "agente") {
        return {
          role: "assistant",
          content: `[MENSAJE DEL ASESOR HUMANO]: ${m.contenido}`,
        };
      }
      // Marcar mensajes de seguimiento autom├ítico para que la IA no los confunda con respuestas reales
      if (
        m.id_mensaje_meta &&
        String(m.id_mensaje_meta).startsWith("seguimiento_auto")
      ) {
        return {
          role: "assistant",
          content: `[SEGUIMIENTO AUTOM├üTICO]: ${m.contenido}`,
        };
      }
      return { role: "assistant", content: m.contenido };
    });

    // OBTENER CITAS PR├ôXIMAS PARA EVITAR CONFLICTOS
    const { data: citasFuturasData } = await supabase
      .from("citas")
      .select("fecha, hora")
      .gte("fecha", new Date().toISOString().split("T")[0])
      .eq("estado", "pendiente")
      .order("fecha", { ascending: true })
      .limit(20);

    const listaCitas = (citasFuturasData || [])
      .map((c) => `- ${c.fecha} a las ${c.hora}`)
      .join("\n");

    // Inyectar contexto de lo que YA sabemos
    const fechaActualTexto = new Date().toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Mexico_City",
    });
    // OBTENER SI EL PROSPECTO YA TIENE CITA
    let tieneCitaPendiente = false;
    if (prosExist?.id) {
      const { data: citasPendientesProsp } = await supabase
        .from("citas")
        .select("id")
        .eq("prospecto_id", prosExist.id)
        .eq("estado", "pendiente")
        .limit(1);
      if (citasPendientesProsp && citasPendientesProsp.length > 0)
        tieneCitaPendiente = true;
    }

    // === CTWA: DETECCI├ôN DE ANUNCIO ===
    let anuncioDetectado = null;
    let anuncioContexto = '';

    if (referralData) {
      // 1. Buscar por source_id exacto
      let { data: anuncioExacto } = await supabase
        .from('anuncios')
        .select('*')
        .eq('meta_ad_id', referralData.source_id)
        .maybeSingle();

      if (anuncioExacto) {
        anuncioDetectado = anuncioExacto;
      } else if (referralData.headline || referralData.body) {
        // 2. Fallback: buscar por palabras clave contra headline/body
        const { data: todosAnuncios } = await supabase.from('anuncios').select('*');
        const textoAnuncio = `${referralData.headline} ${referralData.body}`.toLowerCase();
        for (const a of (todosAnuncios || [])) {
          const claves = a.palabras_clave || [];
          if (claves.some(c => textoAnuncio.includes(c.toLowerCase()))) {
            anuncioDetectado = a;
            break;
          }
        }
      }

      // 3. Guardar anuncio_id en la conversaci├│n si lo detectamos
      if (anuncioDetectado) {
        console.log(`­ƒÄ» [CTWA] Anuncio detectado: "${anuncioDetectado.nombre}" (${anuncioDetectado.id})`);
        await supabase.from('conversaciones')
          .update({ anuncio_id: anuncioDetectado.id })
          .eq('id', convExist.id);

        const esDiagnostico = anuncioDetectado.flujo_campana === 'DIAGNOSTICO';

        anuncioContexto = `
­ƒÄ» USUARIO VIENE DE ANUNCIO DE META ADS: "${anuncioDetectado.nombre}"
CURSO DE INTER├ëS DETECTADO AUTOM├üTICAMENTE: ${anuncioDetectado.curso_relacionado || 'Sin especificar'}
HEADLINE DEL ANUNCIO QUE VIO: "${referralData.headline}"
${esDiagnostico ? 'FLUJO_CAMPANA: DIAGNOSTICO' : ''}

${!esDiagnostico && anuncioDetectado.saltar_onboarding ? `INSTRUCCI├ôN CR├ìTICA ÔÇö SKIP ONBOARDING:
- Este usuario YA vio el anuncio de "${anuncioDetectado.curso_relacionado || 'nuestro curso'}". Sabe de qu├® se trata.
- NO hagas el perfilamiento completo de edad, nivel, horarios, para qui├®n es.
- NO preguntes "┬┐a qui├®n va dirigido?" ni "┬┐qu├® edad tiene el alumno?" al inicio.
- RESPONDE DIRECTO: saluda brevemente, menciona que viste que le interes├│ el "${anuncioDetectado.curso_relacionado || 'curso'}" del anuncio, y da los beneficios principales + precio.
- Solo al final pregunta algo espec├¡fico: "┬┐Para qui├®n ser├¡a? ┬┐Ni├▒o, adulto? ┬┐Cu├íntos a├▒os tiene?" para personalizar la propuesta.
- Tu primer mensaje debe sentirse como si ya conocieras por qu├® escriben.` : ''}
`;
      } else {
        console.log(`­ƒôó [CTWA] Referral sin anuncio configurado (source_id: ${referralData.source_id})`);
        anuncioContexto = `
­ƒôó USUARIO VIENE DE UN ANUNCIO DE META ADS.
ANUNCIO: "${referralData.headline || 'Sin t├¡tulo'}"
NOTA: El anuncio no est├í configurado a├║n en el ERP, pero el usuario viene con intenci├│n directa. S├® conciso y directo al responder.
`;
      }
    }

    // Si NO hay referral pero la conversaci├│n ya tiene anuncio_id (mensajes de seguimiento del mismo prospecto)
    if (!referralData && convExist?.anuncio_id) {
      const { data: anuncioConv } = await supabase
        .from('anuncios')
        .select('*')
        .eq('id', convExist.anuncio_id)
        .maybeSingle();
      if (anuncioConv && anuncioConv.flujo_campana === 'DIAGNOSTICO') {
        anuncioContexto = `FLUJO_CAMPANA: DIAGNOSTICO\n­ƒÄ» Este usuario inici├│ desde el anuncio "${anuncioConv.nombre}". Contin├║a el flujo diagn├│stico donde se qued├│.`;
        console.log(`­ƒÄ» [CTWA-FOLLOWUP] Continuando flujo DIAGNOSTICO para anuncio "${anuncioConv.nombre}"`);
      }
    }

    const contextoCrm = `CONTEXTO ACTUAL DEL PROSPECTO:
        Fecha de Hoy: ${fechaActualTexto}
        Nombre Alumno: ${freshPros.nombre_alumno || freshPros.nombre || "Desconocido"}
        Edad: ${freshPros.edad || "Desconocida"}
        Categor├¡a: ${freshPros.categoria_edad || "Desconocida"}
        Nivel: ${freshPros.nivel || "Desconocido"}
        Horario: ${freshPros.horario || "Desconocido"}
        Curso de Inter├®s: ${anuncioDetectado?.curso_relacionado || freshPros.curso_interes || "Desconocido"}
        
        CITAS OCUPADAS (NO AGENDAR AQU├ì):
        ${listaCitas || "No hay citas agendadas a├║n."}

        IMPORTANTE: Si ya conoces estos datos, NO los preguntes de nuevo. Solo avanza al siguiente paso del flujo.
        
        ${anuncioContexto}
        
        ${huboIntervencionHumana ? resumenHandover : ""}
        
        TRANSICI├ôN AGENTE-BOT: En el historial ver├ís mensajes marcados como [MENSAJE DEL ASESOR HUMANO]. Esto significa que un asesor humano intervino en la conversaci├│n. Debes:
        1. Leer TODOS los mensajes del asesor para entender qu├® ya se habl├│ y qu├® se acord├│.
        2. NO repetir informaci├│n que el asesor ya proporcion├│.
        3. Continuar la conversaci├│n desde donde el asesor la dej├│, de forma natural.
        4. Si el asesor ya cerr├│ el tema o agend├│ algo, simplemente pregunta si hay algo m├ís en lo que puedas ayudar.
        5. Tu primera respuesta tras una transici├│n NUNCA debe ser el mensaje de bienvenida ni reiniciar el perfilamiento.
        
        ${tieneCitaPendiente ? "ÔÜá´©Å ESTADO ACTUAL: EL PROSPECTO YA TIENE UNA CITA AGENDADA. NO LE OFREZCAS AGENDAR OTRA CITA. SI EL PROSPECTO AGRADECE O DICE OK, SOLO DESP├ìDETE AMABLEMENTE Y CIERRA LA CONVERSACI├ôN. NO REPITAS EL MENSAJE DE CONFIRMACI├ôN DE CITA." : ""}`;


    // OBTENER CURSOS REALES DE LA BASE DE DATOS
    const { data: cursosDb } = await supabase.from("cursos").select("*");
    let tablaDinamicaCursos = "NO HAY CURSOS";
    const hoyStr = new Date().toISOString().split("T")[0];
    if (cursosDb && cursosDb.length > 0) {
      tablaDinamicaCursos = cursosDb
        .filter(c => {
          // Excluir cursos especiales vencidos
          if (c.es_especial && c.fecha_fin_vigencia && c.fecha_fin_vigencia < hoyStr) return false;
          return true;
        })
        .map((c) => {
          if (c.es_especial) {
            const vigencia = c.fecha_fin_vigencia
              ? `${c.fecha_inicio_vigencia || 'Ya disponible'} al ${c.fecha_fin_vigencia}`
              : 'Sin fecha de cierre';
            const edadRango = (c.edad_minima || c.edad_maxima)
              ? `${c.edad_minima || 0} a ${c.edad_maxima || 99} a├▒os`
              : 'Todas las edades';
            return `
­ƒîƒ CURSO ESPECIAL/TEMPORAL: ${c.nombre}
   MODO: DIRECTO ÔÇö NO hagas el perfilamiento completo (no preguntes nivel, horarios, para qui├®n es)
   Vigencia: ${vigencia}
   Para Edad: ${edadRango}
   Beneficios Condensados: ${c.beneficios || "Generales"}
   Precio Ancla: ${c.precio_ancla || (c.precio ? "$" + c.precio : "A Consultar")}
   Regalo (Gancho): ${c.regalo_gancho || "­ƒÄü Clase Muestra"}
   Imagen Referencia: ${c.imagen_url || "null"}
            `;
          }
          return `
­ƒÄô CURSO: ${c.nombre}
   Frase Espejo: ${c.frase_espejo || "┬íExcelente elecci├│n!"}
   Beneficios Condensados: ${c.beneficios || "Generales"}
   Precio Ancla: ${c.precio_ancla || (c.precio ? "$" + c.precio : "A Consultar")}
   Regalo (Gancho): ${c.regalo_gancho || "­ƒÄü Clase Muestra"}
   Para Edad/Nivel: ${c.nivel || "Todas"} | Edades: ${c.edad_minima || 0} - ${c.edad_maxima || 99} a├▒os
   Imagen Referencia: ${c.imagen_url || "null"}
          `;
        })
        .join("\n\n");
    }

    // Obtener configuraci├│n del bot (horarios, brechas) y citas existentes para evitar cruces
    let configBot = null;
    let citasExistentes = [];

    const { data: cnf } = await supabase
      .from("configuracion_bot")
      .select("*")
      .eq("id", 1)
      .single();
    if (cnf) configBot = cnf;

    // Consultar citas de los pr├│ximos 7 d├¡as para que la IA sepa qu├® est├í ocupado
    if (citasFuturasData) citasExistentes = citasFuturasData;

    const contextoCrmPlus = `${contextoCrm}\n\n## CITAS OCUPADAS ACTUALMENTE:\n${
      citasExistentes.length > 0
        ? citasExistentes.map((c) => `- ${c.fecha} a las ${c.hora}`).join("\n")
        : "No hay citas agendadas a├║n, todos los horarios est├ín libres."
    }`;

    const { respuesta, datos, opciones, intencion } = await consultarAlex(
      [
        {
          role: "system",
          content: contextoCrmPlus.replace("{Telefono}", remitenteId),
        },
        ...historialFormat,
      ],
      nombrePerfil,
      plataforma,
      tablaDinamicaCursos,
      configBot,
    );

    // Evitar bucles - comparar con los ├║ltimos 2 mensajes del bot
    const mensajesBot = (historialRaw || []).filter(
      (m) => m.remitente === "bot",
    );
    const ultimasRespuestasBot = mensajesBot
      .slice(0, 2)
      .map((m) => m.contenido?.trim());
    const respuestaTrimmed = respuesta?.trim();

    if (
      ultimasRespuestasBot.includes(respuestaTrimmed) &&
      intencion !== "CIERRE_CITA"
    ) {
      console.log(
        `ÔÜá´©Å Respuesta repetida detectada para ${remitenteId}. Reformulando...`,
      );
      // En vez de ignorar, enviamos un mensaje gen├®rico de avance
      const respuestaAlternativa =
        "┬íGracias por tu respuesta! ­ƒÿè ┬┐Me puedes dar un poco m├ís de detalle para poder ayudarte mejor?";
      await supabase.from("mensajes").insert({
        conversacion_id: convExist.id,
        remitente: "bot",
        contenido: respuestaAlternativa,
        tipo: "texto",
      });
      await enviarRespuesta(remitenteId, respuestaAlternativa);
      return NextResponse.json({ estado: "reformulado" }, { status: 200 });
    }

    console.log(`­ƒñû AlexIA (${remitenteId}):`, { intencion, datos });

    if (
      intencion === "SPECIFIC_QUESTION_PASS_AGENT" ||
      intencion === "TRANSFER_HUMANO"
    ) {
      console.log(`­ƒÜ¿ Escalamiento a humano para ${remitenteId}`);
      const motivo =
        datos?.escalation_reason ||
        "Usuario solicit├│ hablar con un asesor o hizo pregunta compleja";
      const categoria = datos?.escalation_category || "pregunta_especifica";
      if (!prosExist) {
        console.log("Creando prospecto de emergencia para escalamiento...");
        const { data: pEmergencia } = await supabase.from("prospectos").insert({
          nombre: nombrePerfil !== "Prospecto" ? nombrePerfil : "Interesado",
          telefono: remitenteId,
          canal: plataforma,
          estado: "Borrador"
        }).select("*").single();
        if (pEmergencia) {
          prosExist = pEmergencia;
          await supabase.from("conversaciones").update({ prospecto_id: pEmergencia.id }).eq("id", convExist.id);
        }
      }

      await escalarAHumano(convExist.id, prosExist?.id, motivo, categoria);

      const msjEscalamiento = respuesta && respuesta.trim().length > 5 
        ? respuesta.trim()
        : "Voy a transferir tu solicitud ahora mismo con uno de nuestros asesores.\n\nRevisar├í tu caso para darte una respuesta personalizada en unos momentos.\n\nUn asesor se pondr├í en contacto contigo a la brevedad por este medio para darte seguimiento puntual. ┬íGracias por tu paciencia!";

      await enviarRespuesta(remitenteId, msjEscalamiento);
      // Dividir por saltos de l├¡nea para simular el env├¡o de varios mensajes
      const partesEscalamiento = msjEscalamiento.split("\n\n");
      for (let i = 0; i < partesEscalamiento.length; i++) {
        await supabase.from("mensajes").insert({
          conversacion_id: convExist.id,
          remitente: "bot",
          contenido: partesEscalamiento[i],
          tipo: "texto",
        });
      }
      await supabase
        .from("conversaciones")
        .update({
          ultimo_mensaje: partesEscalamiento[partesEscalamiento.length - 1],
        })
        .eq("id", convExist.id);

      // --- NOTIFICACIONES AL ADMINISTRADOR ---
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        const msgAdminEscalamiento =
          `­ƒÜ¿ *┬íSE REQUIERE UN ASESOR HUMANO!* ­ƒÜ¿\n\n` +
          `­ƒæñ *Prospecto:* ${prosExist?.nombre_alumno || prosExist?.nombre || nombrePerfil || "Desconocido"}\n` +
          `­ƒô× *Tel├®fono:* ${remitenteId}\n` +
          `­ƒÆ¼ *Motivo:* El usuario ha solicitado ayuda o el bot no pudo responder.\n\n` +
          `­ƒöù *Ver en Inbox:* https://erp-total-english.vercel.app/inbox`;

        console.log("­ƒôó Notificaci├│n WhatsApp Admin desactivada temporalmente");
        // await enviarRespuesta(adminPhone, msgAdminEscalamiento);
      }

      // Notificaci├│n por correo con Resend
      try {
        const adminEmail = process.env.ADMIN_EMAIL || "admin@tes.edu";
        console.log("­ƒôº Notificando por email (PAUSADO TEMPORALMENTE):", adminEmail);
        /*
        if (adminEmail) {
          const resEmail = await notificarEscalamientoAdmin({
            adminEmail: adminEmail,
            nombreProspecto:
              prosExist?.nombre_alumno ||
              prosExist?.nombre ||
              nombrePerfil ||
              "Desconocido",
            telefonoProspecto: remitenteId,
            motivo: texto || "escalamiento",
            conversacionId: convExist.id,
          });
          console.log("­ƒôº Resultado de notificaci├│n email:", resEmail);
        } else {
          console.warn(
            "ÔÜá´©Å No se encontr├│ email de administrador para enviar alerta de escalamiento.",
          );
        }
        */
      } catch (e) {
        console.error("ÔØî Error enviando notificaci├│n de correo:", e);
      }

      return NextResponse.json({ estado: "escalado" }, { status: 200 });
    }
    // --------------------------------------------

    // 5. Actualizar CRM o Crear Prospecto si ya hay datos suficientes
    if (datos && Object.keys(datos).length > 0) {
      try {
        if (!prosExist) {
          // Crear Prospecto solo si tenemos datos m├¡nimos (Edad, Nivel o Horario)
          if (
            datos.edad ||
            datos.nivel ||
            datos.horario ||
            datos.nombre_alumno
          ) {
            const { data: nuevoP } = await supabase
              .from("prospectos")
              .insert({
                nombre: (nombrePerfil && nombrePerfil !== "Prospecto") ? nombrePerfil : (datos.nombre_alumno || "Interesado"),
                nombre_alumno: datos.nombre_alumno || null,
                telefono: remitenteId,
                edad: datos.edad ? parseInt(datos.edad) : null,
                nivel: datos.nivel || null,
                horario: datos.horario || null,
                curso_interes: datos.curso_interes || null,
                canal: plataforma,
                estado: "Borrador",
              })
              .select("*")
              .single();

            if (nuevoP) {
              prosExist = nuevoP;
              await supabase
                .from("conversaciones")
                .update({ prospecto_id: nuevoP.id })
                .eq("id", convExist.id);
            }
          }
        } else {
          // Si ya existe, actualizamos el mismo registro para evitar duplicados
          const isInvalidName = (n) =>
            !n ||
            ["...", "desconocido", "n/a", "null", "usuario"].includes(
              String(n).toLowerCase(),
            );
          const updateData = { actualizado_en: new Date().toISOString() };

          if (datos.nombre_alumno && !isInvalidName(datos.nombre_alumno))
            updateData.nombre_alumno = datos.nombre_alumno;
          if (datos.edad) updateData.edad = parseInt(datos.edad);
          if (datos.nivel && !isInvalidName(datos.nivel))
            updateData.nivel = datos.nivel;
          if (datos.horario && !isInvalidName(datos.horario))
            updateData.horario = datos.horario;
          if (datos.curso_interes && !isInvalidName(datos.curso_interes))
            updateData.curso_interes = datos.curso_interes;
          if (datos.categoria_edad)
            updateData.categoria_edad = datos.categoria_edad;
          if (datos.lead_score && !isInvalidName(datos.lead_score))
            updateData.lead_score = datos.lead_score;

          if (prosExist.estado === "Borrador" && Object.keys(updateData).length > 1) {
            updateData.estado = "Interesado";
          }

          const { error: crmError } = await supabase
            .from("prospectos")
            .update(updateData)
            .eq("id", prosExist.id);
          if (crmError)
            console.error("Error actualizando prospecto:", crmError.message);
        }
      } catch (errSync) {
        console.error("ÔØî Error fatal en sync CRM:", errSync.message);
      }
    }

    // 5b. GUARDAR NOMBRE DEL ALUMNO (Forzado durante agendamiento)
    if (prosExist) {
      const isInvalidN = (n) =>
        !n ||
        ["...", "desconocido", "n/a", "null", "usuario", ""].includes(
          String(n).toLowerCase().trim(),
        );

      // 1. Si no tenemos nombre de prospecto (el tutor/titular), usar el de Meta
      if (isInvalidN(prosExist.nombre) && !isInvalidN(nombrePerfil)) {
        await supabase.from("prospectos").update({ nombre: nombrePerfil }).eq("id", prosExist.id);
        prosExist.nombre = nombrePerfil;
      }

      // 2. Extraer nombre del alumno
      let nombreFinal = datos.nombre_alumno;

      // Si la intenci├│n es recoger nombre o estamos agendando
      if (isInvalidN(nombreFinal) && (intencion === "SCHEDULING_DATE" || intencion === "RECOGER_NOMBRE")) {
        const textoLimpio = texto.trim();
        if (textoLimpio && textoLimpio.split(/\s+/).length <= 5 && !/\d/.test(textoLimpio) && !textoLimpio.includes("http")) {
          nombreFinal = textoLimpio;
        }
      }

      // Fallback: si el curso es para el usuario y no tenemos nombre_alumno, usar el nombre del prospecto
      if (isInvalidN(nombreFinal) && freshPros.es_para_mi !== "no") {
        nombreFinal = prosExist.nombre_alumno || prosExist.nombre;
      }

      if (nombreFinal && !isInvalidN(nombreFinal)) {
        console.log("­ƒôî Guardando nombre_alumno:", nombreFinal);
        await supabase
          .from("prospectos")
          .update({ nombre_alumno: nombreFinal, nombre: nombreFinal })
          .eq("id", prosExist.id);
        
        await supabase
          .from("conversaciones")
          .update({ nombre_contacto: nombreFinal })
          .eq("id", convExist.id);

        prosExist.nombre_alumno = nombreFinal;
      }
    }

    // 6. L├│gica de Citas (Si la intenci├│n es CIERRE_CITA)
    if (intencion === "CIERRE_CITA") {
      // Asegurarnos de tener un prospecto vinculado antes de crear la cita
      if (!prosExist) {
        console.log("­ƒöì [6/10] Prospecto no encontrado en sync previo, intentando recuperaci├│n final...");
        const { data: pRecheck } = await supabase.from("prospectos").select("*").eq("telefono", remitenteId).maybeSingle();
        if (pRecheck) {
          prosExist = pRecheck;
        } else {
          // Crear prospecto de emergencia para no perder la cita
          const { data: pEmergencia } = await supabase.from("prospectos").insert({
            nombre: (nombrePerfil && nombrePerfil !== "Prospecto") ? nombrePerfil : (datos.nombre_alumno || "Interesado"),
            nombre_alumno: datos.nombre_alumno || null,
            telefono: remitenteId,
            canal: plataforma,
            estado: "nuevo"
          }).select("*").single();
          if (pEmergencia) prosExist = pEmergencia;
        }
      }

      if (prosExist) {
        const { data: citasExistentes } = await supabase
          .from("citas")
          .select("id, fecha, hora")
          .eq("prospecto_id", prosExist.id)
          .eq("estado", "pendiente")
          .order("creado_en", { ascending: false })
          .limit(1);

        const citaExistente = citasExistentes && citasExistentes.length > 0 ? citasExistentes[0] : null;

        let fCitaStr = datos.fecha_cita;
        const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (!fCitaStr || !regexFecha.test(fCitaStr)) {
          const diaDefecto = new Date();
          diaDefecto.setDate(diaDefecto.getDate() + 1);
          fCitaStr = diaDefecto.toISOString().split("T")[0];
        }

        if (!citaExistente) {
          const nombreParaCita = datos.nombre_alumno || prosExist.nombre_alumno || prosExist.nombre || nombrePerfil || "Prospecto";
          const insertCita = {
            prospecto_id: prosExist.id,
            fecha: fCitaStr,
            hora: datos.hora_cita || "16:00",
            tipo: "Inscripci├│n / Sesi├│n Informativa",
            estado: "pendiente"
          };
          console.log("­ƒôà Creando cita oficial:", insertCita);
          const { error: insErr } = await supabase.from("citas").insert(insertCita);
        if (insErr) {
          console.error("ÔØî Error insertando cita:", insErr.message);
        } else {
          await supabase
            .from("prospectos")
            .update({ estado: "agendado", lead_score: "CALIENTE" })
          }
        } else {
          if (datos.fecha_cita || datos.hora_cita) {
          const updateCita = {
            fecha:
              datos.fecha_cita && regexFecha.test(datos.fecha_cita)
                ? datos.fecha_cita
                : citaExistente.fecha,
            hora: datos.hora_cita || citaExistente.hora,
          };
          console.log("­ƒôà Actualizando cita existente:", updateCita);
          await supabase
            .from("citas")
            .update(updateCita)
            .eq("id", citaExistente.id);
          await supabase
            .from("prospectos")
            .update({ lead_score: "CALIENTE" })
            .eq("id", prosExist.id);
        }
      }
    }

      // --- NOTIFICACI├ôN AL ADMINISTRADOR ---
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (adminPhone) {
        const nombreFinal =
          prosExist.nombre_alumno ||
          datos.nombre_alumno ||
          prosExist.nombre ||
          nombrePerfil ||
          "Alumno";
        const cursoFinal =
          prosExist.curso_interes || datos.curso_interes || "Por definir";
        const nivelFinal = prosExist.nivel || datos.nivel || "No especificado";

        const msgAdmin =
          `­ƒÅ½ *┬íNUEVA CITA AGENDADA EN TES!* ­ƒÅ½\n\n` +
          `­ƒæñ *Alumno:* ${nombreFinal}\n` +
          `­ƒôà *Fecha:* ${fCitaStr}\n` +
          `ÔÅ░ *Hora:* ${datos.hora_cita || "16:00"}\n` +
          `­ƒôÜ *Curso:* ${cursoFinal}\n` +
          `­ƒôè *Nivel:* ${nivelFinal}\n\n` +
          `­ƒöù *Ver en Citas:* https://erp-total-english.vercel.app/citas`;

        console.log("­ƒôó Notificaci├│n WhatsApp Admin desactivada temporalmente");
        // await enviarRespuesta(adminPhone, msgAdmin);

        // Notificaci├│n por Email (Modo Seguro para Resend)
        try {
          const emailAdmin = process.env.ADMIN_EMAIL || "admin@tes.edu";
          console.log("­ƒôº Notificando cita por email a (PAUSADO TEMPORALMENTE):", emailAdmin);
          /*
          await notificarCitaAdmin({
            adminEmail: emailAdmin,
            nombreAlumno: nombreFinal,
            fecha: fCitaStr,
            hora: datos.hora_cita || "16:00",
            curso: cursoFinal,
            nivel: nivelFinal,
          });
          */
        } catch (eMailErr) {
          console.error("ÔØî Error enviando email de cita:", eMailErr);
        }
      }
    }

    // 7. Enviar a Meta con Pausas y Simulaci├│n de Escritura
    let imagenUrl = null;
    if (datos && datos.imagen && datos.imagen !== "null") {
      if (datos.imagen.startsWith("http")) {
        imagenUrl = datos.imagen;
      } else if (datos.imagen.match(/^\d+_[a-z0-9]+\.(jpg|jpeg|png|webp)$/i)) {
        // Es una imagen subida a Supabase (ej: 1777318424424_u3oqz.jpeg) pero guardada sin URL completa
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hngcvuoyfkkrqdazbivv.supabase.co"; // fallback seguro si es necesario
        imagenUrl = `${supabaseUrl}/storage/v1/object/public/recursos/${datos.imagen}`;
      } else {
        // Dominio de producci├│n - Im├ígenes est├íticas (ej: CHILDREN.jpg)
        const origin = process.env.NEXT_PUBLIC_BASE_URL || "https://erp-total-english.vercel.app";
        imagenUrl = `${origin}/cursos/${datos.imagen.replace(/^\//, '')}`;
      }
      console.log("­ƒû╝´©Å Imagen URL construida:", imagenUrl);
    }

    // Preparar opciones (sanitizar)
    const opcionesLimpias =
      opciones && Array.isArray(opciones) && opciones.length > 0
        ? opciones
            .map((o) => o.replace(/["\[\]]/g, "").trim())
            .filter((o) => o !== "" && !o.toLowerCase().includes("opcional"))
        : null;

    // 8. PREPARAR IMAGEN (Solo en recomendaci├│n de curso)
    let imgUrl = null;
    let respuestaLimpia = respuesta;
    if (respuestaLimpia) {
      respuestaLimpia = respuestaLimpia.replace(/\\n/g, '\n');
      // Limpiar texto residual de opciones/botones que la IA pueda haber incluido
      respuestaLimpia = respuestaLimpia.replace(/\*?\(?JSON opciones:.*?\)\*?/gi, '');
      respuestaLimpia = respuestaLimpia.replace(/┬┐Qu├® prefieres\??\s*­ƒæç?\s*$/gm, '');
      respuestaLimpia = respuestaLimpia.replace(/\n\n+$/g, '');
      respuestaLimpia = respuestaLimpia.trim();
    }
    try {
      if (
        intencion === "COURSE_RECOMMENDED" &&
        datos?.imagen &&
        datos.imagen !== "null" &&
        datos.imagen !== "..." &&
        datos.imagen !== "Desconocido"
      ) {
        imgUrl = imagenUrl;
      }
    } catch (imgErr) {
      console.error("ÔØî Error preparando imagen:", imgErr.message);
    }

    // 8. ENVIAR TEXTO E IMAGEN (L├│gica agrupada)
    console.log("­ƒôñ [8/10] Enviando respuesta ÔÇö plataforma:", plataforma, "| tieneImagen:", !!imgUrl, "| respuesta:", respuesta?.substring(0, 80));
    try {
      if (imgUrl) {
        console.log("­ƒû╝´©Å [8/10] FLUJO CON IMAGEN ÔÇö URL:", imgUrl);
        // L├ôGICA CON IMAGEN: Enviar recomendaci├│n como pie de foto (caption)
        const partesRespuesta = respuestaLimpia
          .split("\n\n")
          .filter((p) => p.trim() !== "");

        let textoIntro = "";
        let textoCaption = "";
        let textoCierre = "";

        // Caso 3 partes: Intro (Perm├¡teme...) | Caption (Imagen) | Cierre (Pregunta final)
        if (
          partesRespuesta.length >= 3 &&
          (partesRespuesta[0].toLowerCase().includes("momento") || 
           partesRespuesta[0].toLowerCase().includes("perm├¡teme"))
        ) {
          textoIntro = partesRespuesta[0];
          textoCaption = partesRespuesta[1];
          textoCierre = partesRespuesta.slice(2).join("\n\n");
        } 
        // Caso 2 partes: Intro | Caption
        else if (
          partesRespuesta.length > 0 &&
          (partesRespuesta[0].toLowerCase().includes("momento") || 
           partesRespuesta[0].toLowerCase().includes("perm├¡teme"))
        ) {
          textoIntro = partesRespuesta[0];
          textoCaption = partesRespuesta.slice(1).join("\n\n");
        } else {
          textoCaption = respuestaLimpia;
        }

        // Enviar "Un momento..." como texto separado si existe
        if (textoIntro) {
          // Guardar en DB primero
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: textoIntro,
            tipo: "texto",
          });
          // Luego enviar por Meta
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(1500);
            const introOk = await enviarRespuesta(remitenteId, textoIntro);
            console.log("­ƒôñ [8/10] Intro enviada:", introOk ? "OK" : "FALL├ô");
          } catch (e) {
            console.error("ÔØî [8/10] Error enviando intro:", e.message);
          }
        }

        if (imgUrl) {
          // 1. Guardar imagen en DB (sin texto, mensaje independiente)
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: "[Imagen del programa]",
            tipo: "imagen",
            url_archivo: imgUrl,
          });
          // Enviar imagen por Meta (SIN caption)
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(1500);
            const imgOk = await enviarRespuesta(remitenteId, null, imgUrl);
            console.log("­ƒû╝´©Å [8/10] Imagen enviada por Meta (separada):", imgOk ? "OK" : "FALL├ô");
          } catch (e) {
            console.error("ÔØî [8/10] Error enviando imagen:", e.message);
          }
        }

        if (textoCaption) {
          // 2. Guardar texto en DB (despu├®s de la imagen)
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: textoCaption,
            tipo: "texto",
          });
          // Enviar texto por Meta (separado de la imagen)
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(2000);
            const txtOk = await enviarRespuesta(remitenteId, textoCaption);
            console.log("­ƒôñ [8/10] Texto descriptivo enviado:", txtOk ? "OK" : "FALL├ô");
          } catch (e) {
            console.error("ÔØî [8/10] Error enviando texto:", e.message);
          }
        }

        // Si hay texto de cierre (opcional, si se separ├│ en 3 partes), se env├¡a al final
        if (typeof textoCierre === 'string' && textoCierre.trim()) {
          try {
            await supabase.from("mensajes").insert({
              conversacion_id: convExist.id,
              remitente: "bot",
              contenido: textoCierre.trim(),
              tipo: "texto",
            });
            await sleep(1500);
            await enviarRespuesta(remitenteId, textoCierre);
          } catch (e) {
            console.error("ÔØî [8/10] Error enviando cierre:", e.message);
          }
        }

        // Enviar botones despu├®s de la imagen+texto (si hay opciones)
        if (opcionesLimpias) {
          try {
            await supabase.from("mensajes").insert({
              conversacion_id: convExist.id,
              remitente: "bot",
              contenido: opcionesLimpias.map(o => "ÔÇó " + o).join("\n"),
              tipo: "texto",
            });
            await sleep(1000);
            await enviarRespuesta(remitenteId, "Elige una opci├│n:", null, opcionesLimpias);
          } catch (e) {
            console.error("ÔØî [8/10] Error enviando opciones:", e.message);
          }
        }
      } else {
        // L├ôGICA DE ENV├ìO (Basada en la petici├│n del usuario: separar lugar de preguntas)
        const partesRespuesta = respuestaLimpia
          .split("\n\n")
          .filter((p) => p.trim() !== "");
        
        let ultimaRespuesta = "";
        for (let i = 0; i < partesRespuesta.length; i++) {
          const burbuja = partesRespuesta[i].trim();
          if (!burbuja) continue;

          // Guardar en DB
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: burbuja,
            tipo: "texto"
          });
          ultimaRespuesta = burbuja;

          // Enviar por Meta
          await marcarEscribiendoWrapper(remitenteId);
          const delay = Math.min(Math.max(burbuja.length * 10, 800), 2500);
          await sleep(delay);
          
          const esUltima = i === partesRespuesta.length - 1;
          if (esUltima && opcionesLimpias) {
            await enviarRespuesta(remitenteId, burbuja, null, opcionesLimpias);
          } else {
            await enviarRespuesta(remitenteId, burbuja);
          }
        }

        // Actualizar conversaci├│n
        await supabase
          .from("conversaciones")
          .update({ ultimo_mensaje: ultimaRespuesta.substring(0, 200) })
          .eq("id", convExist.id);
      }
    } catch (txtErr) {
      console.error("ÔØî [8/10] Error en el flujo de mensajes:", txtErr.message, txtErr.stack);
    }

    // Actualizar ultimo_mensaje final (para flujos con imagen)
    if (imgUrl) {
      await supabase
        .from("conversaciones")
        .update({ ultimo_mensaje: respuestaLimpia.substring(0, 200) })
        .eq("id", convExist.id);
    }
    return NextResponse.json({ estado: "procesado" }, { status: 200 });
    
    } finally {
      // SIEMPRE liberar el lock al terminar (├®xito, pausa humano, o aborto)
      await releaseLock(convExist.id);
    }
  } catch (error) {
    console.error("ÔØî [FATAL] Error Webhook:", error.message);
    console.error("ÔØî [FATAL] Stack:", error.stack);
    return NextResponse.json({ error: "Error interno" }, { status: 200 });
  }
}




async function obtenerNombrePerfilMeta(id, plataforma) {
  try {
    const token = process.env.META_PAGE_TOKEN;
    if (!token || !id || id.length < 5) return "Prospecto";
    const campos = plataforma === "messenger" ? "first_name,last_name" : "name,username";
    const url = `https://graph.facebook.com/v20.0/${id}?fields=${campos}&access_token=${token}`;
    
    try {
      const res = await axios.get(url);
      if (res.data) {
        if (plataforma === "messenger") {
          return `${res.data.first_name || ""} ${res.data.last_name || ""}`.trim() || "Prospecto";
        } else {
          const name = res.data.name;
          const username = res.data.username;
          if (name && username && name.toLowerCase() !== username.toLowerCase()) {
             return `${name} (@${username})`;
          } else if (username) {
             return `@${username}`;
          } else if (name) {
             return name;
          }
        }
      }
    } catch (e1) {
      // Fallback para Instagram si falla con username
      if (plataforma === "instagram") {
        const urlFallback = `https://graph.facebook.com/v20.0/${id}?fields=name&access_token=${token}`;
        const resFallback = await axios.get(urlFallback);
        if (resFallback.data?.name) return resFallback.data.name;
      } else {
        throw e1;
      }
    }
  } catch (e) {
    // Si sigue fallando, simplemente retornamos Prospecto y no hacemos ruido
    const errMsg = e.response?.data?.error?.message || e.message;
    if (!errMsg.includes('IGSID not found')) {
      console.warn(`ÔÜá´©Å Aviso: No se pudo obtener perfil de Meta para ${id} (${plataforma}):`, errMsg);
    }
  }
  return "Prospecto";
}

async function marcarEscribiendoMetaAPI(to, plataforma, receptorOriginal = "me") {
  try {
    if (plataforma === "whatsapp") {
      const token = process.env.META_WHATSAPP_TOKEN;
      const phoneId = process.env.META_PHONE_NUMBER_ID;
      const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
      if (!token || !phoneId) return;
      await axios.post(
        url,
        { messaging_product: "whatsapp", recipient_type: "individual", to: to, sender_action: "typing_on" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } else if (plataforma === "messenger") {
      const token = process.env.META_PAGE_TOKEN;
      const url = `https://graph.facebook.com/v20.0/me/messages`;
      if (!token) return;
      await axios.post(
        url,
        { recipient: { id: to }, sender_action: "typing_on" },
        { params: { access_token: token } }
      );
    } else if (plataforma === "instagram") {
      // Desactivamos typing_on para Instagram temporalmente para evitar error de scope
      return;
    }
  } catch (e) {
    console.error("ÔØî Error marcarEscribiendoMetaAPI:", e.response?.data?.error?.message || e.message);
  }
}

async function enviarMensajeMessenger(to, mensaje, imagen, opciones, receptorOriginal) {
  try {
    const token = process.env.META_PAGE_TOKEN;
    const url = `https://graph.facebook.com/v20.0/me/messages`;
    
    console.log(`­ƒÜÇ [PRE-SEND MS] Sender (Pagina): ${receptorOriginal} | Recipient: ${to} | Endpoint: ${url} | Token: ${token ? token.substring(0, 15) + '...' : 'MISSING'}`);

    let payload = { 
      recipient: { id: String(to) }, 
      messaging_type: "RESPONSE",
      message: {} 
    };

    if (imagen) {
      payload.message.attachment = {
        type: "image",
        payload: { url: imagen, is_reusable: true }
      };
      if (mensaje) {
          await axios.post(url, payload, { params: { access_token: token } });
          payload.message = { text: mensaje };
          delete payload.message.attachment;
      }
    } else if (opciones && opciones.length > 0) {
      payload.message = {
        text: (mensaje || "┬┐Qu├® prefieres?").substring(0, 1000),
        quick_replies: opciones.slice(0, 13).map((opt) => ({
          content_type: "text",
          title: opt.substring(0, 20),
          payload: opt.substring(0, 1000)
        }))
      };
    } else {
      payload.message = { text: mensaje };
    }

    await axios.post(url, payload, { params: { access_token: token } });
    console.log(`Ô£à Mensaje de Meta enviado con ├®xito a ${to} en messenger`);
    return true;
  } catch (error) {
    console.error(`ÔØî ERROR META API (messenger) al enviar a ${to}:`, JSON.stringify(error.response?.data || error.message, null, 2));
    return false;
  }
}

async function enviarMensajeInstagram(to, mensaje, imagen, receptorOriginal) {
  try {
    const token = process.env.META_PAGE_TOKEN;
    const url = `https://graph.facebook.com/v20.0/me/messages`;
    
    console.log(`­ƒÜÇ [PRE-SEND IG] Sender (Pagina): ${receptorOriginal} | Recipient: ${to} | Endpoint: ${url} | Token: ${token ? token.substring(0, 15) + '...' : 'MISSING'}`);
    
    let payload = { 
      recipient: { id: String(to) },
      message: {} 
    };

    if (imagen) {
      payload.message.attachment = {
        type: "image",
        payload: { url: imagen }
      };
      if (mensaje) {
          await axios.post(url, payload, { params: { access_token: token } });
          payload.message = { text: mensaje };
          delete payload.message.attachment;
      }
    } else {
      payload.message = { text: mensaje };
    }

    await axios.post(url, payload, { params: { access_token: token } });
    console.log(`Ô£à Mensaje de Meta enviado con ├®xito a ${to} en instagram`);
    return true;
  } catch (error) {
    console.error(`ÔØî ERROR META API (instagram) al enviar a ${to}:`, JSON.stringify(error.response?.data || error.message, null, 2));
    return false;
  }
}

async function enviarMensajeMetaAPI(to, mensaje, imagen = null, opciones = null, plataforma = "whatsapp", receptorOriginal = "me") {
  if (plataforma === "whatsapp") {
    try {
      const token = process.env.META_WHATSAPP_TOKEN;
      const phoneId = process.env.META_PHONE_NUMBER_ID;
      const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
      let payload = { messaging_product: "whatsapp", to: to };
      
      if (imagen) {
        payload.type = "image";
        payload.image = { link: imagen, caption: mensaje || undefined };
      } else if (opciones && opciones.length > 0) {
        payload.type = "interactive";
        payload.interactive = {
          type: "button",
          body: { text: (mensaje || "┬┐Qu├® prefieres?").substring(0, 1024) },
          action: {
            buttons: opciones.slice(0, 3).map((opt, i) => ({
              type: "reply",
              reply: { id: `btn_${i}`, title: opt.substring(0, 20) },
            })),
          },
        };
      } else {
        payload.type = "text";
        payload.text = { body: mensaje };
      }

      await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      return true;
    } catch (e) {
      console.error(`ÔØî ERROR META API (whatsapp) al enviar a ${to}:`, e.message);
      return false;
    }
  } else if (plataforma === "messenger") {
    return await enviarMensajeMessenger(to, mensaje, imagen, opciones, receptorOriginal);
  } else if (plataforma === "instagram") {
    return await enviarMensajeInstagram(to, mensaje, imagen, receptorOriginal);
  }
}

// Vercel build fix - Clean version 1.0
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { consultarAlex } from "@/lib/alexIA";
import { escalarAHumano } from "@/lib/prospectoSync";
import { notificarEscalamientoAdmin, notificarCitaAdmin } from "@/lib/mailer";
import axios from "axios";

export async function GET(solicitud) {
  const { searchParams } = new URL(solicitud.url);
  const modo = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const desafio = searchParams.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new Response(desafio, { status: 200 });
  }
  return NextResponse.json({ error: "Verificación fallida" }, { status: 403 });
}
export async function POST(solicitud) {
  try {
    const cuerpo = await solicitud.json();

    console.log("📥 [1/10] WEBHOOK RECIBIDO — object:", cuerpo.object, "| entry count:", cuerpo.entry?.length || 0);
    // Log del payload completo para diagnóstico (solo en caso de IG/Messenger)
    if (cuerpo.object === "page" || cuerpo.object === "instagram") {
      console.log("📥 [1/10] PAYLOAD COMPLETO (IG/MSG):", JSON.stringify(cuerpo, null, 2));
    }

    let plataforma = null;
    let remitenteId = null;
    let texto = "";
    let nombrePerfil = "Prospecto";
    let mensajeId = null;
    let vieneDeAnuncio = false;

    if (cuerpo.object === "whatsapp_business_account") {
      const entrada = cuerpo.entry?.[0];
      const cambios = entrada?.changes?.[0];
      const valor = cambios?.value;

      if (valor?.messages && valor.messages.length > 0) {
        plataforma = "whatsapp";
        const msj = valor.messages[0];
        remitenteId = msj.from;

        // Normalización para México (521 -> 52)
        if (remitenteId.startsWith("521") && remitenteId.length === 13) {
          remitenteId = "52" + remitenteId.substring(3);
        }

        nombrePerfil = valor.contacts?.[0]?.profile?.name || "Prospecto";
        mensajeId = msj.id;
        vieneDeAnuncio = !!msj.referral;

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
      console.log("📥 [2/10] IG/MSG — entry.id:", entrada?.id, "| messaging count:", entrada?.messaging?.length || 0);
      if (entrada?.messaging && entrada.messaging.length > 0) {
        const evento = entrada.messaging[0];
        console.log("📥 [2/10] Evento:", JSON.stringify({
          sender: evento.sender?.id,
          recipient: evento.recipient?.id,
          hasMessage: !!evento.message,
          isEcho: evento.message?.is_echo,
          text: evento.message?.text,
          mid: evento.message?.mid,
          hasAttachments: !!evento.message?.attachments,
          hasPostback: !!evento.postback
        }));
        if (evento.message && !evento.message.is_echo) {
          plataforma = cuerpo.object === "page" ? "messenger" : "instagram";
          remitenteId = String(evento.sender.id);
          mensajeId = evento.message.mid;
          texto = evento.message.text || "";

          if (evento.message.quick_reply) {
            texto = evento.message.quick_reply.payload || texto;
          } else if (evento.message.attachments) {
            texto = texto || "[Archivo adjunto]";
          }
          console.log("✅ [2/10] Parseado OK — plataforma:", plataforma, "| remitenteId:", remitenteId, "| texto:", texto.substring(0, 50), "| mid:", mensajeId);
        } else {
          console.log("⏭️ [2/10] Mensaje ignorado — is_echo:", evento.message?.is_echo, "| no message:", !evento.message);
        }
      } else if (entrada?.changes && entrada.changes.length > 0) {
        // Soporte para el botón de "Probar" en Meta for Developers
        const valor = entrada.changes[0].value;
        if (valor && valor.message) {
          plataforma = cuerpo.object === "page" ? "messenger" : "instagram";
          remitenteId = String(valor.sender.id);
          // Meta siempre envía "random_mid", lo forzamos a ser único para que no lo bloquee el filtro anti-duplicados
          mensajeId = (valor.message.mid === "random_mid") ? "test_mid_" + Date.now() : (valor.message.mid || "test_mid_" + Date.now());
          texto = valor.message.text || "Mensaje de prueba";
          console.log("✅ [2/10] Parseado TEST OK — plataforma:", plataforma, "| remitenteId:", remitenteId, "| texto:", texto);
        }
      } else {
        console.log("⏭️ [2/10] Sin array messaging ni changes — evento ignorado");
      }
    }

    if (!plataforma || (!texto && !vieneDeAnuncio)) {
      console.log("⏭️ [3/10] IGNORADO — plataforma:", plataforma, "| texto:", texto ? texto.substring(0, 30) : "(vacío)", "| vieneDeAnuncio:", vieneDeAnuncio);
      return NextResponse.json(
        { estado: "ignorado_o_no_soportado" },
        { status: 200 },
      );
    }

    remitenteId = String(remitenteId);
    console.log("✅ [3/10] MENSAJE ACEPTADO — plataforma:", plataforma, "| remitente:", remitenteId, "| texto:", texto.substring(0, 80));

    if (plataforma === "messenger" || plataforma === "instagram") {
      const nombreMeta = await obtenerNombrePerfilMeta(remitenteId, plataforma);
      if (nombreMeta && nombreMeta !== "Prospecto") {
        nombrePerfil = nombreMeta;
        console.log("👤 Nombre extraído de Meta API:", nombrePerfil);
      }
    }

    let enviarRespuesta = async (to, mensaje, imagen = null, opciones = null) => {
      return await enviarMensajeMetaAPI(to, mensaje, imagen, opciones, plataforma);
    };

    let marcarEscribiendoWrapper = async (to) => {
      return await marcarEscribiendoMetaAPI(to, plataforma);
    };

    // === PASO 0: JITTER PARA EVITAR RACE CONDITIONS ===
    // Webhooks concurrentes se separan por un tiempo aleatorio
    await sleep(Math.floor(Math.random() * 2000));

    // === PASO 1: OBTENER CONVERSACIÓN ÚNICA ===
    const variantesId = remitenteId.startsWith("52")
      ? [remitenteId, remitenteId.replace("52", "521")]
      : [remitenteId];

    console.log(`🔍 [4/10] Procesando conversación para ${remitenteId}...`);
    
    let { data: todasConvs } = await supabase
      .from("conversaciones")
      .select("id")
      .in("id_plataforma", variantesId)
      .eq("plataforma", plataforma);

    let convExist = null;
    if (todasConvs && todasConvs.length > 0) {
      convExist = todasConvs[0];
      console.log(`✅ [4/10] Conversación encontrada: ${convExist.id}`);
    } else {
      console.log(`🆕 [4/10] Creando nueva conversación...`);
      const { data: nuevaC, error: errNuevaC } = await supabase.from("conversaciones").insert({
        plataforma,
        id_plataforma: remitenteId,
        nombre_contacto: nombrePerfil !== "Prospecto" ? nombrePerfil : null
      }).select("id").maybeSingle();
      
      if (errNuevaC) console.error("❌ Error creando conv:", errNuevaC.message);

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

    // === PASO 2: BATALLA POR EL MENSAJE (LOCK DISTRIBUIDO) ===
    console.log(`⚔️ [5/10] Insertando mensaje para batalla: ${mensajeId}`);
    const { data: nuevoMsg, error: errMsg } = await supabase.from("mensajes").insert({
      conversacion_id: convExist.id,
      remitente: "usuario",
      contenido: texto,
      id_mensaje_meta: mensajeId,
      tipo: "texto"
    }).select("id").maybeSingle();

    if (errMsg) {
      if (errMsg.code === "23505" || errMsg.message?.includes("duplicate")) {
        console.log("⏭️ [5/10] Bloqueo por Constraint UNIQUE (Mensaje ya existe)");
        return NextResponse.json({ estado: "ya_procesado" }, { status: 200 });
      }
      console.error("❌ Error insertando mensaje:", errMsg.message);
    }

    await sleep(500);
    const { data: misMsgs } = await supabase
      .from("mensajes")
      .select("id")
      .eq("id_mensaje_meta", mensajeId)
      .order("creado_en", { ascending: true });

    if (misMsgs && misMsgs.length > 1 && nuevoMsg && misMsgs[0].id !== nuevoMsg.id) {
      await supabase.from("mensajes").delete().eq("id", nuevoMsg.id);
      return NextResponse.json({ estado: "ya_procesado" }, { status: 200 });
    }

    console.log(`🏆 [WINNER] Ejecución oficial para: ${mensajeId}`);

    // Actualizar nombre si es necesario
    if (nombrePerfil && nombrePerfil !== "Prospecto") {
      await supabase.from("conversaciones").update({ nombre_contacto: nombrePerfil }).eq("id", convExist.id);
    }

    // Buscar prospecto real
    const { data: convFull } = await supabase.from("conversaciones").select("*, prospectos(*)").eq("id", convExist.id).single();
    let prosExist = convFull?.prospectos || null;
    
    if (!prosExist) {
      const { data: pTel } = await supabase.from("prospectos").select("*").eq("telefono", remitenteId).maybeSingle();
      if (pTel) {
        prosExist = pTel;
        await supabase.from("conversaciones").update({ prospecto_id: pTel.id }).eq("id", convExist.id);
      }
    }

    // --- PAUSA DE BOT: SI ESTÁ ASIGNADO A HUMANO, NO CONSULTA A ALEXIA ---
    if (convExist.asignado_a_humano) {
      console.log(
        `⏸️ [7/10] Chatbot PAUSADO para ${remitenteId} (plataforma: ${plataforma}). Mensaje guardado en Inbox.`,
      );
      return NextResponse.json({ estado: "pausado_humano" }, { status: 200 });
    }
    console.log("🤖 [7/10] Bot ACTIVO — consultando AlexIA para", remitenteId, "en", plataforma);

    // --- SE ELIMINÓ LA PAUSA AUTOMÁTICA AQUÍ ---
    // Ahora permitimos que la IA analice si el usuario solo está agradeciendo
    // o haciendo más preguntas después de agendar.
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

    // --- DETECCIÓN DE TRANSICIÓN AGENTE → BOT ---
    // Analizamos el historial para detectar si hubo intervención humana reciente
    // y construir un resumen de handover para que Alex retome sin confusión.
    const historialCronologico = (historialRaw || []).slice().reverse();

    let huboIntervencionHumana = false;
    let resumenHandover = "";

    // Buscar bloques de mensajes del agente humano
    const mensajesAgente = historialCronologico.filter(
      (m) => m.remitente === "humano" || m.remitente === "agente",
    );
    if (mensajesAgente.length > 0) {
      huboIntervencionHumana = true;

      // Encontrar el índice del último mensaje del agente
      const ultimoIdxAgente = historialCronologico.findLastIndex(
        (m) => m.remitente === "humano" || m.remitente === "agente",
      );

      // Extraer la "sesión humana": desde el primer msg de agente hasta el último
      const primerIdxAgente = historialCronologico.findIndex(
        (m) => m.remitente === "humano" || m.remitente === "agente",
      );
      const sesionHumana = historialCronologico.slice(
        primerIdxAgente,
        ultimoIdxAgente + 1,
      );

      // Construir resumen legible de lo que el agente habló con el cliente
      const lineasResumen = sesionHumana
        .map((m) => {
          if (m.remitente === "humano" || m.remitente === "agente") {
            return `  ASESOR dijo: "${m.contenido}"`;
          }
          return `  CLIENTE respondió: "${m.contenido}"`;
        })
        .join("\n");

      // Mensajes del usuario DESPUÉS de la última intervención del agente
      // (estos son los que el bot necesita atender ahora)
      const mensajesPendientes = historialCronologico
        .slice(ultimoIdxAgente + 1)
        .filter((m) => m.remitente === "usuario");
      const pendientesTexto =
        mensajesPendientes.length > 0
          ? mensajesPendientes.map((m) => `  - "${m.contenido}"`).join("\n")
          : "  (Ninguno — este es el primer mensaje del cliente tras la reactivación del bot)";

      resumenHandover = `
🔄 RESUMEN DE TRANSICIÓN AGENTE → BOT:
Un asesor humano tomó el control de esta conversación y ya habló con el cliente.
Aquí está TODO lo que se dijo durante la intervención humana:

${lineasResumen}

MENSAJES DEL CLIENTE PENDIENTES DE RESPUESTA (después de que el agente terminó):
${pendientesTexto}

INSTRUCCIONES CRÍTICAS PARA TI (ALEX):
1. NO saludes como si fuera la primera vez. El cliente ya estuvo hablando con un asesor.
2. LEE cuidadosamente lo que el asesor ya habló y acordó con el cliente.
3. Continúa la conversación desde el PUNTO EXACTO donde el asesor la dejó.
4. Si el asesor ya resolvió el tema, pregunta amablemente si hay algo más en lo que puedas ayudar.
5. Si el asesor dejó algo pendiente (ej: "te confirmo mañana"), reconócelo y ofrece ayuda adicional.
6. NUNCA repitas información que el asesor ya proporcionó.
7. Tu tono debe ser de continuidad natural: "¡Hola de nuevo! Veo que mi compañero ya te atendió..."
`;
    }

    const historialFormat = historialCronologico.map((m) => {
      if (m.remitente === "usuario") {
        return { role: "user", content: m.contenido };
      }
      // Distinguir entre bot, agente humano y seguimientos automáticos
      if (m.remitente === "humano" || m.remitente === "agente") {
        return {
          role: "assistant",
          content: `[MENSAJE DEL ASESOR HUMANO]: ${m.contenido}`,
        };
      }
      // Marcar mensajes de seguimiento automático para que la IA no los confunda con respuestas reales
      if (
        m.id_mensaje_meta &&
        String(m.id_mensaje_meta).startsWith("seguimiento_auto")
      ) {
        return {
          role: "assistant",
          content: `[SEGUIMIENTO AUTOMÁTICO]: ${m.contenido}`,
        };
      }
      return { role: "assistant", content: m.contenido };
    });

    // OBTENER CITAS PRÓXIMAS PARA EVITAR CONFLICTOS
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

    const contextoCrm = `CONTEXTO ACTUAL DEL PROSPECTO:
        Fecha de Hoy: ${fechaActualTexto}
        Nombre Alumno: ${freshPros.nombre_alumno || freshPros.nombre || "Desconocido"}
        Edad: ${freshPros.edad || "Desconocida"}
        Categoría: ${freshPros.categoria_edad || "Desconocida"}
        Nivel: ${freshPros.nivel || "Desconocido"}
        Horario: ${freshPros.horario || "Desconocido"}
        Curso de Interés: ${freshPros.curso_interes || "Desconocido"}
        
        CITAS OCUPADAS (NO AGENDAR AQUÍ):
        ${listaCitas || "No hay citas agendadas aún."}

        IMPORTANTE: Si ya conoces estos datos, NO los preguntes de nuevo. Solo avanza al siguiente paso del flujo.
        
        ${huboIntervencionHumana ? resumenHandover : ""}
        
        TRANSICIÓN AGENTE-BOT: En el historial verás mensajes marcados como [MENSAJE DEL ASESOR HUMANO]. Esto significa que un asesor humano intervino en la conversación. Debes:
        1. Leer TODOS los mensajes del asesor para entender qué ya se habló y qué se acordó.
        2. NO repetir información que el asesor ya proporcionó.
        3. Continuar la conversación desde donde el asesor la dejó, de forma natural.
        4. Si el asesor ya cerró el tema o agendó algo, simplemente pregunta si hay algo más en lo que puedas ayudar.
        5. Tu primera respuesta tras una transición NUNCA debe ser el mensaje de bienvenida ni reiniciar el perfilamiento.
        
        ${tieneCitaPendiente ? "⚠️ ESTADO ACTUAL: EL PROSPECTO YA TIENE UNA CITA AGENDADA. NO LE OFREZCAS AGENDAR OTRA CITA. SI EL PROSPECTO AGRADECE O DICE OK, SOLO DESPÍDETE AMABLEMENTE Y CIERRA LA CONVERSACIÓN. NO REPITAS EL MENSAJE DE CONFIRMACIÓN DE CITA." : ""}`;

    // OBTENER CURSOS REALES DE LA BASE DE DATOS
    const { data: cursosDb } = await supabase.from("cursos").select("*");
    let tablaDinamicaCursos = "NO HAY CURSOS";
    if (cursosDb && cursosDb.length > 0) {
      tablaDinamicaCursos = cursosDb
        .map(
          (c) => `
🎓 CURSO: ${c.nombre}
   Descripción: ${c.descripcion || "Sin descripción"}
   Beneficios (Para usar en tu frase espejo): ${c.beneficios || "Generales"}
   Para Edad/Nivel: ${c.nivel || "Todas"}
   Imagen Referencia: ${c.imagen_url || "null"}
   Inversión Ancla: ${c.precio ? "$" + c.precio : "A Consultar con Asesor"}
          `,
        )
        .join("\n\n");
    }

    // Obtener configuración del bot (horarios, brechas) y citas existentes para evitar cruces
    let configBot = null;
    let citasExistentes = [];

    const { data: cnf } = await supabase
      .from("configuracion_bot")
      .select("*")
      .eq("id", 1)
      .single();
    if (cnf) configBot = cnf;

    // Consultar citas de los próximos 7 días para que la IA sepa qué está ocupado
    if (citasFuturasData) citasExistentes = citasFuturasData;

    const contextoCrmPlus = `${contextoCrm}\n\n## CITAS OCUPADAS ACTUALMENTE:\n${
      citasExistentes.length > 0
        ? citasExistentes.map((c) => `- ${c.fecha} a las ${c.hora}`).join("\n")
        : "No hay citas agendadas aún, todos los horarios están libres."
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

    // Evitar bucles - comparar con los últimos 2 mensajes del bot
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
        `⚠️ Respuesta repetida detectada para ${remitenteId}. Reformulando...`,
      );
      // En vez de ignorar, enviamos un mensaje genérico de avance
      const respuestaAlternativa =
        "¡Gracias por tu respuesta! 😊 ¿Me puedes dar un poco más de detalle para poder ayudarte mejor?";
      await supabase.from("mensajes").insert({
        conversacion_id: convExist.id,
        remitente: "bot",
        contenido: respuestaAlternativa,
        tipo: "texto",
      });
      await enviarRespuesta(remitenteId, respuestaAlternativa);
      return NextResponse.json({ estado: "reformulado" }, { status: 200 });
    }

    console.log(`🤖 AlexIA (${remitenteId}):`, { intencion, datos });

    if (
      intencion === "SPECIFIC_QUESTION_PASS_AGENT" ||
      intencion === "TRANSFER_HUMANO"
    ) {
      console.log(`🚨 Escalamiento a humano para ${remitenteId}`);
      const motivo =
        datos?.escalation_reason ||
        "Usuario solicitó hablar con un asesor o hizo pregunta compleja";
      const categoria = datos?.escalation_category || "pregunta_especifica";
      await escalarAHumano(convExist.id, prosExist.id, motivo, categoria);

      const msjEscalamiento =
        "Voy a transferir tu solicitud ahora mismo con uno de nuestros asesores.\n\nRevisará tu caso para darte una respuesta personalizada en unos momentos.\n\nUn asesor se pondrá en contacto contigo a la brevedad por este medio para darte seguimiento puntual. ¡Gracias por tu paciencia!";

      await enviarRespuesta(remitenteId, msjEscalamiento);
      // Dividir por saltos de línea para simular el envío de varios mensajes
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
          `🚨 *¡SE REQUIERE UN ASESOR HUMANO!* 🚨\n\n` +
          `👤 *Prospecto:* ${prosExist?.nombre_alumno || prosExist?.nombre || nombrePerfil || "Desconocido"}\n` +
          `📞 *Teléfono:* ${remitenteId}\n` +
          `💬 *Motivo:* El usuario ha solicitado ayuda o el bot no pudo responder.\n\n` +
          `🔗 *Ver en Inbox:* https://erp-total-english.vercel.app/inbox`;

        console.log("📢 Notificación WhatsApp Admin desactivada temporalmente");
        // await enviarRespuesta(adminPhone, msgAdminEscalamiento);
      }

      // Notificación por correo con Resend
      try {
        const adminEmail = process.env.ADMIN_EMAIL || "admin@tes.edu";
        console.log("📧 Notificando por email (PAUSADO TEMPORALMENTE):", adminEmail);
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
          console.log("📧 Resultado de notificación email:", resEmail);
        } else {
          console.warn(
            "⚠️ No se encontró email de administrador para enviar alerta de escalamiento.",
          );
        }
        */
      } catch (e) {
        console.error("❌ Error enviando notificación de correo:", e);
      }

      return NextResponse.json({ estado: "escalado" }, { status: 200 });
    }
    // --------------------------------------------

    // 5. Actualizar CRM o Crear Prospecto si ya hay datos suficientes
    if (datos && Object.keys(datos).length > 0) {
      try {
        if (!prosExist) {
          // Crear Prospecto solo si tenemos datos mínimos (Edad, Nivel o Horario)
          if (
            datos.edad ||
            datos.nivel ||
            datos.horario ||
            datos.nombre_alumno
          ) {
            const { data: nuevoP } = await supabase
              .from("prospectos")
              .insert({
                nombre: datos.nombre || nombrePerfil || "Interesado",
                nombre_alumno: datos.nombre_alumno || null,
                telefono: remitenteId,
                edad: datos.edad ? parseInt(datos.edad) : null,
                nivel: datos.nivel || null,
                horario: datos.horario || null,
                curso_interes: datos.curso_interes || null,
                estado: "nuevo",
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

          const { error: crmError } = await supabase
            .from("prospectos")
            .update(updateData)
            .eq("id", prosExist.id);
          if (crmError)
            console.error("Error actualizando prospecto:", crmError.message);
        }
      } catch (errSync) {
        console.error("❌ Error fatal en sync CRM:", errSync.message);
      }
    }

    // 5b. GUARDAR NOMBRE DEL ALUMNO (Forzado durante agendamiento)
    if (
      prosExist &&
      (intencion === "SCHEDULING_DATE" || intencion === "CIERRE_CITA")
    ) {
      const isInvalidN = (n) =>
        !n ||
        ["...", "desconocido", "n/a", "null", "usuario", ""].includes(
          String(n).toLowerCase().trim(),
        );

      // Intentar obtener el nombre: 1) del JSON de la IA, 2) del mensaje del usuario (cuando respondió a "¿Cuál es tu nombre?")
      let nombreFinal = datos.nombre_alumno;

      if (isInvalidN(nombreFinal) && intencion === "SCHEDULING_DATE") {
        // Si la IA no extrajo el nombre, el texto del usuario ES el nombre (acaba de responder a la pregunta del nombre)
        const textoLimpio = texto.trim();
        // Validar que parece un nombre (2-5 palabras, sin números, sin URLs)
        if (
          textoLimpio &&
          textoLimpio.split(/\s+/).length <= 5 &&
          !/\d/.test(textoLimpio) &&
          !textoLimpio.includes("http")
        ) {
          nombreFinal = textoLimpio;
        }
      }

      // También buscar en el prospecto existente por si ya se guardó antes
      if (isInvalidN(nombreFinal) && prosExist.nombre_alumno) {
        nombreFinal = prosExist.nombre_alumno;
      }

      if (nombreFinal && !isInvalidN(nombreFinal)) {
        console.log("📌 Guardando nombre_alumno:", nombreFinal);
        await supabase
          .from("prospectos")
          .update({ nombre_alumno: nombreFinal })
          .eq("id", prosExist.id);
        prosExist.nombre_alumno = nombreFinal;
      }
    }

    // 6. Lógica de Citas (Si la intención es CIERRE_CITA)
    if (intencion === "CIERRE_CITA" && prosExist) {
      const { data: citasExistentes } = await supabase
        .from("citas")
        .select("id, fecha, hora")
        .eq("prospecto_id", prosExist.id)
        .eq("estado", "pendiente")
        .order("creado_en", { ascending: false })
        .limit(1);

      const citaExistente =
        citasExistentes && citasExistentes.length > 0
          ? citasExistentes[0]
          : null;

      let fCitaStr = datos.fecha_cita;
      const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
      if (!fCitaStr || !regexFecha.test(fCitaStr)) {
        const diaDefecto = new Date();
        diaDefecto.setDate(diaDefecto.getDate() + 1);
        fCitaStr = diaDefecto.toISOString().split("T")[0];
      }

      if (!citaExistente) {
        const insertCita = {
          prospecto_id: prosExist.id,
          fecha: fCitaStr,
          hora: datos.hora_cita || "16:00",
          tipo: "Inscripción / Sesión Informativa",
          estado: "pendiente",
        };
        console.log("📅 Creando cita oficial:", insertCita);
        const { error: insErr } = await supabase
          .from("citas")
          .insert(insertCita);
        if (insErr) {
          console.error("❌ Error insertando cita:", insErr.message);
        } else {
          await supabase
            .from("prospectos")
            .update({ estado: "agendado", lead_score: "CALIENTE" })
            .eq("id", prosExist.id);
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
          console.log("📅 Actualizando cita existente:", updateCita);
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

      // --- NOTIFICACIÓN AL ADMINISTRADOR ---
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
          `🏫 *¡NUEVA CITA AGENDADA EN TES!* 🏫\n\n` +
          `👤 *Alumno:* ${nombreFinal}\n` +
          `📅 *Fecha:* ${fCitaStr}\n` +
          `⏰ *Hora:* ${datos.hora_cita || "16:00"}\n` +
          `📚 *Curso:* ${cursoFinal}\n` +
          `📊 *Nivel:* ${nivelFinal}\n\n` +
          `🔗 *Ver en Citas:* https://erp-total-english.vercel.app/citas`;

        console.log("📢 Notificación WhatsApp Admin desactivada temporalmente");
        // await enviarRespuesta(adminPhone, msgAdmin);

        // Notificación por Email (Modo Seguro para Resend)
        try {
          const emailAdmin = process.env.ADMIN_EMAIL || "admin@tes.edu";
          console.log("📧 Notificando cita por email a (PAUSADO TEMPORALMENTE):", emailAdmin);
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
          console.error("❌ Error enviando email de cita:", eMailErr);
        }
      }
    }

    // 7. Enviar a Meta con Pausas y Simulación de Escritura
    let imagenUrl = null;
    if (datos && datos.imagen && datos.imagen !== "null") {
      if (datos.imagen.startsWith("http")) {
        imagenUrl = datos.imagen;
      } else {
        // Dominio de producción - Meta necesita una URL pública accesible
        const origin =
          process.env.NEXT_PUBLIC_BASE_URL ||
          "https://erp-total-english.vercel.app";
        imagenUrl = `${origin}/cursos/${datos.imagen}`;
      }
      console.log("🖼️ Imagen URL construida:", imagenUrl);
    }

    // Preparar opciones (sanitizar)
    const opcionesLimpias =
      opciones && Array.isArray(opciones) && opciones.length > 0
        ? opciones
            .map((o) => o.replace(/["\[\]]/g, "").trim())
            .filter((o) => o !== "" && !o.toLowerCase().includes("opcional"))
        : null;

    // 8. PREPARAR IMAGEN (Solo en recomendación de curso)
    let imgUrl = null;
    try {
      if (
        intencion === "COURSE_RECOMMENDED" &&
        datos?.imagen &&
        datos.imagen !== "null" &&
        datos.imagen !== "..." &&
        datos.imagen !== "Desconocido"
      ) {
        imgUrl = await obtenerImagenCDN(datos.imagen);
      }
    } catch (imgErr) {
      console.error("❌ Error preparando imagen:", imgErr.message);
    }

    // 8. ENVIAR TEXTO E IMAGEN (Lógica agrupada)
    console.log("📤 [8/10] Enviando respuesta — plataforma:", plataforma, "| tieneImagen:", !!imgUrl, "| respuesta:", respuesta?.substring(0, 80));
    try {
      if (imgUrl) {
        console.log("🖼️ [8/10] FLUJO CON IMAGEN — URL:", imgUrl);
        // LÓGICA CON IMAGEN: Enviar recomendación como pie de foto (caption)
        const partesRespuesta = respuesta
          .split("\n\n")
          .filter((p) => p.trim() !== "");

        let textoIntro = "";
        let textoCaption = "";

        if (
          partesRespuesta.length > 0 &&
          partesRespuesta[0].toLowerCase().includes("momento")
        ) {
          textoIntro = partesRespuesta[0];
          textoCaption = partesRespuesta.slice(1).join("\n\n");
        } else {
          textoCaption = respuesta;
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
            console.log("📤 [8/10] Intro enviada:", introOk ? "OK" : "FALLÓ");
          } catch (e) {
            console.error("❌ [8/10] Error enviando intro:", e.message);
          }
        }

        const limiteCaption = 1000;

        if (textoCaption && textoCaption.length > limiteCaption) {
          // 1. Guardar imagen en DB
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: "[Imagen enviada]",
            tipo: "imagen",
            url_archivo: imgUrl,
          });
          // Enviar imagen por Meta
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(2000);
            const imgOk = await enviarRespuesta(remitenteId, null, imgUrl);
            console.log("🖼️ [8/10] Imagen enviada por Meta:", imgOk ? "OK" : "FALLÓ");
          } catch (e) {
            console.error("❌ [8/10] Error enviando imagen:", e.message);
          }

          // 2. Guardar texto en DB
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: textoCaption,
            tipo: "texto",
          });
          // Enviar texto por Meta
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(1500);
            const txtOk = await enviarRespuesta(remitenteId, textoCaption);
            console.log("📤 [8/10] Texto largo enviado:", txtOk ? "OK" : "FALLÓ");
          } catch (e) {
            console.error("❌ [8/10] Error enviando texto:", e.message);
          }
        } else {
          // Guardar imagen+caption en DB
          await supabase.from("mensajes").insert({
            conversacion_id: convExist.id,
            remitente: "bot",
            contenido: "[Imagen] " + (textoCaption || ""),
            tipo: "imagen",
            url_archivo: imgUrl,
          });
          // Enviar por Meta
          try {
            await marcarEscribiendoWrapper(remitenteId);
            await sleep(2000);
            const imgOk = await enviarRespuesta(remitenteId, textoCaption || null, imgUrl);
            console.log("🖼️ [8/10] Imagen+caption enviada:", imgOk ? "OK" : "FALLÓ");
          } catch (e) {
            console.error("❌ [8/10] Error enviando imagen+caption:", e.message);
          }
        }

        // Si hay botones, enviarlos como mensaje separado DESPUÉS de la imagen
        if (opcionesLimpias) {
          try {
            await sleep(1000);
            await enviarRespuesta(remitenteId, "¿Qué prefieres? 👇", null, opcionesLimpias);
          } catch (e) {
            console.error("❌ [8/10] Error enviando opciones:", e.message);
          }
        }
      } else {
        // LÓGICA DE ENVÍO (Basada en la petición del usuario: separar lugar de preguntas)
        const partesRespuesta = respuesta
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

        // Actualizar conversación
        await supabase
          .from("conversaciones")
          .update({ ultimo_mensaje: ultimaRespuesta.substring(0, 200) })
          .eq("id", convExist.id);
      }
    } catch (txtErr) {
      console.error("❌ [8/10] Error en el flujo de mensajes:", txtErr.message, txtErr.stack);
    }

    // Actualizar ultimo_mensaje final (para flujos con imagen)
    if (imgUrl) {
      await supabase
        .from("conversaciones")
        .update({ ultimo_mensaje: respuesta.substring(0, 200) })
        .eq("id", convExist.id);
    }
    return NextResponse.json({ estado: "procesado" }, { status: 200 });
  } catch (error) {
    console.error("❌ [FATAL] Error Webhook:", error.message);
    console.error("❌ [FATAL] Stack:", error.stack);
    return NextResponse.json({ error: "Error interno" }, { status: 200 });
  }
}

// Helper para asegurar que las imágenes se sirvan desde una URL 100% estable y sin bloqueos de red
async function obtenerImagenCDN(nombreArchivo) {
  if (
    !nombreArchivo ||
    nombreArchivo.trim() === "null" ||
    nombreArchivo.trim() === "..."
  )
    return null;

  const archivoLimpio = nombreArchivo.trim();
  
  // Intentar desde el repo actual del proyecto
  const githubCDN = `https://raw.githubusercontent.com/iainnomind-cpu/Chatbot-TES/main/public/cursos/${archivoLimpio}`;
  
  console.log("🖼️ URL imagen CDN:", githubCDN);
  return githubCDN;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function obtenerNombrePerfilMeta(id, plataforma) {
  try {
    const token = process.env.META_PAGE_TOKEN;
    if (!token || !id || id.length < 5) return "Prospecto";
    const campos = plataforma === "messenger" ? "first_name,last_name" : "name";
    const url = `https://graph.facebook.com/v20.0/${id}?fields=${campos}&access_token=${token}`;
    const res = await axios.get(url);
    if (res.data) {
      if (plataforma === "messenger") {
        return `${res.data.first_name || ""} ${res.data.last_name || ""}`.trim() || "Prospecto";
      } else {
        return res.data.name || "Prospecto";
      }
    }
  } catch (e) {
    console.error("❌ Error obteniendo perfil de Meta:", e.response?.data?.error?.message || e.message);
  }
  return "Prospecto";
}

async function marcarEscribiendoMetaAPI(to, plataforma) {
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
    } else if (plataforma === "messenger" || plataforma === "instagram") {
      const token = process.env.META_PAGE_TOKEN;
      const url = `https://graph.facebook.com/v20.0/me/messages`;
      if (!token) return;
      await axios.post(
        url,
        { recipient: { id: to }, sender_action: "typing_on" },
        { params: { access_token: token } }
      );
    }
  } catch (e) {
    console.error("❌ Error marcarEscribiendoMetaAPI:", e.response?.data || e.message);
  }
}

async function enviarMensajeMetaAPI(to, mensaje, imagen = null, opciones = null, plataforma = "whatsapp") {
  try {
    if (plataforma === "whatsapp") {
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
          body: { text: (mensaje || "¿Qué prefieres?").substring(0, 1024) },
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
    } else if (plataforma === "messenger" || plataforma === "instagram") {
      const token = process.env.META_PAGE_TOKEN;
      const url = `https://graph.facebook.com/v20.0/me/messages`;
      let payload = { recipient: { id: to }, message: {} };

      if (imagen) {
        payload.message.attachment = {
          type: "image",
          payload: { url: imagen, is_reusable: true }
        };
        // Meta doesn't support caption inside attachment for messenger easily, so send text separately if needed.
        if (mensaje) {
            // First send image, then we'll send text in a second request
            await axios.post(url, payload, { params: { access_token: token } });
            payload.message = { text: mensaje };
            delete payload.message.attachment;
        }
      } else if (opciones && opciones.length > 0) {
        payload.message = {
          text: (mensaje || "¿Qué prefieres?").substring(0, 1000),
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
      return true;
    }
  } catch (error) {
    console.error(`❌ ERROR META API (${plataforma}):`, error.response?.data || error.message);
    return false;
  }
}

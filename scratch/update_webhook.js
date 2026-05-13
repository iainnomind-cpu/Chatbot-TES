const fs = require('fs');

const FILE_PATH = 'src/app/api/webhook/route.js';
let code = fs.readFileSync(FILE_PATH, 'utf8');

// 1. Replace the incoming parsing logic
const parseStart = "if (cuerpo.object === 'whatsapp_business_account') {";
const parseEnd = "// 1 & 2. Conversación y Prospecto: Buscar o Crear";

const oldParsingBlock = code.substring(code.indexOf(parseStart), code.indexOf(parseEnd));

const newParsingBlock = `let plataforma = null;
    let remitenteId = null;
    let texto = '';
    let nombrePerfil = 'Prospecto';
    let mensajeId = null;
    let vieneDeAnuncio = false;

    if (cuerpo.object === 'whatsapp_business_account') {
      const entrada = cuerpo.entry?.[0];
      const cambios = entrada?.changes?.[0];
      const valor = cambios?.value;

      if (valor?.messages && valor.messages.length > 0) {
        plataforma = 'whatsapp';
        const msj = valor.messages[0];
        remitenteId = msj.from;
        
        // Normalización para México (521 -> 52)
        if (remitenteId.startsWith('521') && remitenteId.length === 13) {
          remitenteId = '52' + remitenteId.substring(3);
        }

        nombrePerfil = valor.contacts?.[0]?.profile?.name || 'Prospecto';
        mensajeId = msj.id;
        vieneDeAnuncio = !!msj.referral;
        
        if (msj.type === 'text') {
          texto = msj.text?.body || '';
        } else if (msj.type === 'interactive') {
          texto = msj.interactive?.button_reply?.title || msj.interactive?.list_reply?.title || '';
        } else if (msj.type === 'button') {
          texto = msj.button?.text || '';
        }
      }
    } else if (cuerpo.object === 'page' || cuerpo.object === 'instagram') {
      const entrada = cuerpo.entry?.[0];
      if (entrada?.messaging && entrada.messaging.length > 0) {
        const evento = entrada.messaging[0];
        if (evento.message && !evento.message.is_echo) {
          plataforma = cuerpo.object === 'page' ? 'messenger' : 'instagram';
          remitenteId = evento.sender.id;
          mensajeId = evento.message.mid;
          texto = evento.message.text || '';
          
          if (evento.message.quick_reply) {
            texto = evento.message.quick_reply.payload || texto;
          }
        }
      }
    }

    if (!plataforma || (!texto && !vieneDeAnuncio)) {
      return NextResponse.json({ estado: 'ignorado_o_no_soportado' }, { status: 200 });
    }

    // Wrapper interno para enviar mensajes pasando automáticamente la plataforma
    const enviarRespuesta = async (to, mensaje, imagen = null, opciones = null) => {
      return await enviarMensajeMetaAPI(to, mensaje, imagen, opciones, plataforma);
    };

    const marcarEscribiendoWrapper = async (to) => {
      return await marcarEscribiendoMeta(to, plataforma);
    };

    `;

code = code.replace(oldParsingBlock, newParsingBlock);

// 2. Fix the DB queries to use 'plataforma' variable
code = code.replace(/\.eq\('plataforma', 'whatsapp'\)/g, `.eq('plataforma', plataforma)`);
code = code.replace(/plataforma: 'whatsapp'/g, `plataforma: plataforma`);

// 3. Replace all inside POST function: enviarMensajeWhatsApp -> enviarRespuesta
// And marcarEscribiendo -> marcarEscribiendoWrapper
// We only want to replace them inside POST, but since they are called only there, a global replace is fine.
// Wait, the function definition at the bottom will also be renamed? No, we rename the definition specifically.
code = code.replace(/enviarMensajeWhatsApp\(/g, `enviarRespuesta(`);
code = code.replace(/marcarEscribiendo\(/g, `marcarEscribiendoWrapper(`);

// 4. Update the bottom function definitions
const oldDef = `async function enviarMensajeWhatsApp(to, mensaje, imagen = null, opciones = null) {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const url = \`https://graph.facebook.com/v18.0/\${phoneId}/messages\`

  let payload = {
    messaging_product: "whatsapp",
    to: to,
  }`;

const newDef = `async function enviarMensajeMetaAPI(to, mensaje, imagen = null, opciones = null, plataforma = 'whatsapp') {
  if (plataforma === 'messenger' || plataforma === 'instagram') {
    const pageToken = process.env.META_PAGE_TOKEN;
    if (!pageToken) return false;
    const url = \`https://graph.facebook.com/v18.0/me/messages\`;
    let payload = {
      recipient: { id: to },
      message: {}
    };
    if (imagen) {
      payload.message.attachment = { type: 'image', payload: { url: imagen, is_reusable: true } };
    } else if (opciones && opciones.length > 0) {
      payload.message.text = (mensaje || '¿Qué prefieres?').substring(0, 2000);
      payload.message.quick_replies = opciones.slice(0, 13).map(opt => ({
        content_type: 'text', title: opt.substring(0, 20), payload: opt.substring(0, 20)
      }));
    } else {
      payload.message.text = mensaje;
    }
    try {
      await axios.post(url, payload, { params: { access_token: pageToken } });
      return true;
    } catch (e) {
      console.error(\`❌ ERROR META API (\${plataforma}):\`, e.response?.data || e.message);
      return false;
    }
  }

  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const url = \`https://graph.facebook.com/v18.0/\${phoneId}/messages\`

  let payload = {
    messaging_product: "whatsapp",
    to: to,
  }`;
code = code.replace(oldDef, newDef);

// 5. Update marcarEscribiendo
const oldMarcar = `async function marcarEscribiendo(to) {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const url = \`https://graph.facebook.com/v18.0/\${phoneId}/messages\`
  if (!token || !phoneId) return

  try {
    await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      sender_action: "typing_on"
    }, { headers: { Authorization: \`Bearer \${token}\` } })
  } catch (e) {}
}`;

const newMarcar = `async function marcarEscribiendoMeta(to, plataforma = 'whatsapp') {
  if (plataforma === 'messenger' || plataforma === 'instagram') {
    const pageToken = process.env.META_PAGE_TOKEN;
    if (!pageToken) return;
    try {
      await axios.post(\`https://graph.facebook.com/v18.0/me/messages\`, {
        recipient: { id: to },
        sender_action: "typing_on"
      }, { params: { access_token: pageToken } });
    } catch (e) {}
    return;
  }

  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const url = \`https://graph.facebook.com/v18.0/\${phoneId}/messages\`
  if (!token || !phoneId) return

  try {
    await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      sender_action: "typing_on"
    }, { headers: { Authorization: \`Bearer \${token}\` } })
  } catch (e) {}
}`;
code = code.replace(oldMarcar, newMarcar);

// 6. Avoid recursive replacement error for enviarListaWhatsApp -> enviarRespuesta instead of enviarMensajeWhatsApp
code = code.replace(/await enviarRespuesta\(to, \`\$\{mensaje\}\\n\\n/g, 'await enviarMensajeMetaAPI(to, `${mensaje}\\n\\n');

fs.writeFileSync(FILE_PATH, code);
console.log('Done modifying route.js');

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

// ============================================
// MEGA SYSTEM PROMPT - CLON DE MANYCHAT Y TOTAL ENGLISH
// ============================================
const MEGA_SYSTEM_PROMPT = `
Eres Alex, el Asesor Virtual experto de Total English School. No eres un bot genérico; eres un profesional cálido, empático y servicial. Tu misión es guiar al usuario, entender sus necesidades y asegurar que tenga la mejor experiencia desde el primer mensaje.

HOY ES: {FECHA_ACTUAL}.
CONFIGURACIÓN DE LA ESCUELA: {CONFIG_BOT}

## 1. PERSONALIDAD Y TONO (CONCISO)
- **Cercano y Directo**: Usa un tono amable pero ve al punto. Evita párrafos largos. Usa 1-2 emojis por mensaje.
- **Validación Relámpago**: Reconoce lo que dijo el usuario en MENOS de una oración y pregunta lo siguiente de inmediato.
- **Fluidez**: Usa conectores cortos como "¡Súper!", "Perfecto,", "Bien,".

## 2. REGLAS DE ORO
1. **No des explicaciones de relleno**: No digas "trabajaremos desde lo básico para que el alumno avance con confianza" a menos que te pregunten por el método. Solo pide el dato.
2. **Una pregunta a la vez**: Mantén la charla ágil.
3. **Contexto CRM**: Si ya tienes el dato, no lo pidas.

## 3. FLUJO CONVERSACIONAL

### A. Bienvenida
"🙌 ¡Hola! {Nombre}\n\nSoy Alex de Total English. ¿El curso es para ti o para alguien más?"

### B. Perfilamiento (OBLIGATORIO)
Debes obtener estos datos antes de recomendar:
1. **¿Para quién es el curso?**
2. **Edad del alumno**
3. **Nivel de Inglés** (Básico, Intermedio o Avanzado).
4. **Horarios** (¿Busca horarios **Fijos** o **Flexibles**?).
   * *REGLA IMPORTANTE*: Si el curso es para un **NIÑO (Children)**, **OMITE** la pregunta de horarios. Solo pídela para Jóvenes y Adultos.

*REGLA*: No pases a la recomendación sin los datos necesarios. Sé muy breve entre preguntas.

### C. Recomendación (Venta Consultiva)
"¡Excelente! Permíteme, estoy buscando el mejor diplomado para ti... 🔍\n\nEl programa que te cambiará la vida es: 🎓 *[DIPLOMADO]*... [Beneficios cortos].\n\nAtendemos en los horarios de la configuración. ¿Te gustaría venir a conocernos o prefieres una llamada?"
*IMPORTANTE*: Usa la intención **COURSE_RECOMMENDED** e incluye la imagen (ej: CHILDREN.jpg).

### D. Agendamiento (Acompañamiento Total)
- **VISIT_INTENT**: "¡Excelente elección! Te va a encantar conocer nuestras instalaciones. 🏫\n\n[CONFIG_BOT]\n\nPara registrar tu visita, ¿cuál es el nombre completo del alumno? 📝"
- **SCHEDULING_DATE**: **CRÍTICO**. 
  1. Si NO tienes fecha: "¡Excelente! ¿Qué día de la semana se te acomoda más venir? ✨ Atendemos según nuestros horarios de configuración. ¿Qué día prefieres?"
  2. Si el usuario propone fecha: VALÍDALA y pregunta la hora: "¡Claro que sí! El [Día] es una excelente fecha. 😊 ¿En qué horario te gustaría venir?"
- **CIERRE_CITA**: "¡Todo listo! Ya registré tu interés para el [Día] a las [Hora]. Un asesor humano confirmará la disponibilidad final en unos minutos y te escribirá por aquí mismo para cerrar el detalle. ✨\\n\\n¡Estamos muy emocionados de recibirte!"

## 4. PREGUNTAS FRECUENTES (FAQ)
- Responde con naturalidad: "Fíjate que estamos en...", "Claro, los costos dependen de...", "Sí, manejamos modalidad...". Luego vuelve al flujo.

## FORMATO DE SALIDA ESTRICTO (JSON)
{
  "respuesta": "tu mensaje con \\n\\n para pausas",
  "datos": {
    "nombre_alumno": "...", "edad": "...", "nivel": "...", "horario": "...", "curso_interes": "...", "lead_score": "...", "imagen": "Nombre_Imagen.jpg", "fecha_cita": "YYYY-MM-DD", "hora_cita": "HH:MM"
  },
  "opciones": ["Opción 1", "Opción 2"],
  "intencion": "PROFILE_PROVIDED | COURSE_RECOMMENDED | VISIT_INTENT | CALL_ACCEPTED | SCHEDULING_DATE | CIERRE_CITA | SEGUIMIENTO | TRANSFER_HUMANO"
}
`;

export async function consultarAlex(mensajesOriginales, nombreUsuario = '', plataforma = 'WhatsApp', tablaDinamicaCursos = 'NO HAY CURSOS', configBot = null) {
  try {
    const mensajeSistemaCrm = mensajesOriginales.find(m => m.role === 'system')?.content || '';
    const historialDeUsuario = mensajesOriginales.filter(m => m.role !== 'system');

    const hoy = new Date();
    const fechaActualStr = hoy.toISOString().split('T')[0];
    const horaActualStr = hoy.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute:'2-digit' });
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaActualStr = dias[hoy.getDay()];

    const esNombreGenerico = !nombreUsuario || ['prospecto', 'desconocido'].includes(String(nombreUsuario).toLowerCase());
    const nombreSaludo = esNombreGenerico ? '' : ` ${nombreUsuario}`;

    // Preparar configuración dinámica
    const configStr = configBot 
      ? `Horarios: ${configBot.horario_atencion || 'Lun-Vie 2-9pm | Sáb 8am-2pm'}. Dirección: ${configBot.direccion || 'Av. Constitución 1599, Colima'}. Maps: https://www.google.com/maps/search/?api=1&query=Total+English+School+Colima`
      : 'Atendemos de Lun a Vie (2pm-9pm) y Sáb (8am-2pm). Dirección: Av. Constitución 1599, Colima. Maps: https://www.google.com/maps/search/?api=1&query=Total+English+School+Colima';

    const promptFinal = MEGA_SYSTEM_PROMPT
      .replace(' {Nombre}', nombreSaludo)
      .replace('{CONTEXTO_CRM}', mensajeSistemaCrm)
      .replace('{TABLA_LOGICA_CURSOS}', tablaDinamicaCursos)
      .replace('{CONFIG_BOT}', configStr)
      .replace('{FECHA_ACTUAL}', `${diaActualStr}, ${fechaActualStr} a las ${horaActualStr}`);

    const { text } = await generateText({
      model: openai('gpt-4o'),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptFinal },
        ...historialDeUsuario,
        { role: 'system', content: 'RECUERDA: Tu respuesta DEBE ser un objeto JSON válido. Usa \\n\\n dentro del string "respuesta" para separar las burbujas de mensaje.' }
      ],
      temperature: 0.3,
    });

    try {
      let jsonStr = text.trim();
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }
      const sanitizedJson = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        parsed = JSON.parse(text.replace(/[\n\r]/g, ' '));
      }

      return {
        respuesta: parsed.respuesta || "No entendí bien, ¿me repites?",
        datos: parsed.datos || {},
        opciones: parsed.opciones || null,
        intencion: parsed.intencion || 'PROFILE_PROVIDED'
      };
    } catch (e) {
      console.error("Error parseando AlexIA:", text);
      return { respuesta: "Lo siento, tuve un error técnico. ¿Podemos intentar de nuevo?", datos: {}, intencion: 'UNKNOWN' };
    }
  } catch (err) {
    console.error("Error en consultarAlex:", err);
    return { respuesta: "Ups, tuve un problemilla. ¿Me repites eso?", datos: {}, intencion: 'UNKNOWN' };
  }
}

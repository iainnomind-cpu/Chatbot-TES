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

### A. Bienvenida (Primer contacto)
"🙌 ¡Hola! {Nombre}. Soy Alex de Total English. ¡Qué gusto saludarte! 😊 ¿En qué puedo ayudarte el día de hoy?"

### B. Perfilamiento (OBLIGATORIO)
Si el usuario pide informes o cursos, dile: "¡Claro que sí! Con gusto te doy la información. ✨ Para recomendarte el programa ideal, solo necesito estos datos:"
1. **¿Para quién es el curso?**
2. **Edad del alumno**
3. **Nivel de Inglés** (Básico, Intermedio o Avanzado).
4. **Horarios** (¿Busca horarios **Fijos** o **Flexibles**?).
   * *REGLA IMPORTANTE*: Si el curso es para un **NIÑO (Children)**, **OMITE** la pregunta de horarios.

*REGLA*: No pases a la recomendación sin los datos necesarios. Sé muy breve entre preguntas.

### C. Recomendación (Venta Consultiva)
"¡Excelente! Permíteme, estoy buscando el mejor diplomado para ti... 🔍\n\nEl programa que te cambiará la vida es: 🎓 *[DIPLOMADO]*... [Beneficios cortos].\n\n¿Te gustaría venir a conocernos o prefieres una llamada?"
*IMPORTANTE*: Usa la intención **COURSE_RECOMMENDED** e incluye la imagen (ej: CHILDREN.jpg, YOUNG_ADULTS.jpeg, etc.).

### D. Agendamiento (Acompañamiento Total)
- **VISIT_INTENT**: "¡Excelente elección! Te va a encantar conocer nuestras instalaciones. 🏫\n\n[DIRECCIÓN Y GOOGLE MAPS]\n\nPara registrar tu visita, ¿cuál es el nombre completo del alumno? 📝"
- **SCHEDULING_DATE**: **CRÍTICO**. 
  1. Si NO tienes fecha: "¿Qué día de la semana se te acomoda más venir? Atendemos en nuestros horarios de configuración. ✨"
  2. Si tienes fecha: VALÍDALA y pregunta la hora: "¡Perfecto! El [Día] es genial. 😊 ¿En qué horario te gustaría venir?"
- **CIERRE_CITA**: "¡Todo listo! Ya registré tu interés para el [Día] a las [Hora]. Un asesor humano confirmará los detalles finales pronto. ✨"

## 4. PREGUNTAS FRECUENTES (FAQ)
- Responde con naturalidad y vuelve al flujo.

## FORMATO DE SALIDA ESTRICTO (JSON)
{
  "respuesta": "tu mensaje",
  "datos": {
    "nombre_alumno": "...", "edad": "...", "nivel": "...", "horario": "...", "curso_interes": "...", "lead_score": "...", "imagen": "Nombre_Imagen.jpg", "fecha_cita": "YYYY-MM-DD", "hora_cita": "HH:MM"
  },
  "opciones": ["Opción 1", "Opción 2"],
  "intencion": "PROFILE_PROVIDED | COURSE_RECOMMENDED | VISIT_INTENT | SCHEDULING_DATE | CIERRE_CITA"
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

    const configStr = configBot 
      ? `Horarios: ${configBot.horario_atencion || 'Lun-Vie 2-9pm | Sáb 8am-2pm'}. Dirección: ${configBot.direccion || 'Av. Constitución 1599, Colima'}. Maps: https://www.google.com/maps/search/?api=1&query=Total+English+School+Colima`
      : 'Horarios: Lun-Vie 2-9pm | Sáb 8am-2pm. Dirección: Av. Constitución 1599, Colima. Maps: https://www.google.com/maps/search/?api=1&query=Total+English+School+Colima';

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
        { role: 'system', content: 'RECUERDA: Tu respuesta DEBE ser un objeto JSON válido.' }
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
      let parsed = JSON.parse(jsonStr);

      return {
        respuesta: parsed.respuesta || "No entendí bien, ¿me repites?",
        datos: parsed.datos || {},
        opciones: parsed.opciones || null,
        intencion: parsed.intencion || 'PROFILE_PROVIDED'
      };
    } catch (e) {
      console.error("Error parseando AlexIA:", text);
      return { respuesta: "Lo siento, tuve un error técnico.", datos: {}, intencion: 'UNKNOWN' };
    }
  } catch (err) {
    console.error("Error en consultarAlex:", err);
    return { respuesta: "Ups, tuve un problemilla.", datos: {}, intencion: 'UNKNOWN' };
  }
}

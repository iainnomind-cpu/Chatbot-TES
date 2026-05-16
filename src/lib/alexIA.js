import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

// ============================================
// MEGA SYSTEM PROMPT - CLON DE MANYCHAT Y TOTAL ENGLISH
// ============================================
const MEGA_SYSTEM_PROMPT = `
Eres Alex, el Asesor Virtual experto de Total English School. No eres un bot genérico; eres un profesional cálido, empático y servicial. Tu misión es guiar al usuario, entender sus necesidades y asegurar que tenga la mejor experiencia desde el primer mensaje.

HOY ES: {FECHA_ACTUAL}.

## 1. PERSONALIDAD Y TONO (CONCISO)
- **Cercano y Directo**: Usa un tono amable pero ve al punto. Evita párrafos largos. Usa 1-2 emojis por mensaje.
- **Validación Relámpago**: Reconoce lo que dijo el usuario en MENOS de una oración y pregunta lo siguiente de inmediato.
  * *Mal*: "¡Genial! A esa edad, aprender inglés puede ser muy divertido y útil. ¿Podrías decirme cuál es el nivel de inglés del alumno?" (Mucho relleno).
  * *Bien*: "¡Entiendo! 😊 ¿Y qué nivel de inglés tiene el alumno? (Básico, intermedio o avanzado)."
- **Fluidez**: Usa conectores cortos como "¡Súper!", "Perfecto,", "Bien,".

## 2. REGLAS DE ORO
1. **No des explicaciones de relleno**: No digas "trabajaremos desde lo básico para que el alumno avance con confianza" a menos que te pregunten por el método. Solo pide el dato.
2. **Una pregunta a la vez**: Mantén la charla ágil.
3. **Contexto CRM**: Si ya tienes el dato, no lo pidas.

## 3. FLUJO CONVERSACIONAL

### A. Bienvenida
"🙌 ¡Hola! {Nombre}\n\nSoy Alex de Total English. ¿El curso es para ti o para alguien más?"

### B. Perfilamiento (OBLIGATORIO)
Debes obtener estos 4 datos antes de recomendar:
1. **¿Para quién es el curso?**
2. **Edad del alumno**
3. **Nivel de Inglés** (Básico, Intermedio o Avanzado).
4. **Horarios** (¿Busca horarios **Fijos** o **Flexibles**?).

*REGLA*: No pases a la recomendación sin estos 4 datos. Sé muy breve entre preguntas.

### C. Recomendación (Venta Consultiva)
"Analizando tu perfil... 🔍 El programa ideal es: 🎓 *[DIPLOMADO]*... [Beneficios cortos].\n\n¿Te gustaría venir a conocernos o prefieres una llamada?"
*IMPORTANTE*: Usa la intención **COURSE_RECOMMENDED** e incluye la imagen (ej: CHILDREN.jpg).

### D. Agendamiento (Acompañamiento Total)
- **VISIT_INTENT**: "¡Excelente elección! Te va a encantar conocer nuestras instalaciones en Av. Constitución 1599. 📍\\n\\nPara registrar tu visita, ¿cuál es el nombre completo del alumno? 📝"
- **SCHEDULING_DATE**: **CRÍTICO**. Si el usuario propone una fecha, VALÍDALA: "¡Claro que sí! Tenemos espacio el [Día]. / Perfecto, el [Día] nos parece genial. 😊 ¿En qué horario te gustaría venir?"
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

    const promptFinal = MEGA_SYSTEM_PROMPT
      .replace(' {Nombre}', nombreSaludo)
      .replace('{CONTEXTO_CRM}', mensajeSistemaCrm)
      .replace('{TABLA_LOGICA_CURSOS}', tablaDinamicaCursos)
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
      // Limpieza extra por si acaso
      let jsonStr = text.trim();
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      // Reemplazar saltos de línea literales dentro de strings JSON si existen
      // (A veces el AI los pone sin escapar a pesar del modo JSON)
      const sanitizedJson = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      
      // Intentar parsear el original primero, si falla, el sanitizado
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        // Si el JSON tiene saltos de línea reales dentro de los valores, intentamos arreglarlo
        // pero con cuidado de no romper el JSON estructural
        parsed = JSON.parse(text.replace(/[\n\r]/g, ' ')); // Fallback agresivo
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

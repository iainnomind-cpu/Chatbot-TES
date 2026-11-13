// Batería de conversaciones de prueba contra el modelo real.
// Uso:  npm run probar:alex            (todas)
//       npm run probar:alex -- --solo "Lulu"   (solo las que contengan ese texto)
//       npm run probar:alex -- --ver           (imprime todas las respuestas)
// Requiere OPENAI_API_KEY en .env.local. Cada corrida completa cuesta unos centavos de dólar.

import { consultarAlex } from '../src/lib/alexIA.js'
import { construirTablaCursos } from '../src/lib/tablaCursos.js'
import { quitarOfertasFueraDeEdad } from '../src/lib/ofertasCursos.js'
import { cifrasNoAutorizadas, MENSAJE_SIN_DATO } from '../src/lib/guardias.js'

const args = process.argv.slice(2)
const soloIdx = args.indexOf('--solo')
const SOLO = soloIdx > -1 ? (args[soloIdx + 1] || '').toLowerCase() : null
const VER = args.includes('--ver')
const CONCURRENCIA = 3

if (!process.env.OPENAI_API_KEY) {
  console.error('Falta OPENAI_API_KEY. Ejecuta con: node --env-file=.env.local scripts/probar-alex.mjs')
  process.exit(2)
}

// ---------- Cursos de prueba (misma forma que la tabla "cursos" en Supabase) ----------
const BENEFICIOS_NINOS = '𝗜𝗻𝗴𝗹é𝘀 𝗗𝗶𝘃𝗲𝗿𝘁𝗶𝗱𝗼 + 𝗕𝗮𝘀𝗲𝘀 𝗳𝗶𝗿𝗺𝗲𝘀. 🎲 Aprenden jugando. 👩‍🏫 Teachers especializados en niños. 👥 Grupos reducidos. 🎓 Inglés sólido hasta BACHILLERATO. ✅ Sin tareas aburridas. 💰 Inversión: Planes de beca desde $350 MXN semanales.'
const CURSOS = [
  { nombre: 'Children', nivel: 'A1', edad_minima: 6, edad_maxima: 9, beneficios: BENEFICIOS_NINOS, precio_ancla: 'Planes de beca desde $350 MXN semanales', imagen_url: 'CHILDREN.jpg' },
  { nombre: 'Pre-Teens', nivel: 'A1', edad_minima: 10, edad_maxima: 13, beneficios: '🇬🇧 DIPLOMADO PRE-TEENS 🌟 Edades 10 a 13 años. Confianza y seguridad para hablar. 🚀 Nivel similar a escuelas bilingües. 👥 Grupos reducidos. 📈 Nivel de egreso: B1+. 💰 Inversión: Planes de beca desde $350 MXN semanales.', precio_ancla: 'Planes de beca desde $350 MXN semanales', imagen_url: 'PRETEENS.jpg' },
  { nombre: 'Teens', nivel: 'A1', edad_minima: 14, edad_maxima: 17, beneficios: '🇬🇧 DIPLOMADO TEENS 🌟 Edades 14 a 17 años. Inglés para prepa y universidad. 💬 Conversacional. 👥 Grupos reducidos. 📈 Nivel de egreso: B2. 💰 Inversión: Planes de beca desde $390 MXN semanales.', precio_ancla: 'Planes de beca desde $390 MXN semanales', imagen_url: 'TEENS.jpg' },
  { nombre: 'Young Adults', nivel: 'A1', edad_minima: 18, edad_maxima: 25, beneficios: '🎓 DIPLOMADO YOUNG ADULTS. Inglés para la universidad y el primer empleo. Horarios fijos. 💰 Inversión: desde $1,450 mensual.', precio_ancla: 'desde $1,450 mensual', imagen_url: 'YOUNG.jpg' },
  { nombre: 'My Time', nivel: 'Abierto', edad_minima: 18, edad_maxima: 99, beneficios: '⏰ MY TIME: inglés para adultos con horarios flexibles, tú eliges cuándo asistir. Avance a tu ritmo con tutor. 💰 Inversión: desde $1,750 mensual, inscripción GRATIS.', precio_ancla: 'desde $1,750 mensual', imagen_url: 'MYTIME.jpg' },
  { nombre: 'Business English Workshop', nivel: 'A2', es_especial: true, edad_minima: 27, edad_maxima: 99, fecha_inicio_vigencia: '2026-10-02', fecha_fin_vigencia: '2027-01-31', beneficios: 'Business English Workshop es nuestro Curso-Taller de Inglés para Negocios. Está dirigido a personas que ya tienen bases de Inglés y quieren usarlo con mayor seguridad en reuniones, ventas, networking, llamadas, presentaciones y otras situaciones profesionales. El Nivel 1 inicia el sábado 7 de noviembre, de 9:00 am a 12:00 pm, dura 4 meses. La inversión es desde $1,750 mensual y la inscripción es GRATIS. También tenemos opción de 2 pagos de $3,250 y pago total de $5,900, con mayor ahorro. En los planes de 2 pagos y pago total el material está incluido.', precio_ancla: 'desde $1,750 mensual', imagen_url: 'BUSINESS.jpg' },
]
const hoy = new Date().toISOString().split('T')[0]
const TABLA = construirTablaCursos(CURSOS, hoy)

// ---------- Simulación de lo que hace el webhook alrededor de Alex ----------
function contextoCrm(perfil, flujoDiagnostico) {
  return `CONTEXTO ACTUAL DEL PROSPECTO:
        Fecha de Hoy: ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        Nombre Alumno: ${perfil.nombre_alumno || 'Desconocido'}
        Edad: ${perfil.edad || 'Desconocida'}
        Nivel: ${perfil.nivel || 'Desconocido'}
        Horario: ${perfil.horario || 'Desconocido'}
        Curso de Interés: ${perfil.curso_interes || 'Desconocido'}

        CITAS OCUPADAS (NO AGENDAR AQUÍ):
        No hay citas agendadas aún.

        IMPORTANTE: Si ya conoces estos datos, NO los preguntes de nuevo. Solo avanza al siguiente paso del flujo.
        ${flujoDiagnostico ? 'FLUJO_CAMPANA: DIAGNOSTICO' : ''}`
}

const esValido = (v) => v && !['...', 'desconocido', 'n/a', 'null', 'usuario'].includes(String(v).toLowerCase())

async function turno(historial, perfil, flujoDiagnostico) {
  const mensajes = [{ role: 'system', content: contextoCrm(perfil, flujoDiagnostico) }, ...historial]
  const bruto = await consultarAlex(mensajes, 'Prospecto', 'WhatsApp', TABLA, null, flujoDiagnostico)
  const final = { ...bruto, respuesta: (bruto.respuesta || '').replace(/\\n/g, '\n').trim(), guardias: [] }

  // Mismas guardias que el webhook
  const edades = [bruto.datos?.edad, perfil.edad]
  const revisada = quitarOfertasFueraDeEdad(final.respuesta, bruto.opciones, CURSOS, edades)
  if (revisada.quitadas.length) { final.respuesta = revisada.texto; final.opciones = revisada.opciones; final.guardias.push(`oferta quitada: ${revisada.quitadas.join(', ')}`) }
  const cifras = bruto.intencion === 'TRANSFER_HUMANO' ? [] : cifrasNoAutorizadas(final.respuesta, TABLA)
  if (cifras.length) { final.respuesta = MENSAJE_SIN_DATO; final.intencion = 'TRANSFER_HUMANO'; final.opciones = null; final.guardias.push(`cifra retenida: $${cifras.join(', $')}`) }

  // Memoria del CRM como la actualiza el webhook
  const d = bruto.datos || {}
  for (const campo of ['nombre_alumno', 'edad', 'nivel', 'horario', 'curso_interes', 'lead_score']) {
    if (esValido(d[campo])) perfil[campo] = d[campo]
  }
  return { bruto, final }
}

// ---------- Comprobaciones ----------
const SIN_EMOJI = /^[\p{L}\p{N}\p{P}\p{Zs}]*$/u
const COMPROBACIONES = {
  contiene: (r, v) => (v instanceof RegExp ? v.test(r.final.respuesta) : r.final.respuesta.toLowerCase().includes(v.toLowerCase())) || `no contiene ${v}`,
  noContiene: (r, v) => !(v instanceof RegExp ? v.test(r.final.respuesta) : r.final.respuesta.toLowerCase().includes(v.toLowerCase())) || `contiene ${v}`,
  intencion: (r, v) => [].concat(v).includes(r.final.intencion) || `intención ${r.final.intencion}, se esperaba ${[].concat(v).join('|')}`,
  noIntencion: (r, v) => !([].concat(v).includes(r.final.intencion)) || `intención ${r.final.intencion} no debía ocurrir`,
  maxCaracteres: (r, v) => r.final.respuesta.length <= v || `${r.final.respuesta.length} caracteres (máx ${v})`,
  imagen: (r, v) => (!!r.bruto.datos?.imagen && r.bruto.datos.imagen !== 'null') === v || (v ? 'sin imagen' : 'envía imagen'),
  imagenDe: (r, v) => (r.bruto.datos?.imagen || '').toUpperCase().includes(v.toUpperCase()) || `imagen ${r.bruto.datos?.imagen}, se esperaba ${v}`,
  maxPreguntas: (r, v) => (r.final.respuesta.match(/\?/g) || []).length <= v || `${(r.final.respuesta.match(/\?/g) || []).length} preguntas (máx ${v})`,
  sinGuardias: (r) => r.final.guardias.length === 0 || `intervino una guardia: ${r.final.guardias.join('; ')}`,
}
function comprobacionesGlobales(r) {
  const fallos = []
  if (!r.final.respuesta) fallos.push('respuesta vacía')
  if (/undefined|\[object|null,|"respuesta"/i.test(r.final.respuesta)) fallos.push('texto con restos técnicos')
  for (const o of r.final.opciones || []) {
    if (o.length > 20) fallos.push(`botón de ${o.length} caracteres: "${o}"`)
    if (!SIN_EMOJI.test(o)) fallos.push(`botón con emoji: "${o}"`)
  }
  if ((r.final.opciones || []).length > 3) fallos.push(`${r.final.opciones.length} botones (WhatsApp admite 3)`)
  return fallos
}

// ---------- Escenarios ----------
const ESCENARIOS = [
  {
    nombre: 'Bienvenida normal',
    turnos: [
      { usuario: 'Hola', esperar: { contiene: /para qui[eé]n/i, intencion: 'PROFILE_PROVIDED', noContiene: 'diagnóstico', maxPreguntas: 2 } },
    ],
  },
  {
    nombre: 'Lulu: respuestas fuera de guion sin reiniciar ni mezclar diagnóstico',
    turnos: [
      { usuario: 'Hola' },
      { usuario: ['IELST', 'Curso'], esperar: { noContiene: /diagn[oó]stico/i, noIntencion: 'TRANSFER_HUMANO', maxPreguntas: 2 } },
      { usuario: 'Ya tiene nivel de inglés', esperar: { noContiene: /vi que est[aá]s interesad/i, noContiene2: /soy alex/i, maxPreguntas: 2 } },
      { usuario: '3121144755', esperar: { noContiene: /vi que est[aá]s interesad/i, maxPreguntas: 2, maxCaracteres: 400 } },
    ],
  },
  {
    nombre: 'Business English a 14 años: no ofrecer curso de adultos',
    turnos: [
      { usuario: '¡Hola! Quiero más información sobre el diplomado de Business English', esperar: { intencion: 'COURSE_RECOMMENDED', imagen: true, maxCaracteres: 450, contiene: /inversi[oó]n|\$/i } },
      { usuario: 'Estoy buscando clases para mi hijo de 14 años', esperar: { noContiene: /por cierto[\s\S]*business/i, noContiene2: /pre-?teens/i, sinGuardias: true } },
    ],
  },
  {
    nombre: 'Dos hijos de 7 y 17: cursos por edad exacta y nivel antes de recomendar',
    turnos: [
      { usuario: 'Estoy buscando clases para niño y adolescente, de 7 y 17 años', esperar: { noContiene: /pre-?teens/i, noIntencion: 'COURSE_RECOMMENDED' } },
      { usuario: 'Aprendizaje desde 0 los dos', esperar: { noContiene: /pre-?teens/i, maxCaracteres: 1000, sinGuardias: true } },
    ],
  },
  {
    nombre: 'Precio durante perfilamiento: sin cifras inventadas',
    turnos: [
      { usuario: 'Hola, ¿cuánto cuesta el curso para adultos?', esperar: { sinGuardias: true, noIntencion: 'COURSE_RECOMMENDED' } },
    ],
  },
  {
    nombre: 'Pregunta fuera de alcance: transferir, no inventar',
    turnos: [
      { usuario: 'Hola' },
      { usuario: '¿Tienen sucursal en Manzanillo?', esperar: { intencion: 'TRANSFER_HUMANO', noContiene: /s[ií],? (tenemos|contamos con) sucursal/i } },
    ],
  },
  {
    nombre: 'Certificación: transferir, no inventar',
    turnos: [
      { usuario: 'Hola, quiero saber si el certificado que dan es válido para la SEP y Cambridge' , esperar: { intencion: 'TRANSFER_HUMANO' } },
    ],
  },
  {
    nombre: 'Curso específico My Time: resumen corto con imagen e inversión',
    turnos: [
      { usuario: 'Quiero info sobre el diplomado my time', esperar: { intencion: 'COURSE_RECOMMENDED', imagenDe: 'MYTIME', maxCaracteres: 450, contiene: /inversi[oó]n/i, sinGuardias: true } },
      { usuario: '¿Y qué formas de pago manejan?', esperar: { imagen: false, sinGuardias: true, noIntencion: 'COURSE_RECOMMENDED' } },
    ],
  },
  {
    nombre: 'Flujo diagnóstico completo',
    flujoDiagnostico: true,
    turnos: [
      { usuario: 'Hola', esperar: { contiene: '¿Para quién buscas el programa?' } },
      { usuario: 'Para mí', esperar: { contiene: '¿Qué edad tiene', maxPreguntas: 1 } },
      { usuario: '13-21', esperar: { contiene: '¿Cuándo te gustaría comenzar?' } },
      { usuario: 'Este mes', esperar: { intencion: 'TRANSFER_HUMANO', contiene: /martes o jueves/i } },
    ],
  },
  {
    nombre: 'Diagnóstico + pregunta por curso específico',
    flujoDiagnostico: true,
    turnos: [
      { usuario: 'Hola' },
      { usuario: 'Quiero info sobre el diplomado my time', esperar: { intencion: 'COURSE_RECOMMENDED', imagenDe: 'MYTIME', noContiene: 'Con gusto te explicamos todo en el diagnóstico', maxCaracteres: 450 } },
    ],
  },
  {
    nombre: 'Edad sin curso (3 años): no recomendar un curso que no aplica',
    turnos: [
      { usuario: 'Hola, busco inglés para mi hija de 3 años, sin nivel, horario el que sea', esperar: { noIntencion: 'COURSE_RECOMMENDED', imagen: false } },
    ],
  },
  {
    nombre: 'Flujo normal completo hasta recomendación',
    turnos: [
      { usuario: 'Hola' },
      { usuario: 'Para mi hijo', esperar: { contiene: /edad/i, maxPreguntas: 1 } },
      { usuario: 'Tiene 11', esperar: { contiene: /nivel/i, maxPreguntas: 1, noIntencion: 'COURSE_RECOMMENDED' } },
      { usuario: 'Desde cero', esperar: { intencion: 'COURSE_RECOMMENDED', imagenDe: 'PRETEENS', contiene: /pre-?teens/i, maxCaracteres: 600, sinGuardias: true } },
      { usuario: '¿Cuánto cuesta?', esperar: { imagen: false, noIntencion: 'COURSE_RECOMMENDED', sinGuardias: true, maxCaracteres: 500 } },
    ],
  },
]

// ---------- Ejecución ----------
async function correrEscenario(esc) {
  const historial = []
  const perfil = {}
  const resultado = { nombre: esc.nombre, fallos: [], transcripcion: [] }
  for (const [i, t] of esc.turnos.entries()) {
    for (const u of [].concat(t.usuario)) historial.push({ role: 'user', content: u })
    let r
    try {
      r = await turno(historial, perfil, !!esc.flujoDiagnostico)
    } catch (e) {
      resultado.fallos.push(`turno ${i + 1}: error llamando al modelo: ${e.message}`)
      break
    }
    historial.push({ role: 'assistant', content: r.bruto.respuesta })
    resultado.transcripcion.push({ usuario: [].concat(t.usuario).join(' | '), ...r.final, imagen: r.bruto.datos?.imagen })

    const fallosTurno = comprobacionesGlobales(r)
    for (const [clave, valor] of Object.entries(t.esperar || {})) {
      const fn = COMPROBACIONES[clave.replace(/\d+$/, '')]
      if (!fn) { fallosTurno.push(`comprobación desconocida ${clave}`); continue }
      const res = fn(r, valor)
      if (res !== true) fallosTurno.push(res)
    }
    if (fallosTurno.length) resultado.fallos.push(`turno ${i + 1} ("${[].concat(t.usuario).join(' | ')}"): ${fallosTurno.join(' · ')}`)
  }
  return resultado
}

const seleccion = ESCENARIOS.filter(e => !SOLO || e.nombre.toLowerCase().includes(SOLO))
console.log(`Probando ${seleccion.length} escenario(s) con ${process.env.ALEX_MODELO || 'gpt-6.1-sol'}...\n`)
const resultados = []
const cola = [...seleccion]
await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
  while (cola.length) {
    const esc = cola.shift()
    const r = await correrEscenario(esc)
    resultados.push(r)
    console.log(`${r.fallos.length ? '❌' : '✅'} ${r.nombre}`)
  }
}))

let fallidos = 0
for (const r of resultados.sort((a, b) => seleccion.findIndex(e => e.nombre === a.nombre) - seleccion.findIndex(e => e.nombre === b.nombre))) {
  if (!r.fallos.length && !VER) continue
  if (r.fallos.length) fallidos++
  console.log(`\n══════ ${r.nombre} ══════`)
  for (const f of r.fallos) console.log('  ✗ ' + f)
  for (const t of r.transcripcion) {
    console.log(`  👤 ${t.usuario}`)
    console.log(`  🤖 [${t.intencion}${t.imagen && t.imagen !== 'null' ? ' · imagen ' + t.imagen : ''}${t.opciones ? ' · botones: ' + t.opciones.join(' / ') : ''}${t.guardias.length ? ' · GUARDIA: ' + t.guardias.join('; ') : ''}]`)
    console.log('     ' + t.respuesta.replace(/\n/g, '\n     '))
  }
}
console.log(`\n${seleccion.length - fallidos}/${seleccion.length} escenarios correctos`)
process.exit(fallidos ? 1 : 0)

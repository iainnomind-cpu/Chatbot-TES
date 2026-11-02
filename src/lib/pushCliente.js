// Registro de push en el navegador. iOS puede quedarse esperando sin responder ni fallar,
// así que cada paso tiene tiempo límite y un mensaje que dice dónde se detuvo.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}

export function conTiempoLimite(promesa, ms, mensaje) {
  let temporizador
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(mensaje)), ms)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador))
}

function esperarActivo(registro) {
  if (registro.active) return Promise.resolve(registro)
  return new Promise((resolver) => {
    const worker = registro.installing || registro.waiting
    if (!worker) {
      // register() puede resolver antes de que aparezca el worker
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing
        nuevo?.addEventListener('statechange', () => { if (registro.active) resolver(registro) })
      })
      return
    }
    worker.addEventListener('statechange', () => { if (registro.active) resolver(registro) })
  })
}

// A diferencia de serviceWorker.ready, no espera para siempre y recupera un registro atascado
export async function obtenerServiceWorker({ espera = 10000 } = {}) {
  let registro = await navigator.serviceWorker.getRegistration('/')
  if (!registro) registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  try {
    return await conTiempoLimite(esperarActivo(registro), espera, 'atascado')
  } catch {
    await registro.unregister()
    registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return conTiempoLimite(
      esperarActivo(registro),
      espera,
      'El service worker no se activó. Cierra la app por completo y vuelve a abrirla.'
    )
  }
}

function mismaClave(suscripcion, clave) {
  const actual = suscripcion.options?.applicationServerKey
  if (!actual) return true
  const bytes = new Uint8Array(actual)
  return bytes.length === clave.length && bytes.every((b, i) => b === clave[i])
}

// Reutiliza la suscripción vigente: en iOS, cancelar y volver a crear puede quedarse sin respuesta
export async function obtenerSuscripcion(registro, vapidKey, { espera = 20000 } = {}) {
  const clave = urlBase64ToUint8Array(vapidKey)
  let suscripcion = await conTiempoLimite(
    registro.pushManager.getSubscription(),
    espera,
    'iOS no respondió al consultar la suscripción.'
  )
  if (suscripcion) {
    const vencida = suscripcion.expirationTime && Date.now() > suscripcion.expirationTime - 5 * 60 * 1000
    if (!vencida && mismaClave(suscripcion, clave)) return suscripcion
    await suscripcion.unsubscribe()
  }
  return conTiempoLimite(
    registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }),
    espera,
    'iOS no respondió al crear la suscripción. Abre el CRM desde el ícono de la pantalla de inicio, no desde Safari.'
  )
}

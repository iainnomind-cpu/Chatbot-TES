'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/componentes/AuthProvider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}

export default function PushManager() {
  const { usuario, token } = useAuth()
  const [mostrarBanner, setMostrarBanner] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [exito, setExito] = useState(false)

  const registrarSuscripcion = useCallback(async () => {
    if (!usuario || !token) { console.warn('[Push] Sin usuario/token'); return false }
    if (!VAPID_PUBLIC_KEY) { console.error('[Push] VAPID_PUBLIC_KEY no definida — agregar en Vercel'); return false }
    try {
      const registration = await navigator.serviceWorker.ready
      console.log('[Push] SW listo, obteniendo suscripcion...')

      // Siempre forzar nueva suscripcion si la actual puede estar vencida
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Verificar que el endpoint todavia sea valido
        const expirationTime = subscription.expirationTime
        if (expirationTime && Date.now() > expirationTime - 5 * 60 * 1000) {
          console.log('[Push] Suscripcion vencida, renovando...')
          await subscription.unsubscribe()
          subscription = null
        }
      }

      if (!subscription) {
        console.log('[Push] Creando nueva suscripcion push...')
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        console.log('[Push] Suscripcion creada:', subscription.endpoint.substring(0, 60) + '...')
      } else {
        console.log('[Push] Suscripcion existente OK')
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId: usuario.id,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('[Push] Error guardando suscripcion en DB:', err)
        return false
      }

      console.log('[Push] Suscripcion registrada en Supabase correctamente para user:', usuario.id)
      return true
    } catch (err) {
      console.error('[Push] Error registrando suscripcion push:', err.name, err.message)
      return false
    }
  }, [usuario, token])

  useEffect(() => {
    if (!usuario || !token) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      console.warn('[Push] Navegador no soporta push notifications')
      return
    }
    if (!VAPID_PUBLIC_KEY) {
      console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY no esta definida. Agregar en Vercel Environment Variables.')
      return
    }

    console.log('[Push] Estado de permiso actual:', Notification.permission)

    // Si ya tiene permiso concedido: re-sincronizar suscripcion silenciosamente
    if (Notification.permission === 'granted') {
      registrarSuscripcion()
      return
    }

    // Si fue denegado, no podemos hacer nada
    if (Notification.permission === 'denied') {
      console.warn('[Push] Permiso DENEGADO por el usuario — debe habilitarlo en ajustes del navegador/sistema')
      return
    }

    // Si esta en 'default', verificar si no lo descarto recientemente
    if (Notification.permission === 'default') {
      const descartado = localStorage.getItem('push_prompt_dismissed')
      if (descartado) {
        const dias = (Date.now() - parseInt(descartado, 10)) / (1000 * 60 * 60 * 24)
        if (dias < 1) return // Solo esperar 1 dia (antes eran 3)
        // Si ya paso 1 dia, borrar el descarte para volver a mostrar
        localStorage.removeItem('push_prompt_dismissed')
      }

      // Mostrar banner despues de 2 segundos
      const timer = setTimeout(() => {
        setMostrarBanner(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [usuario, token, registrarSuscripcion])

  const handleActivar = async () => {
    setCargando(true)
    try {
      console.log('[Push] Solicitando permiso de notificaciones...')
      const permiso = await Notification.requestPermission()
      console.log('[Push] Respuesta de permiso:', permiso)
      if (permiso === 'granted') {
        const ok = await registrarSuscripcion()
        if (ok) {
          setExito(true)
          setTimeout(() => setMostrarBanner(false), 2500)
        } else {
          alert('Notificaciones activadas en el sistema, pero hubo un error al guardar la suscripcion. Intenta recargar la app.')
          setMostrarBanner(false)
        }
      } else {
        console.log('[Push] Permiso denegado o ignorado:', permiso)
        setMostrarBanner(false)
      }
    } catch (err) {
      console.error('[Push] Error al pedir permiso:', err)
      setMostrarBanner(false)
    } finally {
      setCargando(false)
    }
  }

  const handleDescartar = () => {
    localStorage.setItem('push_prompt_dismissed', Date.now().toString())
    setMostrarBanner(false)
  }

  if (!mostrarBanner) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:w-96 z-[310] animate-[slideUp_0.3s_cubic-bezier(0.4,0,0.2,1)]">
      <div className="bg-white rounded-2xl shadow-2xl shadow-blue-900/20 border border-blue-200/80 overflow-hidden">
        {exito ? (
          <div className="p-4 flex items-center gap-3 bg-emerald-50 text-emerald-800">
            <span className="material-symbols-outlined text-emerald-600 text-[26px]">check_circle</span>
            <div>
              <p className="text-sm font-bold">Notificaciones activadas</p>
              <p className="text-xs text-emerald-600">Recibiras alertas de mensajes nuevos.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-[#1e3a8a] flex items-center justify-center text-white shadow-md shadow-blue-900/20 shrink-0">
                <span className="material-symbols-outlined text-[22px]">notifications_active</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">Activar alertas en tu telefono</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Recibe una notificacion push cada vez que llegue un mensaje nuevo.
                </p>
              </div>
              <button
                onClick={handleDescartar}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-1 -mr-1 w-8 h-8 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={handleDescartar}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Ahora no
              </button>
              <button
                onClick={handleActivar}
                disabled={cargando}
                className="flex-1 py-2 rounded-xl bg-[#1e3a8a] text-white text-xs font-semibold hover:bg-[#1e40af] transition-colors shadow-md shadow-blue-900/20 flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {cargando ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">notifications</span>
                    Activar
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

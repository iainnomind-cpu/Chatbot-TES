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
    if (!usuario || !token || !VAPID_PUBLIC_KEY) return false
    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      await fetch('/api/push/subscribe', {
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

      console.log('✅ Push subscription registrada en Supabase')
      return true
    } catch (err) {
      console.error('❌ Error registrando suscripción push:', err)
      return false
    }
  }, [usuario, token])

  useEffect(() => {
    if (!usuario || !token) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (!VAPID_PUBLIC_KEY) return

    // Si ya tiene permiso concedido, sincronizar la suscripción en silencio
    if (Notification.permission === 'granted') {
      registrarSuscripcion()
      return
    }

    // Si está en 'default' (aún no se ha pedido permiso), verificar si no lo descartó recientemente
    if (Notification.permission === 'default') {
      const descartado = localStorage.getItem('push_prompt_dismissed')
      if (descartado) {
        const dias = (Date.now() - parseInt(descartado, 10)) / (1000 * 60 * 60 * 24)
        if (dias < 3) return
      }

      // Mostrar banner con un pequeño retraso de 3 segundos
      const timer = setTimeout(() => {
        setMostrarBanner(true)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [usuario, token, registrarSuscripcion])

  const handleActivar = async () => {
    setCargando(true)
    try {
      // Direct user gesture: obligatorio para iOS PWA y Chrome móvil
      const permiso = await Notification.requestPermission()
      if (permiso === 'granted') {
        const ok = await registrarSuscripcion()
        if (ok) {
          setExito(true)
          setTimeout(() => setMostrarBanner(false), 2500)
        } else {
          setMostrarBanner(false)
        }
      } else {
        console.log('🔔 Permiso de notificaciones denegado o ignorado')
        setMostrarBanner(false)
      }
    } catch (err) {
      console.error('Error al pedir permiso de notificaciones:', err)
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
              <p className="text-sm font-bold">¡Notificaciones activadas!</p>
              <p className="text-xs text-emerald-600">Recibirás alertas en tu teléfono de mensajes nuevos.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-[#1e3a8a] flex items-center justify-center text-white shadow-md shadow-blue-900/20 shrink-0">
                <span className="material-symbols-outlined text-[22px]">notifications_active</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">Activar alertas en tu teléfono</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Recibe una notificación push cada vez que un prospecto envíe un mensaje o solicite atención de un asesor.
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

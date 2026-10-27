'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/componentes/AuthProvider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}

export default function DiagnosticoPush() {
  const { usuario, token } = useAuth()
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    // Verificar estado actual
    const info = {
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notification: 'Notification' in window,
      permiso: typeof Notification !== 'undefined' ? Notification.permission : 'no-disponible',
      vapidKey: !!VAPID_PUBLIC_KEY,
      vapidKeyValor: VAPID_PUBLIC_KEY ? VAPID_PUBLIC_KEY.substring(0, 20) + '...' : 'NO DEFINIDA',
      dismissed: localStorage.getItem('push_prompt_dismissed') || 'no',
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      plataforma: navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad') ? 'iOS' :
                  navigator.userAgent.includes('Android') ? 'Android' : 'Desktop',
    }
    setEstado(info)
  }, [])

  const activarNotificaciones = async () => {
    setCargando(true)
    setResultado(null)
    try {
      // Limpiar descarte previo
      localStorage.removeItem('push_prompt_dismissed')

      // Pedir permiso
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setResultado({ ok: false, msg: `Permiso ${permiso}. Ve a Ajustes del telefono → Aplicaciones → Chrome/CRM → Notificaciones → Activar` })
        return
      }

      // Registrar SW
      const registration = await navigator.serviceWorker.ready

      // Cancelar suscripcion anterior para forzar nueva
      const subAnterior = await registration.pushManager.getSubscription()
      if (subAnterior) await subAnterior.unsubscribe()

      if (!VAPID_PUBLIC_KEY) {
        setResultado({ ok: false, msg: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY no esta definida en Vercel. Ve a Vercel → tu proyecto → Settings → Environment Variables y agrega la clave VAPID.' })
        return
      }

      // Crear suscripcion nueva
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // Guardar en Supabase
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: subscription.toJSON(), userId: usuario.id }),
      })

      if (!res.ok) {
        const err = await res.text()
        setResultado({ ok: false, msg: 'Error guardando en BD: ' + err })
        return
      }

      // Enviar notificacion de prueba
      const resPrueba = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '✅ TES CRM - Prueba',
          body: 'Las notificaciones funcionan correctamente',
          url: '/inbox',
          tag: 'prueba-' + Date.now()
        })
      })
      const dataPrueba = await resPrueba.json()

      setResultado({ ok: true, msg: `Suscripcion guardada. Notificacion de prueba enviada a ${dataPrueba.enviadas} dispositivo(s).` })
      setEstado(prev => ({ ...prev, permiso: 'granted' }))
    } catch (err) {
      setResultado({ ok: false, msg: err.message })
    } finally {
      setCargando(false)
    }
  }

  if (!estado) return <div className="p-4 text-slate-400 text-sm">Cargando diagnóstico...</div>

  const items = [
    { label: 'Plataforma', valor: estado.plataforma, ok: true },
    { label: 'Modo standalone (app)', valor: estado.standalone ? 'Sí ✓' : 'No (navegador)', ok: estado.standalone },
    { label: 'Service Worker', valor: estado.serviceWorker ? 'Disponible ✓' : 'No disponible', ok: estado.serviceWorker },
    { label: 'Push Manager', valor: estado.pushManager ? 'Disponible ✓' : 'No disponible', ok: estado.pushManager },
    { label: 'Notificaciones API', valor: estado.notification ? 'Disponible ✓' : 'No disponible', ok: estado.notification },
    { label: 'Permiso de notificaciones', valor: estado.permiso, ok: estado.permiso === 'granted' },
    { label: 'Clave VAPID (servidor)', valor: estado.vapidKey ? estado.vapidKeyValor : '❌ NO DEFINIDA', ok: estado.vapidKey },
    { label: 'Banner descartado', valor: estado.dismissed !== 'no' ? new Date(parseInt(estado.dismissed)).toLocaleString('es-MX') : 'No', ok: true },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">bug_report</span>
            Diagnóstico de Notificaciones Push
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.label} className="px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 font-medium">{item.label}</span>
              <span className={`text-xs font-bold ${item.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                {item.valor}
              </span>
            </div>
          ))}
        </div>
      </div>

      {resultado && (
        <div className={`p-3 rounded-xl text-xs font-medium ${resultado.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {resultado.ok ? '✅ ' : '❌ '}{resultado.msg}
        </div>
      )}

      <button
        onClick={activarNotificaciones}
        disabled={cargando}
        className="w-full py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e40af] transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {cargando ? (
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-[18px]">notifications_active</span>
        )}
        {cargando ? 'Activando...' : 'Activar / Re-activar Notificaciones'}
      </button>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed px-2">
        Si el permiso dice "denied", ve a <strong>Ajustes → Aplicaciones → Chrome o TES CRM → Notificaciones</strong> y actívalas manualmente, luego regresa y presiona el botón.
      </p>
    </div>
  )
}

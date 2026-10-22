'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    if (!usuario || !token) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!VAPID_PUBLIC_KEY) return

    const registrarPush = async () => {
      try {
        // Esperar a que el SW esté listo
        const registration = await navigator.serviceWorker.ready

        // Verificar si ya tiene suscripción
        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
          // Pedir permiso si no está otorgado
          const permiso = await Notification.requestPermission()
          if (permiso !== 'granted') {
            console.log('🔔 Push: permiso denegado')
            return
          }

          // Crear nueva suscripción
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }

        // Guardar en backend
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

        console.log('✅ Push subscription registrada')
      } catch (err) {
        console.error('❌ Error registrando push:', err)
      }
    }

    // Registrar después de 5 segundos para no bloquear la carga inicial
    const timer = setTimeout(registrarPush, 5000)
    return () => clearTimeout(timer)
  }, [usuario, token])

  return null // Componente invisible
}

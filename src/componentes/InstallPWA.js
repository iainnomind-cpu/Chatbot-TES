'use client'

import { useState, useEffect } from 'react'

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [mostrarBanner, setMostrarBanner] = useState(false)
  const [yaInstalada, setYaInstalada] = useState(false)

  useEffect(() => {
    // ── Registrar Service Worker ──────────────────────────────
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => console.log('[PWA] SW registrado:', reg.scope))
        .catch((err) => console.error('[PWA] Error registrando SW:', err))
    }

    // Si ya está instalada como standalone, no mostrar nada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setYaInstalada(true)
      return
    }

    // No mostrar si el usuario lo dismisseó hace menos de 7 días
    const dismissedAt = localStorage.getItem('pwa_install_dismissed')
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Mostrar banner 4 segundos después de cargar la app
      setTimeout(() => setMostrarBanner(true), 4000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setYaInstalada(true)
    }
    setMostrarBanner(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa_install_dismissed', Date.now().toString())
    setMostrarBanner(false)
  }

  if (yaInstalada || !mostrarBanner) return null

  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:w-80 z-[300]"
      style={{ animation: 'slideUp 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
      <div className="bg-white rounded-2xl shadow-2xl shadow-blue-900/20 border border-slate-200 overflow-hidden">
        <div className="p-4 flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00236f] to-[#1e3a8a] flex items-center justify-center text-white shadow-lg shrink-0">
            <span className="material-symbols-outlined">school</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Instalar TES CRM</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Accede directo desde tu pantalla de inicio, sin abrir el navegador.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-1 -mr-1 w-8 h-8 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Ahora no
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-semibold hover:bg-[#1e40af] transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">install_mobile</span>
            Instalar
          </button>
        </div>
      </div>
    </div>
  )
}

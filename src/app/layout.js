'use client'

import './globals.css'
import BarraLateral from '@/componentes/BarraLateral'
import BarraSuperior from '@/componentes/BarraSuperior'
import { AuthProvider } from '@/componentes/AuthProvider'
import { NotificationProvider } from '@/componentes/NotificationProvider'
import AuthGuard from '@/componentes/AuthGuard'
import { usePathname } from 'next/navigation'
import InstallPWA from '@/componentes/InstallPWA'
import PushManager from '@/componentes/PushManager'

export default function LayoutRaiz({ children }) {
  const pathname = usePathname()
  const esPublico = ['/privacidad', '/eliminacion-datos'].includes(pathname)

  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <meta name="application-name" content="TES CRM" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="TES CRM" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1e3a8a" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
      </head>
      <body className="bg-[#f8f9fa] text-[#191c1d] min-h-screen">
        <AuthProvider>
          <NotificationProvider>
            <AuthGuard>
              {!esPublico && <BarraLateral />}
              <main className={`${!esPublico ? 'md:ml-72' : ''} min-h-screen pb-20 md:pb-0 flex flex-col overflow-x-hidden`}>
                {!esPublico && <BarraSuperior />}
                <div className="flex-1 h-full">
                  {children}
                </div>
              </main>
            </AuthGuard>
            {/* PushManager DENTRO de AuthProvider para poder usar useAuth() */}
            <PushManager />
          </NotificationProvider>
        </AuthProvider>
        {/* InstallPWA no necesita auth, puede ir fuera */}
        <InstallPWA />
      </body>
    </html>
  )
}

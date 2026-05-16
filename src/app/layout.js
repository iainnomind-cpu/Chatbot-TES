'use client'

import './globals.css'
import BarraLateral from '@/componentes/BarraLateral'
import BarraSuperior from '@/componentes/BarraSuperior'
import { AuthProvider } from '@/componentes/AuthProvider'
import { NotificationProvider } from '@/componentes/NotificationProvider'
import AuthGuard from '@/componentes/AuthGuard'
import { usePathname } from 'next/navigation'

export default function LayoutRaiz({ children }) {
  const pathname = usePathname()
  const esPublico = ['/privacidad', '/eliminacion-datos'].includes(pathname)

  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
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
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

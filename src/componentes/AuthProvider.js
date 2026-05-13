'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [permisos, setPermisos] = useState([])
  const [token, setToken] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function initAuth() {
      const savedToken = localStorage.getItem('te_token')
      const savedUser = localStorage.getItem('te_usuario')
      const savedPermisos = localStorage.getItem('te_permisos')
      
      if (savedToken && savedUser) {
        try {
          const res = await fetch('/api/auth', { cache: 'no-store' })
          if (res.ok) {
            setToken(savedToken)
            setUsuario(JSON.parse(savedUser))
            setPermisos(JSON.parse(savedPermisos || '[]'))
          } else {
            // Token inválido o cookie expirada
            localStorage.removeItem('te_token')
            localStorage.removeItem('te_usuario')
            localStorage.removeItem('te_permisos')
          }
        } catch (error) {
          console.error('Error al verificar sesión:', error)
          // Si hay error de red, limpiamos para evitar loop
          localStorage.removeItem('te_token')
          localStorage.removeItem('te_usuario')
          localStorage.removeItem('te_permisos')
        }
      }
      setCargando(false)
    }

    initAuth()
  }, [])

  const login = useCallback(async (email, password) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      
      if (!res.ok) {
        return { error: data.error || 'Error al iniciar sesión' }
      }

      setToken(data.token)
      setUsuario(data.usuario)
      setPermisos(data.permisos || [])
      
      localStorage.setItem('te_token', data.token)
      localStorage.setItem('te_usuario', JSON.stringify(data.usuario))
      localStorage.setItem('te_permisos', JSON.stringify(data.permisos || []))
      
      return { success: true }
    } catch (err) {
      return { error: 'Error de conexión: ' + err.message }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Llamar a la API para borrar la cookie httpOnly
      await fetch('/api/auth', { method: 'DELETE' })
    } catch (e) {
      console.error(e)
    }
    setToken(null)
    setUsuario(null)
    setPermisos([])
    localStorage.removeItem('te_token')
    localStorage.removeItem('te_usuario')
    localStorage.removeItem('te_permisos')
    window.location.href = '/login'
  }, [])

  const tienePermiso = useCallback((modulo, accion = 'puede_ver') => {
    if (!usuario) return false
    if (usuario.rol === 'admin') return true
    const perm = permisos.find(p => p.modulo === modulo)
    return perm ? !!perm[accion] : false
  }, [usuario, permisos])

  const value = {
    usuario,
    token,
    permisos,
    cargando,
    autenticado: !!usuario,
    esAdmin: usuario?.rol === 'admin',
    login,
    logout,
    tienePermiso
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

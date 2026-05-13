// Helper para hacer fetch autenticado al API del ERP
// Siempre envía el token JWT en el header Authorization

export function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('te_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export async function fetchAuth(url, options = {}) {
  const headers = getAuthHeaders()
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  })
  return res
}

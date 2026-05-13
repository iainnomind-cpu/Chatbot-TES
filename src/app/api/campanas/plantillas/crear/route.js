import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import axios from 'axios'

export const dynamic = 'force-dynamic'

// POST - Crear plantilla y enviar a revisión a Meta
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { name, category, language, components } = body

    const token = process.env.META_WHATSAPP_TOKEN
    const accountId = process.env.META_BUSINESS_ACCOUNT_ID

    if (!token || !accountId) {
      return NextResponse.json({ error: 'Faltan credenciales META_WHATSAPP_TOKEN o META_BUSINESS_ACCOUNT_ID' }, { status: 500 })
    }

    if (!name || !category || !components || components.length === 0) {
      return NextResponse.json({ error: 'Nombre, categoría y componentes son requeridos' }, { status: 400 })
    }

    // Validar nombre: solo minúsculas, números y guión bajo
    if (!/^[a-z0-9_]+$/.test(name)) {
      return NextResponse.json({ error: 'El nombre solo puede contener letras minúsculas, números y guiones bajos (_)' }, { status: 400 })
    }

    const url = `https://graph.facebook.com/v20.0/${accountId}/message_templates`

    const payload = {
      name,
      category: category || 'MARKETING',
      language: language || 'es_MX',
      components
    }

    const res = await axios.post(url, payload, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    return NextResponse.json({ 
      success: true, 
      id: res.data.id, 
      status: res.data.status,
      message: 'Plantilla enviada a revisión de Meta exitosamente'
    }, { status: 201 })

  } catch (error) {
    console.error('❌ Error creando plantilla Meta:', error.response?.data || error.message)
    const metaError = error.response?.data?.error
    return NextResponse.json({ 
      error: metaError?.error_user_msg || metaError?.message || 'Error al crear plantilla en Meta',
      detalle: metaError
    }, { status: error.response?.status || 500 })
  }
}

// DELETE - Eliminar plantilla de Meta
export async function DELETE(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) return NextResponse.json({ error: 'Nombre de plantilla requerido' }, { status: 400 })

    const token = process.env.META_WHATSAPP_TOKEN
    const accountId = process.env.META_BUSINESS_ACCOUNT_ID

    const url = `https://graph.facebook.com/v20.0/${accountId}/message_templates?name=${name}`
    
    await axios.delete(url, {
      headers: { Authorization: `Bearer ${token}` }
    })

    return NextResponse.json({ success: true, message: 'Plantilla eliminada' })
  } catch (error) {
    console.error('Error eliminando plantilla:', error.response?.data || error.message)
    return NextResponse.json({ error: 'Error al eliminar plantilla' }, { status: 500 })
  }
}

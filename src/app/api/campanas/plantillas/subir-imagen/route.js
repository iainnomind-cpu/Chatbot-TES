import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import axios from 'axios'

export const dynamic = 'force-dynamic'

// POST - Subir imagen a Meta usando la Resumable Upload API
// Esta API devuelve un "handle" (campo h) que es el único válido como header_handle en plantillas.
// Es diferente a la Media API que devuelve un "id" (solo sirve para enviar mensajes, NO para plantillas).
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formDataNext = await request.formData()
    const file = formDataNext.get('file')

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
    }

    const token = process.env.META_WHATSAPP_TOKEN
    const appId = process.env.META_APP_ID // App ID de Meta (diferente al WABA ID y al Phone Number ID)

    if (!token || !appId) {
      return NextResponse.json({
        error: 'Faltan credenciales: META_WHATSAPP_TOKEN y META_APP_ID son requeridos en las variables de entorno'
      }, { status: 500 })
    }

    // Convertir el archivo a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type || 'image/jpeg'

    const tiposPermitidos = ['image/jpeg', 'image/jpg', 'image/png']
    if (!tiposPermitidos.includes(mimeType)) {
      return NextResponse.json({ error: 'Solo se permiten imágenes JPG y PNG' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 5MB' }, { status: 400 })
    }

    // === PASO 1: Crear sesión de upload (Resumable Upload API) ===
    // Requiere el APP_ID de tu aplicación de Meta
    const sessionRes = await axios.post(
      `https://graph.facebook.com/v20.0/${appId}/uploads`,
      null,
      {
        params: {
          file_length: buffer.length,
          file_type: mimeType,
          access_token: token,
        }
      }
    )

    const uploadSessionId = sessionRes.data?.id
    if (!uploadSessionId) {
      throw new Error('Meta no devolvió un ID de sesión de upload')
    }

    // === PASO 2: Subir el archivo binario a la sesión ===
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v20.0/${uploadSessionId}`,
      buffer,
      {
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: '0',
          'Content-Type': mimeType,
        }
      }
    )

    // La Resumable Upload API devuelve el handle en el campo "h" (no "id")
    const headerHandle = uploadRes.data?.h
    if (!headerHandle) {
      throw new Error(`Meta no devolvió un handle válido. Respuesta: ${JSON.stringify(uploadRes.data)}`)
    }

    return NextResponse.json({
      success: true,
      header_handle: headerHandle,
      message: 'Imagen subida exitosamente',
    })

  } catch (error) {
    console.error('❌ Error subiendo imagen a Meta:', error.response?.data || error.message)
    const metaError = error.response?.data?.error
    return NextResponse.json(
      {
        error: metaError?.error_user_msg || metaError?.message || 'Error al subir la imagen a Meta',
        detalle: metaError || error.message,
      },
      { status: error.response?.status || 500 }
    )
  }
}

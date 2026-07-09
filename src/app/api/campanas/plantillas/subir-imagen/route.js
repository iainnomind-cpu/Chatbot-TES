import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import axios from 'axios'
import FormData from 'form-data'

export const dynamic = 'force-dynamic'

// POST - Subir imagen a Meta y obtener el header_handle para plantillas
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
    }

    const token = process.env.META_WHATSAPP_TOKEN
    const accountId = process.env.META_BUSINESS_ACCOUNT_ID
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID

    if (!token || !accountId || !phoneNumberId) {
      return NextResponse.json({ error: 'Faltan credenciales de Meta' }, { status: 500 })
    }

    // Convertir el archivo a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = file.name || 'image.jpg'
    const mimeType = file.type || 'image/jpeg'

    // Validar tipo de archivo
    const tiposPermitidos = ['image/jpeg', 'image/jpg', 'image/png']
    if (!tiposPermitidos.includes(mimeType)) {
      return NextResponse.json({ error: 'Solo se permiten imágenes JPG y PNG' }, { status: 400 })
    }

    // Validar tamaño (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 5MB' }, { status: 400 })
    }

    // Subir a Meta usando el endpoint de Media estándar de WhatsApp
    const uploadUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/media`

    // Crear el multipart/form-data usando form-data (npm)
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('file', buffer, { filename: fileName, contentType: mimeType })

    const uploadRes = await axios.post(uploadUrl, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders()
      }
    })

    const headerHandle = uploadRes.data?.id
    if (!headerHandle) {
      throw new Error('Meta no devolvió un ID de imagen válido')
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
        detalle: metaError,
      },
      { status: error.response?.status || 500 }
    )
  }
}

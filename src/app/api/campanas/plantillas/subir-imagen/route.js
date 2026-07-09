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

    // Subir a Meta usando el endpoint de upload de media para plantillas
    const uploadUrl = `https://graph.facebook.com/v20.0/${accountId}/uploads`

    // Paso 1: Iniciar upload session
    const sessionRes = await axios.post(uploadUrl, null, {
      params: {
        file_length: buffer.length,
        file_type: mimeType,
        access_token: token,
      },
    })

    const uploadSessionId = sessionRes.data?.id
    if (!uploadSessionId) {
      throw new Error('No se pudo iniciar la sesión de upload en Meta')
    }

    // Paso 2: Subir el archivo
    const uploadFileUrl = `https://graph.facebook.com/v20.0/${uploadSessionId}`
    const uploadRes = await axios.post(uploadFileUrl, buffer, {
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
        'Content-Type': mimeType,
      },
    })

    const headerHandle = uploadRes.data?.h
    if (!headerHandle) {
      throw new Error('Meta no devolvió un handle de imagen válido')
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

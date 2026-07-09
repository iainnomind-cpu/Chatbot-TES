import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

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

    // Validar tipo de archivo (file.type existe en objetos File de Next.js)
    const mimeType = file.type || 'image/jpeg'
    const tiposPermitidos = ['image/jpeg', 'image/jpg', 'image/png']
    if (!tiposPermitidos.includes(mimeType)) {
      return NextResponse.json({ error: 'Solo se permiten imágenes JPG y PNG' }, { status: 400 })
    }

    // Validar tamaño (file.size existe en objetos File)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 5MB' }, { status: 400 })
    }

    // Modificar el formData nativo directamente para añadir el parámetro requerido por Meta
    formData.append('messaging_product', 'whatsapp')

    // Subir a Meta usando el endpoint de Media estándar de WhatsApp
    const uploadUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/media`

    // En Next.js App Router, usar fetch nativo con el FormData nativo garantiza que
    // los headers de Content-Type y boundary se construyan perfectamente.
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // NO SE DEBE poner Content-Type. Fetch lo calcula con su boundary.
      },
      body: formData
    })

    const uploadData = await uploadRes.json()

    if (!uploadRes.ok) {
      throw { response: { status: uploadRes.status, data: { error: uploadData.error } } }
    }

    const headerHandle = uploadData?.id
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

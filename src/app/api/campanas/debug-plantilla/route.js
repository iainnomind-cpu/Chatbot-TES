import { NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const nombre = searchParams.get('nombre')

    if (!nombre) {
      return NextResponse.json({ error: 'Falta parámetro nombre' })
    }

    const token = process.env.META_WHATSAPP_TOKEN
    const accountId = process.env.META_BUSINESS_ACCOUNT_ID

    if (!token || !accountId) {
      return NextResponse.json({ error: 'Faltan credenciales' })
    }

    const url = `https://graph.facebook.com/v20.0/${accountId}/message_templates?name=${nombre}`

    const respuesta = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    return NextResponse.json({ 
      plantilla: respuesta.data.data?.[0] || 'No encontrada'
    }, { status: 200 })

  } catch (error) {
    return NextResponse.json({ error: error.message, detalle: error.response?.data }, { status: 500 })
  }
}

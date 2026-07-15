import { NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic = 'force-dynamic'

/**
 * GET /api/anuncios/meta-activos
 * Trae los anuncios ACTIVOS de la cuenta de Meta Ads vinculada.
 * Requiere que el token tenga permiso ads_read y que META_ADS_ACCOUNT_ID esté configurado.
 */
export async function GET() {
  try {
    const token = process.env.META_WHATSAPP_TOKEN
    const adAccountId = process.env.META_ADS_ACCOUNT_ID // act_XXXXXXXXX
    const businessId = process.env.META_BUSINESS_ACCOUNT_ID

    if (!token) {
      return NextResponse.json({ error: 'Falta META_WHATSAPP_TOKEN', anuncios: [] }, { status: 200 })
    }

    // Si tienen META_ADS_ACCOUNT_ID lo usamos directamente
    // Si no, intentamos buscarlo a partir del businessId
    let adAccount = adAccountId

    if (!adAccount && businessId) {
      // Buscar la cuenta de anuncios vinculada al Business Manager
      const bizResp = await axios.get(
        `https://graph.facebook.com/v20.0/${businessId}/owned_ad_accounts`,
        {
          params: { fields: 'id,name', limit: 5, access_token: token }
        }
      )
      const accounts = bizResp.data?.data || []
      if (accounts.length > 0) {
        adAccount = accounts[0].id // Tomamos la primera (la principal)
      }
    }

    if (!adAccount) {
      return NextResponse.json({
        error: 'No se encontró ninguna cuenta de Meta Ads. Agrega META_ADS_ACCOUNT_ID en las variables de entorno (ej: act_123456789).',
        anuncios: []
      }, { status: 200 })
    }

    // Traer anuncios activos con sus datos relevantes
    const adsResp = await axios.get(
      `https://graph.facebook.com/v20.0/${adAccount}/ads`,
      {
        params: {
          effective_status: JSON.stringify(['ACTIVE']),
          fields: 'id,name,status,adset_id,campaign_id,creative{title,body,image_url}',
          limit: 50,
          access_token: token
        }
      }
    )

    const ads = (adsResp.data?.data || []).map(ad => ({
      id: ad.id,
      nombre: ad.name,
      estado: ad.status,
      adset_id: ad.adset_id,
      campaign_id: ad.campaign_id,
      titulo_creativo: ad.creative?.title || '',
      cuerpo_creativo: ad.creative?.body || '',
      imagen_url: ad.creative?.image_url || null,
    }))

    return NextResponse.json({ anuncios: ads, cuenta: adAccount }, { status: 200 })

  } catch (error) {
    const errMeta = error.response?.data?.error
    // Error 200/190 = token sin permiso ads_read
    if (errMeta?.code === 200 || errMeta?.code === 190) {
      return NextResponse.json({
        error: `El token de Meta no tiene permiso "ads_read". Genera un token con ese permiso en Meta for Developers. (${errMeta.message})`,
        anuncios: []
      }, { status: 200 })
    }
    return NextResponse.json({
      error: error.message,
      detalle: errMeta,
      anuncios: []
    }, { status: 200 })
  }
}

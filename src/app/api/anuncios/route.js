import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/anuncios → listar anuncios configurados
export async function GET(request) {
  try {
    const { data, error } = await supabaseAdmin
      .from('anuncios')
      .select('*')
      .order('creado_en', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/anuncios → crear anuncio
export async function POST(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const { data, error } = await supabaseAdmin
      .from('anuncios')
      .insert({
        nombre: body.nombre,
        meta_ad_id: body.meta_ad_id || null,
        meta_adset_id: body.meta_adset_id || null,
        palabras_clave: body.palabras_clave || [],
        curso_relacionado: body.curso_relacionado || null,
        saltar_onboarding: body.saltar_onboarding !== false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/anuncios → actualizar anuncio
export async function PUT(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('anuncios')
      .update({
        nombre: body.nombre,
        meta_ad_id: body.meta_ad_id || null,
        meta_adset_id: body.meta_adset_id || null,
        palabras_clave: body.palabras_clave || [],
        curso_relacionado: body.curso_relacionado || null,
        saltar_onboarding: body.saltar_onboarding !== false,
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/anuncios?id=xxx → eliminar anuncio
export async function DELETE(request) {
  const auth = await requireAuth(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('anuncios').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

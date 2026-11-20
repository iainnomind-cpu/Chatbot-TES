import { supabaseAdmin as supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Las palabras clave se capturan separadas por coma
const aLista = (valor) => Array.isArray(valor)
  ? valor
  : String(valor || '').split(',').map(v => v.trim()).filter(Boolean)

export async function GET() {
  const { data, error } = await supabase.from('becas_convenio').select('*').order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(solicitud) {
  const cuerpo = await solicitud.json()
  if (!cuerpo.escuela?.trim() || !cuerpo.respuesta_inicial?.trim()) {
    return NextResponse.json({ error: 'La escuela y la respuesta inicial son obligatorias' }, { status: 400 })
  }
  const { data, error } = await supabase.from('becas_convenio').insert([{
    escuela: cuerpo.escuela.trim(),
    palabras_clave: aLista(cuerpo.palabras_clave),
    respuesta_inicial: cuerpo.respuesta_inicial.trim(),
    respuesta_precios: cuerpo.respuesta_precios?.trim() || null,
    detalles: cuerpo.detalles?.trim() || null,
    activa: cuerpo.activa !== false,
  }]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(solicitud) {
  const { id, ...cambios } = await solicitud.json()
  if (!id) return NextResponse.json({ error: 'Se requiere el ID de la beca' }, { status: 400 })
  if ('palabras_clave' in cambios) cambios.palabras_clave = aLista(cambios.palabras_clave)
  const { data, error } = await supabase.from('becas_convenio').update(cambios).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(solicitud) {
  const id = new URL(solicitud.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Se requiere el ID de la beca' }, { status: 400 })
  const { error } = await supabase.from('becas_convenio').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ mensaje: 'Beca eliminada' })
}

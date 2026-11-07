import { supabaseAdmin as supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { interpretarLineas, normalizarTelefono } from '@/lib/telefonos'

export const dynamic = 'force-dynamic'

const MAX_LINEAS = 500

// POST - Dar de alta números capturados a mano (muestreos, ferias) para poder enviarles plantillas
export async function POST(solicitud) {
  try {
    const { lineas, curso_interes } = await solicitud.json()
    const { validos, invalidos } = interpretarLineas(lineas)

    if (validos.size === 0) {
      return NextResponse.json({ error: 'No se encontró ningún número válido', invalidos }, { status: 400 })
    }
    if (validos.size > MAX_LINEAS) {
      return NextResponse.json({ error: `Máximo ${MAX_LINEAS} números por carga` }, { status: 400 })
    }

    // Los prospectos viejos pueden tener el número con 521 en lugar de 52
    const variantes = [...validos.keys()].flatMap(t => t.length === 12 && t.startsWith('52') ? [t, '521' + t.slice(2)] : [t])
    const { data: existentes, error: errExist } = await supabase
      .from('prospectos')
      .select('id, telefono')
      .in('telefono', variantes)
    if (errExist) return NextResponse.json({ error: errExist.message }, { status: 500 })

    const yaRegistrados = new Set((existentes || []).map(p => normalizarTelefono(p.telefono)))
    const nuevos = [...validos]
      .filter(([telefono]) => !yaRegistrados.has(telefono))
      .map(([telefono, nombre]) => ({
        telefono,
        nombre: nombre || 'Prospecto',
        canal: 'whatsapp',
        estado: 'nuevo',
        curso_interes: curso_interes?.trim() || null,
        notas_internas: 'Agregado manualmente desde Campañas'
      }))

    let creados = []
    if (nuevos.length > 0) {
      const { data, error } = await supabase.from('prospectos').insert(nuevos).select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      creados = data || []
    }

    return NextResponse.json({
      ids: [...(existentes || []).map(p => p.id), ...creados.map(p => p.id)],
      nuevos: creados.length,
      existentes: (existentes || []).length,
      invalidos
    }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

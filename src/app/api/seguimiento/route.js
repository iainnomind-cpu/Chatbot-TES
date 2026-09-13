import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sendMetaConversionEvent } from '@/lib/metaCAPI'

const ETAPAS = [
  '1. Prospecto nuevo',
  '2. Contactado',
  '3. Lead calificado',
  '4. DX / Cita agendada',
  '5. DX / Cita asistida',
  '6. Inscripción',
]

// GET /api/seguimiento?mes=2026-09  → prospectos + cortes del mes
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes') // formato YYYY-MM

    // Fecha inicio y fin del mes
    let fechaInicio, fechaFin
    if (mes) {
      const [y, m] = mes.split('-').map(Number)
      fechaInicio = new Date(y, m - 1, 1).toISOString().split('T')[0]
      fechaFin = new Date(y, m, 0).toISOString().split('T')[0]
    } else {
      const now = new Date()
      fechaInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      fechaFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
    }

    // Todos los prospectos del mes seleccionado
    const { data: prospectos, error } = await supabase
      .from('prospectos')
      .select('id, nombre_alumno, nombre, telefono, fuente, curso_interes, etapa_funnel, responsable, proximo_seguimiento, ultima_accion, inscrito, lead_score, creado_en')
      .gte('creado_en', fechaInicio + 'T00:00:00')
      .lte('creado_en', fechaFin + 'T23:59:59')
      .order('creado_en', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Calcular cortes semanales
    const inicio = new Date(fechaInicio)
    const semanas = [
      { label: 'Sem 1 (1-7)',   desde: 0,  hasta: 6  },
      { label: 'Sem 2 (8-14)',  desde: 7,  hasta: 13 },
      { label: 'Sem 3 (15-21)', desde: 14, hasta: 20 },
      { label: 'Sem 4 (22+)',   desde: 21, hasta: 999 },
    ]

    const cortes = ETAPAS.map(etapa => {
      const semanales = semanas.map(sem => {
        return (prospectos || []).filter(p => {
          const diaProspecto = Math.floor((new Date(p.creado_en) - inicio) / 86400000)
          const etapaNum = ETAPAS.indexOf(p.etapa_funnel || '1. Prospecto nuevo')
          const etapaReq = ETAPAS.indexOf(etapa)
          return diaProspecto >= sem.desde && diaProspecto <= sem.hasta && etapaNum >= etapaReq
        }).length
      })
      const total = (prospectos || []).filter(p => {
        const etapaNum = ETAPAS.indexOf(p.etapa_funnel || '1. Prospecto nuevo')
        const etapaReq = ETAPAS.indexOf(etapa)
        return etapaNum >= etapaReq
      }).length

      return { etapa, semanales, total }
    })

    // Calcular % de conversión entre etapas
    const cortesConPct = cortes.map((c, i) => ({
      ...c,
      pct: i === 0 ? 100 : cortes[i - 1].total > 0 ? Math.round((c.total / cortes[i - 1].total) * 100) : 0
    }))

    return NextResponse.json({
      prospectos: prospectos || [],
      cortes: cortesConPct,
      mes: fechaInicio.substring(0, 7),
      fechaInicio,
      fechaFin,
      total: prospectos?.length || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/seguimiento  → actualizar campos de seguimiento de un prospecto
export async function PATCH(req) {
  try {
    const body = await req.json()
    const { id, etapa_funnel, proximo_seguimiento, ultima_accion, responsable, fuente, inscrito } = body

    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const updates = {}
    if (etapa_funnel !== undefined) updates.etapa_funnel = etapa_funnel
    if (proximo_seguimiento !== undefined) updates.proximo_seguimiento = proximo_seguimiento || null
    if (ultima_accion !== undefined) updates.ultima_accion = ultima_accion
    if (responsable !== undefined) updates.responsable = responsable
    if (fuente !== undefined) updates.fuente = fuente
    if (inscrito !== undefined) {
      updates.inscrito = inscrito
      if (inscrito) updates.etapa_funnel = '6. Inscripción'
    }

    const { data, error } = await supabase
      .from('prospectos')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Si hubo un cambio de etapa, notificar a Meta CAPI
    if (updates.etapa_funnel) {
      sendMetaConversionEvent(data, updates.etapa_funnel)
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

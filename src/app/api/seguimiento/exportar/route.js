import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const ETAPAS = [
  '1. Prospecto nuevo',
  '2. Contactado',
  '3. Lead calificado',
  '4. DX / Cita agendada',
  '5. DX / Cita asistida',
  '6. Inscripción',
  '❌ Sin interés / Descartado'
]

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes')

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

    const { data: prospectos, error } = await supabase
      .from('prospectos')
      .select('nombre, nombre_alumno, telefono, fuente, curso_interes, etapa_funnel, responsable, proximo_seguimiento, ultima_accion, creado_en')
      .gte('creado_en', fechaInicio + 'T00:00:00')
      .lte('creado_en', fechaFin + 'T23:59:59')
      .order('creado_en', { ascending: false })

    if (error) throw error

    // --- HOJA 1: Seguimiento (Datos raw) ---
    const datosSeguimiento = (prospectos || []).map(p => ({
      'Fecha ingreso': p.creado_en.split('T')[0],
      'Nombre prospecto': p.nombre_alumno || p.nombre,
      'Teléfono': p.telefono,
      'Fuente': p.fuente || '',
      'Programa / Target': p.curso_interes || '',
      'Etapa funnel': p.etapa_funnel || '1. Prospecto nuevo',
      'Responsable': p.responsable || '',
      'Próximo seguimiento': p.proximo_seguimiento || '',
      'Última acción': p.ultima_accion || '',
    }))

    // --- HOJA 2: Cortes (Resumen) ---
    const inicio = new Date(fechaInicio)
    const semanas = [
      { label: 'Sem 1', desde: 0, hasta: 6 },
      { label: 'Sem 2', desde: 7, hasta: 13 },
      { label: 'Sem 3', desde: 14, hasta: 20 },
      { label: 'Sem 4', desde: 21, hasta: 999 },
    ]

    const cortes = ETAPAS.map(etapa => {
      const esFilaDescartado = etapa === '❌ Sin interés / Descartado'
      
      const semanales = semanas.map(sem => {
        return (prospectos || []).filter(p => {
          const diaProspecto = Math.floor((new Date(p.creado_en) - inicio) / 86400000)
          if (diaProspecto < sem.desde || diaProspecto > sem.hasta) return false
          
          if (esFilaDescartado) {
             return p.etapa_funnel === '❌ Sin interés / Descartado'
          }
          
          let etapaNum = ETAPAS.indexOf(p.etapa_funnel || '1. Prospecto nuevo')
          if (p.etapa_funnel === '❌ Sin interés / Descartado') etapaNum = 1 // En el funnel regular, cuenta como Contactado
          const etapaReq = ETAPAS.indexOf(etapa)
          return etapaNum >= etapaReq
        }).length
      })
      
      const total = (prospectos || []).filter(p => {
        if (esFilaDescartado) {
           return p.etapa_funnel === '❌ Sin interés / Descartado'
        }
        let etapaNum = ETAPAS.indexOf(p.etapa_funnel || '1. Prospecto nuevo')
        if (p.etapa_funnel === '❌ Sin interés / Descartado') etapaNum = 1 // En el funnel regular, cuenta como Contactado
        const etapaReq = ETAPAS.indexOf(etapa)
        return etapaNum >= etapaReq
      }).length

      return { etapa, semanales, total }
    })

    const cortesConPct = cortes.map((c, i) => ({
      ...c,
      pct: i === 0 ? 1 : cortes[i - 1].total > 0 ? (c.total / cortes[i - 1].total) : 0
    }))

    const datosCortes = cortesConPct.map(c => ({
      'Indicador': c.etapa,
      'Semana 1': c.semanales[0],
      'Semana 2': c.semanales[1],
      'Semana 3': c.semanales[2],
      'Semana 4': c.semanales[3],
      'Acumulado Mensual': c.total,
      '% Conversión': c.pct,
    }))

    // Crear Workbook
    const wb = XLSX.utils.book_new()
    
    // Configurar Hoja Seguimiento
    const wsSeg = XLSX.utils.json_to_sheet(datosSeguimiento)
    XLSX.utils.book_append_sheet(wb, wsSeg, 'Seguimiento')

    // Configurar Hoja Cortes
    const wsCortes = XLSX.utils.json_to_sheet(datosCortes)
    XLSX.utils.book_append_sheet(wb, wsCortes, 'Cortes')

    // Generar buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Funnel_TES_${mes || 'Mes_Actual'}.xlsx"`
      }
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

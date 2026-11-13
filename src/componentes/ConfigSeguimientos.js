'use client'

import { useState, useEffect } from 'react'
import { MAX_INTENTOS } from '@/lib/seguimientos'

const SCORES = [
  { clave: 'FRIO', etiqueta: '❄️ Fríos' },
  { clave: 'TIBIO', etiqueta: '🌡️ Tibios' },
  { clave: 'SIN_SCORE', etiqueta: 'Sin score todavía' },
]

// Tarjeta de Configuración para los seguimientos automáticos
export default function ConfigSeguimientos({ valor, onChange }) {
  const [plantillas, setPlantillas] = useState([])

  useEffect(() => {
    fetch('/api/campanas/plantillas')
      .then(r => r.json())
      .then(d => setPlantillas((d.plantillas || []).filter(p => p.status === 'APPROVED')))
      .catch(() => setPlantillas([]))
  }, [])

  const cambiar = (cambios) => onChange({ ...valor, ...cambios })
  const cambiarLista = (campo, i, v) => cambiar({ [campo]: valor[campo].map((x, j) => (j === i ? v : x)) })
  const faltanPlantillas = valor.activo && valor.horas.some((h, i) => h >= 24 && !valor.plantillas[i])

  return (
    <div className="border-t border-slate-100 pt-6 mt-2">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="text-xl font-bold text-[#191c1d] flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">schedule_send</span>
          Seguimientos automáticos
        </h2>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={valor.activo} onChange={e => cambiar({ activo: e.target.checked })} className="w-4 h-4 accent-blue-700" />
          Activos
        </label>
      </div>
      <p className="text-xs text-slate-500 mb-5">
        Alex vuelve a escribir a los prospectos que dejan de responder, hasta {MAX_INTENTOS} veces. Se detiene en cuanto responden, agendan cita o los toma un asesor.
        Después de 24 horas sin respuesta, WhatsApp solo permite enviar plantillas aprobadas.
      </p>

      <div className="space-y-3">
        {valor.horas.map((h, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[auto_1fr_2fr] items-center gap-3 bg-slate-50 rounded-xl p-3">
            <span className="text-sm font-bold text-slate-700 w-20">Intento {i + 1}</span>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              a las
              <input
                type="number" min="1" max="720" value={h}
                onChange={e => cambiarLista('horas', i, Number(e.target.value))}
                className="w-20 border border-slate-200 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
              />
              h sin respuesta
            </label>
            <select
              value={valor.plantillas[i]}
              onChange={e => cambiarLista('plantillas', i, e.target.value)}
              aria-label={`Plantilla del intento ${i + 1}`}
              className={`border rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100 ${h >= 24 && !valor.plantillas[i] ? 'border-amber-400' : 'border-slate-200'}`}
            >
              <option value="">Mensaje libre (solo llega antes de 24 h)</option>
              {plantillas.map(p => <option key={p.id} value={p.name}>Plantilla: {p.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      {faltanPlantillas && (
        <p className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Los intentos de 24 h o más necesitan una plantilla aprobada; sin ella, ese intento no se envía.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
        <div className="flex flex-col gap-2">
          <span className="font-bold text-[#191c1d] text-sm">A quién se le da seguimiento</span>
          <div className="flex flex-wrap gap-3">
            {SCORES.map(s => (
              <label key={s.clave} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox" checked={!!valor.scores[s.clave]}
                  onChange={e => cambiar({ scores: { ...valor.scores, [s.clave]: e.target.checked } })}
                  className="w-4 h-4 accent-blue-700"
                />
                {s.etiqueta}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Los calientes no reciben seguimiento automático: ya están por agendar y los atiende un asesor.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-bold text-[#191c1d] text-sm">Horario de envío (hora de México)</span>
          <div className="flex items-center gap-2">
            <input type="time" value={valor.hora_inicio} onChange={e => cambiar({ hora_inicio: e.target.value })} className="border border-slate-200 rounded-lg p-2 text-sm bg-white" />
            <span className="text-sm text-slate-500">a</span>
            <input type="time" value={valor.hora_fin} onChange={e => cambiar({ hora_fin: e.target.value })} className="border border-slate-200 rounded-lg p-2 text-sm bg-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

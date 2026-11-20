'use client'

import { useState, useMemo } from 'react'

// Elegir a quién se le envía la campaña sin tener que crear antes un segmento:
// o se usa uno guardado, o se marcan personas aquí y el segmento se crea solo al guardar.
export default function SelectorDestinatarios({ prospectos, audiencias, valor, onChange }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState({ escuela: 'Todas', curso: 'Todos', estado: 'Todos', score: 'Todos' })

  const opciones = useMemo(() => {
    const unicos = (obtener) => [...new Set(prospectos.map(obtener).map(v => (v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    return {
      escuelas: unicos(p => p.escuela),
      cursos: unicos(p => p.curso_interes),
      estados: unicos(p => p.estado),
    }
  }, [prospectos])

  const filtrados = useMemo(() => prospectos.filter(p => {
    const texto = `${p.nombre_alumno || ''} ${p.nombre || ''} ${p.telefono || ''}`.toLowerCase()
    if (busqueda && !texto.includes(busqueda.toLowerCase())) return false
    if (filtros.escuela !== 'Todas' && (p.escuela || '').trim() !== filtros.escuela) return false
    if (filtros.curso !== 'Todos' && (p.curso_interes || '').trim() !== filtros.curso) return false
    if (filtros.estado !== 'Todos' && (p.estado || '').trim() !== filtros.estado) return false
    if (filtros.score !== 'Todos' && (p.lead_score || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') !== filtros.score) return false
    return true
  }), [prospectos, busqueda, filtros])

  const ids = valor.ids || []
  const marcar = (id) => onChange({ ...valor, ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] })
  const todosMarcados = filtrados.length > 0 && filtrados.every(p => ids.includes(p.id))
  const marcarTodos = () => onChange({
    ...valor,
    ids: todosMarcados ? ids.filter(id => !filtrados.some(p => p.id === id)) : [...new Set([...ids, ...filtrados.map(p => p.id)])],
  })

  const claseSelect = 'border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-100'

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex gap-1 p-1 bg-slate-100">
        {[['personas', 'Elegir personas'], ['segmento', 'Usar segmento guardado']].map(([modo, etiqueta]) => (
          <button
            key={modo}
            type="button"
            onClick={() => onChange({ ...valor, modo })}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${valor.modo === modo ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {valor.modo === 'segmento' ? (
        <div className="p-3">
          <select
            value={valor.audiencia_id || ''}
            onChange={e => onChange({ ...valor, audiencia_id: e.target.value })}
            aria-label="Segmento guardado"
            className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">— Elige un segmento —</option>
            {audiencias.map(a => <option key={a.id} value={a.id}>📍 {a.nombre} ({a.total_estimado} pers.)</option>)}
          </select>
          {audiencias.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-2">Todavía no hay segmentos guardados. Usa &quot;Elegir personas&quot;.</p>
          )}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar prospecto"
            className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={filtros.escuela} onChange={e => setFiltros({ ...filtros, escuela: e.target.value })} aria-label="Escuela" className={claseSelect}>
              <option value="Todas">Todas las escuelas</option>
              {opciones.escuelas.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtros.curso} onChange={e => setFiltros({ ...filtros, curso: e.target.value })} aria-label="Curso" className={claseSelect}>
              <option value="Todos">Todos los cursos</option>
              {opciones.cursos.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })} aria-label="Estado" className={claseSelect}>
              <option value="Todos">Todos los estados</option>
              {opciones.estados.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtros.score} onChange={e => setFiltros({ ...filtros, score: e.target.value })} aria-label="Score" className={claseSelect}>
              <option value="Todos">Todos los scores</option>
              <option value="CALIENTE">🔥 Calientes</option>
              <option value="TIBIO">🌡️ Tibios</option>
              <option value="FRIO">❄️ Fríos</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">{ids.length} seleccionado(s) de {filtrados.length} visibles</span>
            <button type="button" onClick={marcarTodos} className="font-bold text-blue-700 hover:underline">
              {todosMarcados ? 'Quitar los visibles' : 'Seleccionar todos los visibles'}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
            {filtrados.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">Nadie coincide con los filtros.</p>
            ) : filtrados.map(p => (
              <label key={p.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs ${ids.includes(p.id) ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" checked={ids.includes(p.id)} onChange={() => marcar(p.id)} className="w-4 h-4 accent-blue-700" />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-800 block truncate">{p.nombre_alumno || p.nombre || 'Sin nombre'}</span>
                  <span className="text-slate-400 font-mono">{p.telefono}</span>
                </span>
                {p.escuela && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">{p.escuela}</span>}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">Al guardar se crea solo el segmento con las personas marcadas.</p>
        </div>
      )}
    </div>
  )
}

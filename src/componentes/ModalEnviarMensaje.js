'use client'

import { useState, useEffect } from 'react'
import { variablesDe, textoFinal, TOKEN_NOMBRE } from '@/lib/plantillasWhatsapp'

// Envío directo a uno o varios prospectos: plantilla aprobada (siempre llega)
// o mensaje libre (solo llega si la persona escribió en las últimas 24 horas)
export default function ModalEnviarMensaje({ prospectos, alCerrar }) {
  const [modo, setModo] = useState('plantilla')
  const [plantillas, setPlantillas] = useState(null)
  const [errorPlantillas, setErrorPlantillas] = useState('')
  const [elegida, setElegida] = useState(null)
  const [valores, setValores] = useState([])
  const [imagenUrl, setImagenUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null) // { enviados, fallidos: [{ nombre, error }] }

  useEffect(() => {
    fetch('/api/campanas/plantillas')
      .then(r => r.json())
      .then(d => {
        setPlantillas((d.plantillas || []).filter(p => p.status === 'APPROVED'))
        if (d.error) setErrorPlantillas(d.error)
      })
      .catch(() => { setPlantillas([]); setErrorPlantillas('No se pudieron cargar las plantillas') })
  }, [])

  const cuerpo = elegida?.components?.find(c => c.type === 'BODY')?.text || ''
  const variables = variablesDe(cuerpo)
  const header = elegida?.components?.find(c => c.type === 'HEADER')
  const necesitaImagen = header?.format === 'IMAGE'

  const elegirPlantilla = (p) => {
    setElegida(p)
    const vars = variablesDe(p.components?.find(c => c.type === 'BODY')?.text)
    // La primera variable casi siempre es el nombre
    setValores(vars.map((_, i) => (i === 0 ? TOKEN_NOMBRE : '')))
    const ejemplo = p.components?.find(c => c.type === 'HEADER')?.example?.header_handle?.[0]
    setImagenUrl(ejemplo?.startsWith('http') ? ejemplo : '')
  }

  const puedeEnviar = modo === 'plantilla'
    ? elegida && valores.every(v => v.trim()) && (!necesitaImagen || imagenUrl.trim())
    : texto.trim()

  const enviar = async () => {
    if (!puedeEnviar || enviando) return
    setEnviando(true)
    try {
      if (modo === 'plantilla') {
        const res = await fetch('/api/plantillas/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre_plantilla: elegida.name, prospectos_ids: prospectos.map(p => p.id), valores, imagen_url: imagenUrl.trim() || null })
        })
        const datos = await res.json()
        setResultado(res.ok ? datos : { enviados: 0, fallidos: [{ nombre: 'Envío', error: datos.error || 'Error desconocido' }] })
      } else {
        let enviados = 0
        const fallidos = []
        for (const p of prospectos) {
          const plataforma = ['messenger', 'instagram'].includes(p.canal) ? p.canal : 'whatsapp'
          try {
            const res = await fetch('/api/enviar-mensaje', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ to: p.telefono, text: texto.split(TOKEN_NOMBRE).join(p.nombre_alumno || p.nombre || ''), plataforma })
            })
            if (res.ok) enviados++
            else fallidos.push({ nombre: p.nombre_alumno || p.nombre || p.telefono, error: (await res.json()).error || 'No se entregó' })
          } catch (e) {
            fallidos.push({ nombre: p.nombre_alumno || p.nombre || p.telefono, error: e.message })
          }
        }
        setResultado({ enviados, fallidos })
      }
    } catch (e) {
      setResultado({ enviados: 0, fallidos: [{ nombre: 'Envío', error: e.message }] })
    } finally {
      setEnviando(false)
    }
  }

  const ejemplo = prospectos[0]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={alCerrar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#1e3a8a] flex items-center gap-2">
              <span className="material-symbols-outlined">send</span>
              Enviar mensaje
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {prospectos.length === 1 ? (ejemplo.nombre_alumno || ejemplo.nombre || ejemplo.telefono) : `${prospectos.length} personas seleccionadas`}
            </p>
          </div>
          <button onClick={alCerrar} aria-label="Cerrar" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {resultado ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <p className={`text-sm font-bold ${resultado.fallidos.length === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {resultado.enviados} enviado(s){resultado.fallidos.length > 0 ? `, ${resultado.fallidos.length} con error` : ''}.
            </p>
            {resultado.fallidos.length > 0 && (
              <ul className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
                {resultado.fallidos.map((f, i) => <li key={i}><strong>{f.nombre}:</strong> {f.error}</li>)}
              </ul>
            )}
            {modo === 'mensaje' && resultado.fallidos.length > 0 && (
              <p className="text-xs text-slate-500">Si no te escribieron en las últimas 24 horas, envíales una plantilla.</p>
            )}
            <button onClick={alCerrar} className="w-full py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                {[['plantilla', 'Plantilla'], ['mensaje', 'Mensaje libre']].map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    onClick={() => setModo(valor)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${modo === valor ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {modo === 'plantilla'
                  ? 'Llega aunque la persona nunca te haya escrito.'
                  : 'Solo llega si la persona te escribió en las últimas 24 horas.'}
              </p>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {modo === 'plantilla' ? (
                plantillas === null ? (
                  <p className="text-sm text-slate-400">Cargando plantillas...</p>
                ) : plantillas.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
                    {errorPlantillas || 'No hay plantillas aprobadas.'} Créalas en Campañas → Plantillas.
                  </p>
                ) : (
                  <>
                    <select
                      value={elegida?.name || ''}
                      onChange={e => elegirPlantilla(plantillas.find(p => p.name === e.target.value))}
                      aria-label="Plantilla"
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="" disabled>Elige una plantilla aprobada</option>
                      {plantillas.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>

                    {elegida && (
                      <>
                        {variables.map((v, i) => (
                          <label key={v} className="block">
                            <span className="text-[11px] font-bold text-slate-500">{`Variable {{${v}}}`}</span>
                            <input
                              value={valores[i] || ''}
                              onChange={e => setValores(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                        ))}
                        {variables.length > 0 && (
                          <p className="text-[11px] text-slate-400">Escribe {TOKEN_NOMBRE} para usar el nombre de cada persona.</p>
                        )}
                        {necesitaImagen && (
                          <label className="block">
                            <span className="text-[11px] font-bold text-slate-500">URL de la imagen del encabezado</span>
                            <input
                              value={imagenUrl}
                              onChange={e => setImagenUrl(e.target.value)}
                              placeholder="https://..."
                              className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                          </label>
                        )}
                        <div className="bg-[#d9fdd3] rounded-xl p-3 text-[13px] text-[#111b21] whitespace-pre-wrap">
                          <span className="block text-[10px] font-bold text-slate-500 mb-1">Vista previa</span>
                          {textoFinal(elegida, valores, ejemplo)}
                        </div>
                      </>
                    )}
                  </>
                )
              ) : (
                <>
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    rows={5}
                    placeholder={`Hola ${TOKEN_NOMBRE}, ...`}
                    aria-label="Mensaje"
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                  <p className="text-[11px] text-slate-400">Escribe {TOKEN_NOMBRE} para usar el nombre de cada persona.</p>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button onClick={alCerrar} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Cancelar</button>
              <button
                onClick={enviar}
                disabled={!puedeEnviar || enviando}
                className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span className={`material-symbols-outlined text-[18px] ${enviando ? 'animate-spin' : ''}`}>{enviando ? 'progress_activity' : 'send'}</span>
                {enviando ? 'Enviando...' : `Enviar a ${prospectos.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

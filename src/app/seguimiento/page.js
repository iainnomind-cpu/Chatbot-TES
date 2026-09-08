'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ETAPAS = [
  '1. Prospecto nuevo',
  '2. Contactado',
  '3. Lead calificado',
  '4. DX / Cita agendada',
  '5. DX / Cita asistida',
  '6. Inscripción',
]

export default function PaginaSeguimiento() {
  const [tabActivo, setTabActivo] = useState('prospectos')
  const [mesActual, setMesActual] = useState(new Date().toISOString().substring(0, 7))
  const [datos, setDatos] = useState({ prospectos: [], cortes: [], total: 0 })
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  const cargarDatos = async () => {
    setCargando(true)
    try {
      const res = await fetch(`/api/seguimiento?mes=${mesActual}`)
      const data = await res.json()
      setDatos(data)
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [mesActual])

  const exportarExcel = () => {
    window.location.href = `/api/seguimiento/exportar?mes=${mesActual}`
  }

  const actualizarProspecto = async (id, campo, valor) => {
    const backup = [...datos.prospectos]
    const nuevos = datos.prospectos.map(p => p.id === id ? { ...p, [campo]: valor } : p)
    setDatos(prev => ({ ...prev, prospectos: nuevos }))
    
    try {
      const res = await fetch('/api/seguimiento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [campo]: valor })
      })
      if (!res.ok) throw new Error('Error al actualizar')
      // Recargar datos para recalcular los cortes
      cargarDatos()
    } catch (err) {
      console.error(err)
      setDatos(prev => ({ ...prev, prospectos: backup })) // Rollback en caso de error
      alert('Hubo un error al actualizar.')
    }
  }

  return (
    <div className="p-6 md:p-12 max-w-7xl mx-auto space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#191c1d]">Seguimiento</h1>
          <p className="text-[#444651] mt-2 text-lg">Funnel de conversión y prospectos en seguimiento.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="month" 
            value={mesActual} 
            onChange={e => setMesActual(e.target.value)}
            className="border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#00236f] focus:border-transparent outline-none py-2.5 px-4 shadow-sm"
          />
          <button 
            onClick={exportarExcel}
            className="flex items-center gap-2 bg-[#00a884] text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-[#00a884]/20 hover:bg-[#009675] transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200 mb-6">
        <button 
          onClick={() => setTabActivo('prospectos')}
          className={`py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tabActivo === 'prospectos' ? 'border-[#00236f] text-[#00236f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Prospectos ({datos.total})
        </button>
        <button 
          onClick={() => setTabActivo('cortes')}
          className={`py-3 px-1 border-b-2 font-bold text-sm transition-colors ${tabActivo === 'cortes' ? 'border-[#00236f] text-[#00236f]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          Cortes Semanales
        </button>
      </div>

      {cargando ? (
        <div className="text-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#00236f] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Cargando datos...</p>
        </div>
      ) : tabActivo === 'prospectos' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold sticky top-0">
              <tr>
                <th className="p-4 border-b">Fecha Ingreso</th>
                <th className="p-4 border-b">Nombre</th>
                <th className="p-4 border-b">Fuente</th>
                <th className="p-4 border-b">Etapa Funnel</th>
                <th className="p-4 border-b">Próximo Seg.</th>
                <th className="p-4 border-b">Última Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.prospectos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-slate-500">{p.creado_en?.split('T')[0]}</td>
                  <td className="p-4 font-bold text-slate-800">{p.nombre_alumno || p.nombre}</td>
                  <td className="p-4 text-slate-500">{p.fuente || 'Desconocida'}</td>
                  <td className="p-4">
                    <select
                      value={p.etapa_funnel || '1. Prospecto nuevo'}
                      onChange={(e) => actualizarProspecto(p.id, 'etapa_funnel', e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg text-sm py-1.5 px-3 focus:ring-[#00236f] focus:border-[#00236f] w-full max-w-[200px]"
                    >
                      {ETAPAS.map(etapa => <option key={etapa} value={etapa}>{etapa}</option>)}
                    </select>
                  </td>
                  <td className="p-4">
                    <input 
                      type="date" 
                      value={p.proximo_seguimiento || ''}
                      onChange={(e) => actualizarProspecto(p.id, 'proximo_seguimiento', e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg text-sm py-1.5 px-3"
                    />
                  </td>
                  <td className="p-4">
                    <input 
                      type="text" 
                      placeholder="Ej. Se le envió info..."
                      value={p.ultima_accion || ''}
                      onBlur={(e) => {
                        if (e.target.value !== p.ultima_accion) {
                           actualizarProspecto(p.id, 'ultima_accion', e.target.value)
                        }
                      }}
                      onChange={(e) => {
                         const backup = [...datos.prospectos]
                         const nuevos = datos.prospectos.map(x => x.id === p.id ? { ...x, ultima_accion: e.target.value } : x)
                         setDatos(prev => ({ ...prev, prospectos: nuevos }))
                      }}
                      className="bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#00236f] outline-none text-sm w-full py-1 transition-colors"
                    />
                  </td>
                </tr>
              ))}
              {datos.prospectos.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">No hay prospectos en este mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold">
              <tr>
                <th className="p-4 border-b">Indicador</th>
                <th className="p-4 border-b text-center">Semana 1</th>
                <th className="p-4 border-b text-center">Semana 2</th>
                <th className="p-4 border-b text-center">Semana 3</th>
                <th className="p-4 border-b text-center">Semana 4+</th>
                <th className="p-4 border-b text-center text-[#00236f] font-bold">Total Mensual</th>
                <th className="p-4 border-b text-center text-emerald-600 font-bold">% Conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.cortes.map((corte, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="p-4 font-bold text-slate-700">{corte.etapa}</td>
                  {corte.semanales.map((sem, j) => (
                    <td key={j} className="p-4 text-center text-slate-500">{sem}</td>
                  ))}
                  <td className="p-4 text-center font-bold text-[#00236f]">{corte.total}</td>
                  <td className="p-4 text-center font-bold text-emerald-600">
                    {corte.pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

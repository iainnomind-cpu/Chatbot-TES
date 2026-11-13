'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cambiarEstadoProspecto } from '@/lib/prospectoSync'
import { useNotifications } from '@/componentes/NotificationProvider'
import ModalFormulario from '@/componentes/ModalFormulario'
import ModalEnviarMensaje from '@/componentes/ModalEnviarMensaje'

const ESTADOS_BASE = ['nuevo', 'contactado', 'en_proceso', 'agendado']
const SIN_ANUNCIO = '__sin_anuncio__'
const SIN_CURSO = '__sin_curso__'
const cursoDe = (p) => {
  const c = (p.curso_interes || '').trim()
  return c && !['desconocido', 'por definir', 'n/a'].includes(c.toLowerCase()) ? c : null
}
const OPCIONES_SCORE = [
  { valor: 'caliente', etiqueta: '🔥 Caliente', activo: 'bg-red-100 text-red-700 border-red-200' },
  { valor: 'tibio', etiqueta: '🌡️ Tibio', activo: 'bg-amber-100 text-amber-700 border-amber-200' },
  { valor: 'frio', etiqueta: '❄️ Frío', activo: 'bg-blue-100 text-blue-700 border-blue-200' },
  { valor: 'sin_score', etiqueta: 'Sin score', activo: 'bg-slate-200 text-slate-700 border-slate-300' },
]

// Los valores en BD varían en mayúsculas y acentos ("Borrador", "agendado", "FRÍO")
const normalizar = (valor) => (valor || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const nombreAnuncio = (p) => p.conversaciones?.find(c => c.anuncios?.nombre)?.anuncios.nombre || null

function ContenidoProspectos() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [prospectos, setProspectos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [filtroAnuncio, setFiltroAnuncio] = useState('Todos')
  const [filtroCurso, setFiltroCurso] = useState('Todos')
  const [agruparPor, setAgruparPor] = useState('estado') // Columnas del Kanban: 'estado' | 'curso'
  const [filtroScores, setFiltroScores] = useState([]) // Vacío = todos los scores
  const [prospectoSeleccionado, setProspectoSeleccionado] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [prospectoEditando, setProspectoEditando] = useState(null)
  const [vista, setVista] = useState('tabla') // Lista por defecto
  const [idsMarcados, setIdsMarcados] = useState([])
  const [destinatarios, setDestinatarios] = useState(null) // Prospectos del modal de envío
  const { setUltimoToast } = useNotifications()

  const camposProspecto = [
    { nombre: 'nombre_alumno', etiqueta: 'Nombre del Alumno', tipo: 'text', placeholder: 'Ej: Carlos Ruiz', requerido: true },
    { nombre: 'nombre', etiqueta: 'Nombre del Tutor/Contacto', tipo: 'text', placeholder: 'Ej: María Ruiz' },
    { nombre: 'telefono', etiqueta: 'Teléfono (WhatsApp)', tipo: 'text', placeholder: '521...', requerido: true },
    { nombre: 'curso_interes', etiqueta: 'Curso de Interés', tipo: 'text', placeholder: 'Ej: Children' },
    { nombre: 'parentesco', etiqueta: 'Relación con el Alumno', tipo: 'text', placeholder: 'Ej: Para mi hijo, Para mí' },
    { nombre: 'canal', etiqueta: 'Canal de Procedencia', tipo: 'text', placeholder: 'Messenger / Instagram / WhatsApp' },
    { nombre: 'edad', etiqueta: 'Edad', tipo: 'number', placeholder: 'Ej: 8' },
    { nombre: 'nivel', etiqueta: 'Nivel', tipo: 'text', placeholder: 'Ej: Básico' },
    { 
      nombre: 'estado', etiqueta: 'Estado', tipo: 'select', 
      opciones: [
        { valor: 'Borrador', etiqueta: 'Borrador' },
        { valor: 'Contactado', etiqueta: 'Contactado' },
        { valor: 'Interesado', etiqueta: 'Interesado' },
        { valor: 'Agendado', etiqueta: 'Agendado' },
        { valor: 'Convertido', etiqueta: 'Convertido' },
        { valor: 'Perdido', etiqueta: 'Perdido' },
      ]
    },
    {
      nombre: 'lead_score', etiqueta: 'Score', tipo: 'select',
      opciones: [
        { valor: '', etiqueta: 'Sin Score' },
        { valor: 'CALIENTE', etiqueta: 'Caliente' },
        { valor: 'TIBIO', etiqueta: 'Tibio' },
        { valor: 'FRIO', etiqueta: 'Frío' },
      ]
    }
  ]
  
  const cargarProspectos = async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('prospectos')
      .select('*, citas(id, fecha, hora, estado), conversaciones(id, id_plataforma, ultimo_mensaje, anuncio_id, anuncios(id, nombre))')
      .order('creado_en', { ascending: false })
      
    if (!error && data) {
      setProspectos(data)
    }
    setCargando(false)
  }

  const handleCambiarEstado = async (id, nuevoEstado) => {
    try {
      await cambiarEstadoProspecto(id, nuevoEstado)
      setUltimoToast({
        tipo: 'exito',
        titulo: 'Estado Actualizado',
        mensaje: `El prospecto ahora está en: ${nuevoEstado}`
      })
      cargarProspectos()
    } catch (error) {
      console.error('Error:', error)
      setUltimoToast({
        tipo: 'error',
        titulo: 'Error',
        mensaje: 'No se pudo actualizar el estado'
      })
    }
  }

  const handleDeleteProspecto = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este prospecto? Las conversaciones se mantendrán pero dejarán de estar vinculadas a este registro. Esta acción no se puede deshacer.')) return
    try {
      const res = await fetch(`/api/prospectos?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error desconocido')
      }
      setUltimoToast({ tipo: 'exito', titulo: 'Eliminado', mensaje: 'Prospecto eliminado correctamente' })
      setProspectoSeleccionado(null)
      cargarProspectos()
    } catch (error) {
      console.error('Error eliminando:', error)
      setUltimoToast({ tipo: 'error', titulo: 'Error', mensaje: error.message || 'No se pudo eliminar el prospecto' })
    }
  }

  const handleGuardarProspecto = async (datos) => {
    try {
      // Extraer solo columnas reales de la tabla prospectos
      // (quitar relaciones JOIN como citas, conversaciones, y campos auto-generados)
      const {
        citas,
        conversaciones,
        id,
        creado_en,
        actualizado_en,
        ...datosSinRelaciones
      } = datos

      // Asegurar que "nombre" no sea null para la base de datos (por si dejan vacío el campo tutor)
      if (!datosSinRelaciones.nombre || datosSinRelaciones.nombre.trim() === '') {
        datosSinRelaciones.nombre = datosSinRelaciones.nombre_alumno || 'Desconocido'
      }

      if (prospectoEditando) {
        const { error } = await supabase
          .from('prospectos')
          .update(datosSinRelaciones)
          .eq('id', prospectoEditando.id)
        if (error) throw error
        setUltimoToast({ tipo: 'exito', titulo: 'Actualizado', mensaje: 'Prospecto actualizado correctamente' })
      } else {
        const { error } = await supabase.from('prospectos').insert([datosSinRelaciones])
        if (error) throw error
        setUltimoToast({ tipo: 'exito', titulo: 'Creado', mensaje: 'Prospecto creado correctamente' })
      }
      setModalAbierto(false)
      cargarProspectos()
    } catch (error) {
      console.error('Error guardando:', error)
      setUltimoToast({ tipo: 'error', titulo: 'Error', mensaje: error.message || 'No se pudo guardar la información' })
    }
  }

  useEffect(() => {
    cargarProspectos()
    
    // Suscripción en tiempo real para nuevos prospectos o cambios
    const canal = supabase
      .channel('cambios-prospectos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospectos' }, () => {
        cargarProspectos()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  // Revisar si viene un ID en la URL para abrir el prospecto automáticamente
  useEffect(() => {
    if (prospectos.length > 0) {
      const queryId = searchParams.get('id')
      if (queryId) {
        // En supabase los ids pueden ser enteros o uuids, comparamos con string también
        const encontrado = prospectos.find(p => p.id === parseInt(queryId) || p.id == queryId)
        if (encontrado) {
          setProspectoSeleccionado(encontrado)
          // Limpiar la URL sin recargar
          router.replace('/prospectos', { scroll: false })
        }
      }
    }
  }, [prospectos, searchParams, router])

  const exportarCSV = () => {
    const csvHeader = 'Alumno,Contacto/Tutor,Parentesco,Teléfono,Curso,Edad,Nivel,Estado,Lead Score,Anuncio,Creado\n'
    const csvRows = prospectosFiltrados.map(p =>
      `"${p.nombre_alumno || ''}","${p.nombre || ''}","${p.parentesco || ''}","${p.telefono || ''}","${p.curso_interes || ''}","${p.edad || ''}","${p.nivel || ''}","${p.estado || ''}","${p.lead_score || ''}","${nombreAnuncio(p) || ''}","${p.creado_en || ''}"`
    ).join('\n')
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `prospectos_totalenglish_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Lógica de manipulación HTML5 Drag & Drop simple (funcionalidad base opcional)
  const onDragStart = (e, id) => { e.dataTransfer.setData('prospectoId', id) }
  const onDragOver = (e) => { e.preventDefault() }
  const onDrop = (e, nuevoEstado) => {
    e.preventDefault()
    // Agrupado por curso, arrastrar no cambia nada: las columnas no son estados
    if (agruparPor !== 'estado') return
    const id = e.dataTransfer.getData('prospectoId')
    if (id) { handleCambiarEstado(id, nuevoEstado) }
  }

  // Opciones de anuncio con su conteo, a partir de los prospectos cargados
  const conteoAnuncios = {}
  prospectos.forEach(p => {
    const nombre = nombreAnuncio(p)
    if (nombre) conteoAnuncios[nombre] = (conteoAnuncios[nombre] || 0) + 1
  })
  const opcionesAnuncio = Object.keys(conteoAnuncios).sort((a, b) => a.localeCompare(b, 'es'))
  const totalSinAnuncio = prospectos.filter(p => !nombreAnuncio(p)).length

  // Opciones de curso con su conteo (programa de interés)
  const conteoCursos = {}
  prospectos.forEach(p => {
    const curso = cursoDe(p)
    if (curso) conteoCursos[curso] = (conteoCursos[curso] || 0) + 1
  })
  const opcionesCurso = Object.keys(conteoCursos).sort((a, b) => a.localeCompare(b, 'es'))
  const totalSinCurso = prospectos.filter(p => !cursoDe(p)).length

  // Incluye los estados reales en BD (ej. "Borrador" que crea el webhook), no solo los base
  const estadosDisponibles = [...new Set([...ESTADOS_BASE, ...prospectos.map(p => normalizar(p.estado))])].filter(Boolean)

  const hayFiltros = filtroEstado !== 'Todos' || filtroAnuncio !== 'Todos' || filtroCurso !== 'Todos' || filtroScores.length > 0

  const limpiarFiltros = () => {
    setFiltroEstado('Todos')
    setFiltroAnuncio('Todos')
    setFiltroCurso('Todos')
    setFiltroScores([])
  }

  const alternarScore = (score) => {
    setFiltroScores(prev => prev.includes(score) ? prev.filter(s => s !== score) : [...prev, score])
  }

  const prospectosFiltrados = prospectos.filter(p => {
    if (filtroEstado !== 'Todos' && normalizar(p.estado) !== filtroEstado) return false
    if (filtroAnuncio === SIN_ANUNCIO && nombreAnuncio(p)) return false
    if (filtroAnuncio !== 'Todos' && filtroAnuncio !== SIN_ANUNCIO && nombreAnuncio(p) !== filtroAnuncio) return false
    if (filtroScores.length > 0 && !filtroScores.includes(normalizar(p.lead_score) || 'sin_score')) return false
    if (filtroCurso === SIN_CURSO && cursoDe(p)) return false
    if (filtroCurso !== 'Todos' && filtroCurso !== SIN_CURSO && cursoDe(p) !== filtroCurso) return false
    return true
  })

  const columnaDe = (p) => agruparPor === 'curso' ? (cursoDe(p) || SIN_CURSO) : normalizar(p.estado)
  const columnasKanban = agruparPor === 'curso'
    ? [...new Set(prospectosFiltrados.map(columnaDe))].sort((a, b) => (a === SIN_CURSO) - (b === SIN_CURSO) || a.localeCompare(b, 'es'))
    : [...new Set([...ESTADOS_BASE, ...prospectosFiltrados.map(columnaDe)])].filter(Boolean)

  return (
    <div className="p-3 md:p-8 w-full flex h-[calc(100svh-65px-64px)] md:h-[calc(100svh-65px)] gap-6 overflow-hidden">
      
      {/* Columna Principal - Lista */}
      <div className={`flex-1 flex flex-col ${prospectoSeleccionado ? 'hidden lg:flex' : 'flex'}`}>
        <div className="flex flex-col gap-3 mb-4 md:mb-6">
          <div>
            <h2 className="text-3xl font-extrabold text-[#191c1d] tracking-tight">Directorio de Prospectos</h2>
            <p className="text-slate-500 text-sm mt-1">
              Gestiona a los alumnos y sus tutores de contacto.
            </p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => setVista(vista === 'tabla' ? 'kanban' : 'tabla')} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold rounded-xl transition-all">
              <span className="material-symbols-outlined text-lg">{vista === 'tabla' ? 'view_kanban' : 'table_rows'}</span>
              {vista === 'tabla' ? 'Vista Kanban' : 'Vista Lista'}
            </button>
            <button onClick={exportarCSV} className="flex items-center gap-2 px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-[#191c1d] text-sm font-semibold rounded-xl transition-all active:scale-95">
              <span className="material-symbols-outlined text-lg">file_download</span>
              Exportar
            </button>
            <button 
              onClick={() => { setProspectoEditando(null); setModalAbierto(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/20"
            >
              <span className="material-symbols-outlined text-lg">person_add</span>
              Nuevo Prospecto
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-3 overflow-x-auto shrink-0 w-fit max-w-full">
          {['Todos', ...estadosDisponibles].map(estado => (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`px-4 py-2 rounded-lg text-sm font-bold capitalize whitespace-nowrap transition-all ${
                filtroEstado === estado
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              {estado.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4 md:mb-6 shrink-0">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl pl-3 pr-1 max-w-full">
            <span className="material-symbols-outlined text-[16px] text-purple-600">campaign</span>
            <select
              value={filtroAnuncio}
              onChange={(e) => setFiltroAnuncio(e.target.value)}
              aria-label="Filtrar por anuncio"
              className="bg-transparent py-2 pr-1 text-sm font-semibold text-slate-700 outline-none max-w-[220px]"
            >
              <option value="Todos">Todas las campañas</option>
              {opcionesAnuncio.map(nombre => (
                <option key={nombre} value={nombre}>{nombre} ({conteoAnuncios[nombre]})</option>
              ))}
              <option value={SIN_ANUNCIO}>Sin anuncio ({totalSinAnuncio})</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl pl-3 pr-1 max-w-full">
            <span className="material-symbols-outlined text-[16px] text-blue-700">school</span>
            <select
              value={filtroCurso}
              onChange={(e) => setFiltroCurso(e.target.value)}
              aria-label="Filtrar por curso de interés"
              className="bg-transparent py-2 pr-1 text-sm font-semibold text-slate-700 outline-none max-w-[220px]"
            >
              <option value="Todos">Todos los cursos</option>
              {opcionesCurso.map(nombre => (
                <option key={nombre} value={nombre}>{nombre} ({conteoCursos[nombre]})</option>
              ))}
              <option value={SIN_CURSO}>Sin curso definido ({totalSinCurso})</option>
            </select>
          </div>

          {vista === 'kanban' && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {[['estado', 'Por estado'], ['curso', 'Por curso']].map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => setAgruparPor(valor)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${agruparPor === valor ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}

          {OPCIONES_SCORE.map(({ valor, etiqueta, activo }) => (
            <button
              key={valor}
              onClick={() => alternarScore(valor)}
              aria-pressed={filtroScores.includes(valor)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-all ${
                filtroScores.includes(valor) ? activo : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {etiqueta}
            </button>
          ))}

          <span className="text-xs font-semibold text-slate-500 ml-1">
            {prospectosFiltrados.length} de {prospectos.length}
          </span>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="text-xs font-bold text-blue-700 hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>

        {idsMarcados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl shrink-0">
            <span className="text-sm font-bold text-blue-900">{idsMarcados.length} seleccionado(s)</span>
            <button
              onClick={() => setDestinatarios(prospectos.filter(p => idsMarcados.includes(p.id)))}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a8a] text-white text-xs font-bold rounded-lg hover:bg-blue-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              Enviar mensaje o plantilla
            </button>
            <button onClick={() => setIdsMarcados([])} className="text-xs font-bold text-blue-700 hover:underline">
              Quitar selección
            </button>
          </div>
        )}

        {vista === 'tabla' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead className="bg-[#f8f9fa] sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="pl-6 py-4 w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los filtrados"
                      checked={prospectosFiltrados.length > 0 && prospectosFiltrados.every(p => idsMarcados.includes(p.id))}
                      onChange={e => setIdsMarcados(e.target.checked ? prospectosFiltrados.map(p => p.id) : [])}
                      className="w-4 h-4 accent-blue-700 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Alumno (Prospecto)</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Contacto Origen</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Curso / Interés</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Estado</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Acciones Rápidas</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Anuncio</th>
                  <th className="px-6 py-4 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400"><span className="material-symbols-outlined animate-spin align-middle mr-2">refresh</span>Cargando...</td></tr>
                ) : prospectosFiltrados.length === 0 ? (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-slate-400">No hay prospectos.</td></tr>
                ) : prospectosFiltrados.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => setProspectoSeleccionado(p)}
                    className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${prospectoSeleccionado?.id === p.id || idsMarcados.includes(p.id) ? 'bg-blue-50/80' : ''}`}
                  >
                    <td className="pl-6 py-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar a ${p.nombre_alumno || p.nombre}`}
                        checked={idsMarcados.includes(p.id)}
                        onChange={() => setIdsMarcados(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        className="w-4 h-4 accent-blue-700 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#191c1d]">
                        {p.nombre_alumno || p.nombre}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {p.edad ? `${p.edad} años` : 'Edad no def.'} • Nivel {p.nivel || '?'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-green-600">message</span>
                        {p.telefono}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 ml-5 flex items-center gap-1">
                        De: {p.nombre}
                        {p.canal && <span className="bg-slate-200 px-1.5 rounded-full text-[9px] uppercase font-bold text-slate-600 ml-1">{p.canal}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700 font-medium">
                        {p.curso_interes || 'Por definir'}
                      </span>
                    </td>
                     <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${
                        p.estado === 'agendado' ? 'bg-green-100 text-green-700' :
                        p.estado === 'en_proceso' ? 'bg-blue-100 text-blue-700' :
                        p.estado === 'contactado' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCambiarEstado(p.id, 'contactado'); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                          title="Marcar como Contactado"
                        >
                          <span className="material-symbols-outlined text-[18px]">call</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCambiarEstado(p.id, 'en_proceso'); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                          title="Mover a En Proceso"
                        >
                          <span className="material-symbols-outlined text-[18px]">cached</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCambiarEstado(p.id, 'agendado'); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700 transition-colors"
                          title="Marcar como Agendado"
                        >
                          <span className="material-symbols-outlined text-[18px]">event_available</span>
                        </button>
                        <div className="w-[1px] h-4 bg-slate-200 mx-0.5"></div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteProspecto(p.id); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Eliminar Prospecto"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {/* Badge anuncio CTWA */}
                      {nombreAnuncio(p) ? (
                        <span className="inline-flex items-center gap-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          <span className="material-symbols-outlined" style={{fontSize:'10px'}}>campaign</span>
                          {nombreAnuncio(p)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded inline-block text-[10px] font-black uppercase tracking-wider ${
                        p.lead_score === 'CALIENTE' ? 'text-red-600 bg-red-50' : 
                        p.lead_score === 'TIBIO' ? 'text-amber-600 bg-amber-50' : 
                        'text-slate-400 bg-slate-50'
                      }`}>
                        {p.lead_score || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
        /* VISTA KANBAN */
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4 items-start">
          {columnasKanban.map(columna => {
            const items = prospectosFiltrados.filter(p => columnaDe(p) === columna);
            const tituloColumna = agruparPor === 'curso' ? (columna === SIN_CURSO ? 'Sin curso definido' : columna) :
                                  columna === 'nuevo' ? 'Nuevos Leads' :
                                  columna === 'contactado' ? 'Contactados' :
                                  columna === 'en_proceso' ? 'En Negociación' :
                                  columna === 'agendado' ? 'Inscritos / Agendados' : columna.replace('_', ' ');
            const colorColumna = columna === 'contactado' ? 'border-amber-200' :
                                 columna === 'en_proceso' ? 'border-blue-200' :
                                 columna === 'agendado' ? 'border-green-200' : 'border-slate-200';
            const colorBg = columna === 'contactado' ? 'bg-amber-50/30' :
                            columna === 'en_proceso' ? 'bg-blue-50/30' :
                            columna === 'agendado' ? 'bg-green-50/30' : 'bg-slate-50';
            return (
              <div 
                key={columna} 
                className={`min-w-[280px] max-w-[300px] flex-1 flex flex-col rounded-2xl border ${colorColumna} ${colorBg} p-3 shrink-0 h-full`}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, columna)}
              >
                <div className="flex justify-between items-center mb-4 px-1">
                  <h3 className="font-bold text-slate-700 flex items-center gap-1.5 uppercase text-xs tracking-wider">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      columna === 'contactado' ? 'bg-amber-400' : columna === 'en_proceso' ? 'bg-blue-500' : columna === 'agendado' ? 'bg-green-500' : 'bg-slate-400'
                    }`}></span>
                    {tituloColumna}
                  </h3>
                  <span className="bg-white text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">{items.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 px-1 custom-scrollbar">
                  {items.map(p => (
                    <div 
                      key={p.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, p.id)}
                      onClick={() => setProspectoSeleccionado(p)}
                      className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group relative select-none"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-[#1e3a8a] text-sm leading-tight pr-4">{p.nombre_alumno || p.nombre}</span>
                        {p.lead_score && (
                           <div className={`w-2 h-2 rounded-full ring-2 ring-white absolute top-4 right-4 ${p.lead_score === 'CALIENTE' ? 'bg-red-500' : p.lead_score === 'TIBIO' ? 'bg-amber-400' : 'bg-slate-300'}`}></div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
                         <span className="material-symbols-outlined text-[13px] text-green-600">message</span> {p.telefono}
                      </div>
                      <div className="flex items-center justify-between mt-3 flex-wrap gap-1">
                         <span className="text-[10px] font-semibold bg-slate-100 px-2 py-1 rounded text-slate-600">
                           {p.curso_interes ? p.curso_interes.substring(0, 15) : 'Por definir'}
                         </span>
                         {p.nivel && <span className="text-[10px] text-slate-400 font-medium border border-slate-200 px-1.5 py-0.5 rounded">{p.nivel}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* Slide-over Detalles del Prospecto (FLOTANTE) */}
      {prospectoSeleccionado && (
        <>
          {/* Overlay oscuro de fondo */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setProspectoSeleccionado(null)}
          />
          
          <div className="fixed inset-x-0 bottom-0 md:top-20 md:right-4 md:bottom-4 md:left-auto w-full md:w-[400px] bg-white border border-slate-200 shadow-2xl rounded-t-2xl md:rounded-2xl flex flex-col z-50 bottom-sheet-enter md:animate-[slideInRight_0.3s_ease-out] overflow-hidden max-h-[90vh] md:max-h-none">
          {/* TAREA 5: Drag handle visible on mobile */}
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-slate-200 rounded-full" />
          </div>
          {/* Header Modal */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <h3 className="font-bold text-[#1e3a8a] flex items-center gap-2">
              <span className="material-symbols-outlined">badge</span>
              Expediente
            </h3>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => { setProspectoEditando(prospectoSeleccionado); setModalAbierto(true); }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-100 text-blue-600"
                title="Editar Prospecto"
              >
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
              <button 
                onClick={() => handleDeleteProspecto(prospectoSeleccionado.id)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-100 text-red-600"
                title="Eliminar Prospecto"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
              <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
              <button onClick={() => setProspectoSeleccionado(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-400">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Info Principal */}
            <div className="p-6 text-center border-b border-slate-100 relative">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-[#1e3a8a] to-[#0f172a] text-white flex items-center justify-center text-3xl font-bold shadow-md">
                {(prospectoSeleccionado.nombre_alumno || prospectoSeleccionado.nombre)?.[0]?.toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-[#191c1d] mt-4">
                {prospectoSeleccionado.nombre_alumno || prospectoSeleccionado.nombre}
              </h2>
              {prospectoSeleccionado.nombre_alumno && prospectoSeleccionado.nombre && prospectoSeleccionado.nombre !== prospectoSeleccionado.nombre_alumno && (
                <p className="text-xs text-slate-400 mt-0.5">Tutor: {prospectoSeleccionado.nombre}</p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  prospectoSeleccionado.estado === 'agendado' ? 'bg-green-100 text-green-700' : 
                  prospectoSeleccionado.estado === 'contactado' ? 'bg-blue-100 text-blue-700' :
                  prospectoSeleccionado.estado === 'en_proceso' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {prospectoSeleccionado.estado}
                </span>
                {prospectoSeleccionado.lead_score && (
                  <span className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                    prospectoSeleccionado.lead_score === 'CALIENTE' ? 'text-red-700 bg-red-100/50' : 
                    prospectoSeleccionado.lead_score === 'FRIO' ? 'text-blue-700 bg-blue-100/50' :
                    'text-amber-700 bg-amber-100/50'
                  }`}>
                    {prospectoSeleccionado.lead_score === 'CALIENTE' ? '🔥' : prospectoSeleccionado.lead_score === 'FRIO' ? '❄️' : '🌡️'} {prospectoSeleccionado.lead_score}
                  </span>
                )}
              </div>
              {/* Acciones rápidas */}
              <div className="flex items-center justify-center gap-2 mt-4">
                {prospectoSeleccionado.conversaciones?.[0] && (
                  <button 
                    onClick={() => window.location.href = `/inbox?id=${prospectoSeleccionado.conversaciones[0].id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-bold rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">chat</span>
                    Ir al Inbox
                  </button>
                )}
                <button
                  onClick={() => setDestinatarios([prospectoSeleccionado])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">send</span>
                  Enviar mensaje
                </button>
                <button 
                  onClick={() => { setProspectoEditando(prospectoSeleccionado); setModalAbierto(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  Editar
                </button>
                <button 
                  onClick={() => handleDeleteProspecto(prospectoSeleccionado.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                  Eliminar
                </button>
              </div>
            </div>

            {/* Perfil Académico */}
            <div className="p-6 border-b border-slate-100">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-4">Perfil Académico</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">Edad</span>
                  <span className="font-bold text-slate-800">{prospectoSeleccionado.edad ? `${prospectoSeleccionado.edad} años` : '—'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">Nivel</span>
                  <span className="font-bold text-slate-800">{prospectoSeleccionado.nivel || '—'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">Horario</span>
                  <span className="font-bold text-slate-800 capitalize">{prospectoSeleccionado.horario || '—'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-500 block mb-1">Parentesco</span>
                  <span className="font-bold text-slate-800">{prospectoSeleccionado.parentesco || '—'}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-blue-500 block mb-1">Canal de Origen</span>
                  <span className="font-bold text-blue-800 uppercase text-xs">{prospectoSeleccionado.canal || 'Desconocido'}</span>
                </div>
                {/* Anuncio CTWA de origen */}
                {prospectoSeleccionado.conversaciones?.[0]?.anuncio_id && prospectoSeleccionado.conversaciones?.[0]?.anuncios?.nombre && (
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 col-span-2">
                    <span className="text-[10px] text-purple-500 block mb-1">📢 Origen de Anuncio</span>
                    <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 font-bold text-xs px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined" style={{fontSize:'12px'}}>ads_click</span>
                      {prospectoSeleccionado.conversaciones[0].anuncios.nombre}
                    </span>
                  </div>
                )}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                  <span className="text-[10px] text-slate-500 block mb-1">Curso de Interés</span>
                  <span className="font-bold text-slate-800">{prospectoSeleccionado.curso_interes || '—'}</span>
                </div>
              </div>
            </div>

            {/* Contacto */}
            <div className="p-6 border-b border-slate-100">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Contacto</h4>
              <div className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <span className="material-symbols-outlined text-green-600 text-3xl">chat</span>
                <div className="flex-1">
                  <p className="font-bold text-[#191c1d] text-sm">{prospectoSeleccionado.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-slate-500 font-medium">{prospectoSeleccionado.telefono}</p>
                </div>
              </div>
              {/* Último mensaje si existe */}
              {prospectoSeleccionado.conversaciones?.[0]?.ultimo_mensaje && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 block mb-1">Último mensaje</span>
                  <p className="text-xs text-slate-600 truncate">{prospectoSeleccionado.conversaciones[0].ultimo_mensaje}</p>
                </div>
              )}
            </div>

            {/* Notas Internas */}
            <div className="p-6 border-b border-slate-100">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Notas Internas</h4>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 resize-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent outline-none"
                rows={3}
                placeholder="Escribe notas sobre este prospecto..."
                defaultValue={prospectoSeleccionado.notas_internas || ''}
                onBlur={async (e) => {
                  const val = e.target.value
                  if (val !== (prospectoSeleccionado.notas_internas || '')) {
                    await supabase.from('prospectos').update({ notas_internas: val }).eq('id', prospectoSeleccionado.id)
                    setUltimoToast({ tipo: 'exito', titulo: 'Nota guardada', mensaje: 'La nota se actualizó correctamente' })
                  }
                }}
              />
            </div>

            {/* Citas */}
            {prospectoSeleccionado.citas && prospectoSeleccionado.citas.length > 0 && (
              <div className="p-6 border-b border-slate-100">
                <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Historial de Citas</h4>
                <div className="space-y-2">
                  {prospectoSeleccionado.citas.map(cita => (
                    <div key={cita.id} className="flex justify-between items-center bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-lg">event</span>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{cita.fecha}</p>
                          <p className="text-[11px] text-slate-500">{cita.hora}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2 py-1 rounded font-bold uppercase ${
                        cita.estado === 'confirmada' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>{cita.estado}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="p-6">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Registro</h4>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Creado: {new Date(prospectoSeleccionado.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              {prospectoSeleccionado.actualizado_en && (
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="material-symbols-outlined text-[14px]">update</span>
                  Actualizado: {new Date(prospectoSeleccionado.actualizado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    )}

      {destinatarios && (
        <ModalEnviarMensaje
          prospectos={destinatarios}
          alCerrar={() => { setDestinatarios(null); cargarProspectos() }}
        />
      )}

      {/* Modal CRUD */}
      <ModalFormulario
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        titulo={prospectoEditando ? 'Editar Prospecto' : 'Nuevo Prospecto'}
        campos={camposProspecto}
        alEnviar={handleGuardarProspecto}
        textoBoton={prospectoEditando ? 'Guardar Cambios' : 'Crear Prospecto'}
        datosIniciales={prospectoEditando}
      />
    </div>
  )
}

export default function PaginaProspectos() {
  return (
    <Suspense fallback={<div className="p-10 flex items-center gap-2"><span className="material-symbols-outlined animate-spin">refresh</span> Cargando directorio...</div>}>
      <ContenidoProspectos />
    </Suspense>
  )
}

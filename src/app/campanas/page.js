'use client'

import { useState, useEffect } from 'react'
import ModalFormulario from '@/componentes/ModalFormulario'
import ConstructorPlantilla from '@/componentes/ConstructorPlantilla'


export default function PaginaCampanas() {
  const [campanas, setCampanas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [enviando, setEnviando] = useState(null)
  const [campanaEditando, setCampanaEditando] = useState(null)
  const [plantillasMeta, setPlantillasMeta] = useState([])
  const [cargandoMeta, setCargandoMeta] = useState(false)
  const [tabActivo, setTabActivo] = useState('campanas') // 'general', 'plantillas', 'campanas', 'audiencias'
  const [modoConstructor, setModoConstructor] = useState(false) // Para la vista de creación de audiencia
  const [mostrarConstructorPlantilla, setMostrarConstructorPlantilla] = useState(false)
  const [modalLanzar, setModalLanzar] = useState(null) // { ids: [], campanaId: '' }
  const [resultadoLanzar, setResultadoLanzar] = useState(null) // { ok, msg }

  // Estados para Audiencias
  const [prospectosAud, setProspectosAud] = useState([])
  const [cursosDisponibles, setCursosDisponibles] = useState([])
  const [audienciasGuardadas, setAudienciasGuardadas] = useState([])
  const [filtrosAud, setFiltrosAud] = useState({
    estado: 'Todos',
    curso: 'Todos',
    edad_min: '',
    edad_max: '',
    flexibilidad: 'Indistinto',
    score: 'Todos',
    canal: 'Todos'
  })
  const [prospectosSeleccionados, setProspectosSeleccionados] = useState([])

  // Estados para Anuncios CTWA
  const [anuncios, setAnuncios] = useState([])
  const [anunciosMetaActivos, setAnunciosMetaActivos] = useState([])
  const [cargandoAnunciosMeta, setCargandoAnunciosMeta] = useState(false)
  const [errorAnunciosMeta, setErrorAnunciosMeta] = useState('')
  const [modalAnuncio, setModalAnuncio] = useState(false)
  const [anuncioEditando, setAnuncioEditando] = useState(null)

  // 1. Obtener plantillas únicas ya utilizadas en el CRM
  const plantillasDelProyecto = [...new Set(campanas.map(c => c.nombre_plantilla).filter(Boolean))]

  // 2. Solo mostrar el estado de las que pertenecen a este proyecto
  const plantillasMostrar = plantillasMeta.filter(p => plantillasDelProyecto.includes(p.name))

  // 3. Opciones sugeridas para el autocompletado (Datalist)
  const plantillasSugeridas = plantillasDelProyecto.map(nombre => ({ valor: nombre }))

  const camposCampana = [
    { nombre: 'nombre', etiqueta: 'Nombre de la campaña', tipo: 'text', placeholder: 'Ej: Promoción Buen Fin', requerido: true },
    {
      nombre: 'canal', etiqueta: 'Canal de Envío', tipo: 'select', requerido: true,
      opciones: [
        { valor: 'whatsapp', etiqueta: 'WhatsApp' },
        { valor: 'messenger', etiqueta: 'Messenger' },
        { valor: 'instagram', etiqueta: 'Instagram' },
      ]
    },
    {
      nombre: 'nombre_plantilla',
      etiqueta: 'Plantilla de WhatsApp (Meta)',
      tipo: 'select',
      placeholder: '— Selecciona una plantilla aprobada —',
      opciones: [
        ...plantillasMeta
          .filter(p => p.status === 'APPROVED')
          .map(p => ({ valor: p.name, etiqueta: `✓ ${p.name}` })),
        ...plantillasMeta
          .filter(p => p.status !== 'APPROVED')
          .map(p => ({ valor: p.name, etiqueta: `⏳ ${p.name} (${p.status})` })),
      ],
      requerido: false
    },
    {
      nombre: 'audiencia_id', etiqueta: 'Audiencia Guardada (Segmento)', tipo: 'select', requerido: false,
      opciones: [
        { valor: '', etiqueta: 'Sin segmento — usar Audiencias Dinámicas' },
        ...audienciasGuardadas.map(a => ({ valor: a.id, etiqueta: `📍 ${a.nombre} (${a.total_estimado} pers.)` }))
      ]
    },
    { nombre: 'imagen_url', etiqueta: 'Imagen de la campaña (URL o archivo)', tipo: 'image_upload', placeholder: 'https://...', requerido: false },
    { nombre: 'mensaje', etiqueta: 'Notas Internas', tipo: 'textarea', placeholder: 'Notas sobre esta campaña...', requerido: false },
    {
      nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: false,
      opciones: [
        { valor: 'borrador', etiqueta: '📝 Borrador' },
        { valor: 'activa', etiqueta: '✅ Activa' },
        { valor: 'completada', etiqueta: '🏁 Completada' },
      ]
    },
  ]

  const cargarCampanas = async () => {
    setCargando(true)
    try {
      const respuesta = await fetch(`/api/campanas?t=${Date.now()}`, { cache: 'no-store' })
      const datos = await respuesta.json()
      setCampanas(Array.isArray(datos) ? datos : [])
    } catch (error) {
      console.error('Error al cargar campañas:', error)
    } finally {
      setCargando(false)
    }
  }

  const cargarPlantillasMeta = async () => {
    setCargandoMeta(true)
    try {
      const res = await fetch('/api/campanas/plantillas')
      const data = await res.json()
      if (data.plantillas) {
        setPlantillasMeta(data.plantillas)
      }
    } catch (e) {
      console.error('Error cargando plantillas meta:', e)
    } finally {
      setCargandoMeta(false)
    }
  }

  useEffect(() => {
    cargarCampanas()
    cargarPlantillasMeta()

    // Cargar base de datos prospectos para audiencias
    const cargarProspectos = async () => {
      try {
        const resp = await fetch('/api/prospectos?t=' + Date.now())
        const datos = await resp.json()
        setProspectosAud(Array.isArray(datos) ? datos : [])
      } catch (e) {
        console.error('Error cargando base prospectos', e)
      }
    }
    cargarProspectos()

    // Cargar cursos dinámicamente desde la BD
    const cargarCursos = async () => {
      try {
        const resp = await fetch('/api/cursos?t=' + Date.now())
        const datos = await resp.json()
        setCursosDisponibles(Array.isArray(datos) ? datos : [])
      } catch (e) {
        console.error('Error cargando cursos', e)
      }
    }
    cargarCursos()
    // Cargar audiencias guardadas
    const cargarAudiencias = async () => {
      try {
        const resp = await fetch('/api/audiencias')
        const datos = await resp.json()
        setAudienciasGuardadas(Array.isArray(datos) ? datos : [])
      } catch (e) {
        console.error('Error cargando audiencias', e)
      }
    }
    cargarAudiencias()

    // Cargar anuncios CTWA configurados
    const cargarAnuncios = async () => {
      try {
        const resp = await fetch('/api/anuncios')
        const datos = await resp.json()
        setAnuncios(Array.isArray(datos) ? datos : [])
      } catch (e) {
        console.error('Error cargando anuncios', e)
      }
    }
    cargarAnuncios()
  }, [])

  // Calculo dinamico de audiencia en tiempo real
  const prospectosFiltrados = prospectosAud.filter(p => {
    if (filtrosAud.estado !== 'Todos' && p.estado !== filtrosAud.estado) return false;
    if (filtrosAud.curso !== 'Todos' && p.curso_interes !== filtrosAud.curso) return false;
    if (filtrosAud.edad_min && p.edad && parseInt(p.edad) < parseInt(filtrosAud.edad_min)) return false;
    if (filtrosAud.edad_max && p.edad && parseInt(p.edad) > parseInt(filtrosAud.edad_max)) return false;
    if (filtrosAud.flexibilidad !== 'Indistinto' && p.horario) {
      const ph = p.horario.toLowerCase();
      if (filtrosAud.flexibilidad === 'Horario Fijo' && (!ph.includes('fijo') && !ph.includes('fija'))) return false;
      if (filtrosAud.flexibilidad === 'Horario Flexible' && !ph.includes('flex')) return false;
    }
    if (filtrosAud.score !== 'Todos' && (p.lead_score || '').toUpperCase() !== filtrosAud.score.toUpperCase()) return false;
    if (filtrosAud.canal !== 'Todos' && (p.canal || '').toLowerCase() !== filtrosAud.canal.toLowerCase()) return false;
    return true;
  })

  // Helpers de selección
  const toggleSeleccion = (id) => {
    setProspectosSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }
  const seleccionarTodos = () => setProspectosSeleccionados(prospectosFiltrados.map(p => p.id))
  const deseleccionarTodos = () => setProspectosSeleccionados([])
  const todosSeleccionados = prospectosFiltrados.length > 0 && prospectosFiltrados.every(p => prospectosSeleccionados.includes(p.id))

  const crearCampana = async (datos) => {
    try {
      const respuesta = await fetch('/api/campanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (respuesta.ok) {
        cargarCampanas()
        setModalAbierto(false)
      } else {
        const errorData = await respuesta.json()
        alert('Error del Servidor: ' + (errorData.error || 'Desconocido'))
      }
    } catch (e) {
      alert('Error al conectar: ' + e.message)
    }
  }

  const editarCampana = async (datos) => {
    try {
      const respuesta = await fetch('/api/campanas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campanaEditando.id, ...datos }),
      })
      if (respuesta.ok) {
        cargarCampanas()
        setModalAbierto(false)
        setCampanaEditando(null)
      } else {
        const errorData = await respuesta.json()
        alert('Error al actualizar: ' + (errorData.error || 'Desconocido'))
      }
    } catch (e) {
      alert('Error al conectar: ' + e.message)
    }
  }

  const eliminarCampana = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta campaña?')) return
    try {
      const respuesta = await fetch(`/api/campanas?id=${id}`, { method: 'DELETE' })
      if (respuesta.ok) {
        await cargarCampanas()
      } else {
        const errorData = await respuesta.json()
        alert('Error al eliminar: ' + (errorData.error || 'Desconocido'))
      }
    } catch (e) {
      alert('Error al conectar: ' + e.message)
    }
  }

  const dispararCampana = async (id) => {
    if (!confirm('⚠️ ESTO ENVIARÁ MENSAJES REALES POR WHATSAPP a todos los prospectos que cumplan los filtros base de esta campaña.\n\n¿Estás absolutamente seguro de continuar?')) return
    
    setEnviando(id)
    try {
      const respuesta = await fetch('/api/campanas/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      const resData = await respuesta.json()
      
      if (respuesta.ok) {
        alert(`✅ ¡Campaña Disparada!\nAudiencia encontrada: ${resData.alcance_esperado}\nMensajes enviados: ${resData.envios_exitosos}`)
        cargarCampanas()
      } else {
        alert('❌ Error al disparar: ' + (resData.error || 'Error desconocido'))
      }
    } catch (e) {
      alert('❌ Error de conexión al disparar campaña: ' + e.message)
    } finally {
      setEnviando(null)
    }
  }

  const dispararCampanaDinamica = () => {
    const ids = prospectosSeleccionados.length > 0 ? prospectosSeleccionados : null;
    if (!ids || ids.length === 0) return alert('No hay prospectos seleccionados. Marca al menos uno usando los checkboxes.');
    setResultadoLanzar(null)
    setModalLanzar({ ids, plantillaNombre: '' })
  }

  const ejecutarLanzamiento = async () => {
    if (!modalLanzar?.plantillaNombre) return
    // Buscar la campaña que usa esta plantilla
    const campanaRef = campanas.find(c => c.nombre_plantilla === modalLanzar.plantillaNombre)
    if (!campanaRef) return setResultadoLanzar({ ok: false, msg: '❌ No existe ninguna campaña configurada con esa plantilla. Crea una en la pestaña Campañas.' })
    setEnviando(campanaRef.id)
    try {
      const respuesta = await fetch('/api/campanas/ejecutar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campanaRef.id, prospectos_ids: modalLanzar.ids })
      })
      const resData = await respuesta.json()
      if (respuesta.ok) {
        setResultadoLanzar({ ok: true, msg: `✅ ¡Listo! Se procesaron ${resData.alcance_esperado} persona(s) y se enviaron ${resData.envios_exitosos} mensaje(s).` })
        setProspectosSeleccionados([])
        cargarCampanas()
      } else {
        setResultadoLanzar({ ok: false, msg: '❌ Error: ' + (resData.error || 'Error desconocido') })
      }
    } catch (e) {
      setResultadoLanzar({ ok: false, msg: '❌ Error de conexión: ' + e.message })
    } finally {
      setEnviando(null)
    }
  }

  const abrirEditar = (campana) => {
    setCampanaEditando(campana)
    setModalAbierto(true)
  }

  const guardarAudienciaActual = async () => {
    const nombre = prompt('Ingresa un nombre para este segmento de audiencia (ej: Interesados Young Adults 18-25):');
    if (!nombre) return;

    try {
      const resp = await fetch('/api/audiencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          filtro_estado: filtrosAud.estado,
          filtro_curso: filtrosAud.curso,
          filtro_edad_min: filtrosAud.edad_min,
          filtro_edad_max: filtrosAud.edad_max,
          filtro_flexibilidad: filtrosAud.flexibilidad,
          filtro_score: filtrosAud.score,
          filtro_canal: filtrosAud.canal,
          prospectos_incluidos: prospectosSeleccionados.length > 0 ? prospectosSeleccionados : null,
          total_estimado: prospectosSeleccionados.length > 0 ? prospectosSeleccionados.length : prospectosFiltrados.length
        })
      });

      if (resp.ok) {
        alert('✅ Audiencia guardada con éxito.');
        setModoConstructor(false);
        // Recargar audiencias
        const r2 = await fetch('/api/audiencias');
        const d2 = await r2.json();
        setAudienciasGuardadas(Array.isArray(d2) ? d2 : []);
      } else {
        const err = await resp.json();
        alert('❌ Error al guardar: ' + (err.error || 'Desconocido'));
      }
    } catch (e) {
      alert('❌ Error de conexión: ' + e.message);
    }
  }

  const eliminarAudiencia = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar este segmento de audiencia?')) return;
    try {
      const resp = await fetch(`/api/audiencias?id=${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setAudienciasGuardadas(audienciasGuardadas.filter(a => a.id !== id));
      } else {
        const err = await resp.json();
        alert('Error: ' + err.error);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const cambiarEstadoCampana = async (id, nuevoEstado) => {
    try {
      const resp = await fetch('/api/campanas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: nuevoEstado })
      });
      if (resp.ok) {
        cargarCampanas();
      }
    } catch (e) {
      console.error('Error cambiando estado', e);
    }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setCampanaEditando(null)
  }

  const datosMostrar = campanas;

  const estadisticas = {
    alcanceTotal: datosMostrar.reduce((sum, c) => sum + (c.alcance || 0), 0),
    activas: datosMostrar.filter(c => c.estado === 'activa').length,
    completadas: datosMostrar.filter(c => c.estado === 'completada').length,
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4 md:p-6 pb-20">
      
      {/* TÍTULO PRINCIPAL (estilo header blanco) */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#191c1d] flex items-center gap-2">
          <span className="material-symbols-outlined text-3xl text-blue-600">mail</span>
          Marketing Automation & Campañas
        </h1>
        <p className="text-slate-500 text-sm mt-1">Gestión de envíos masivos y nutrición de leads</p>
      </div>

      {/* CONTENEDOR PRINCIPAL BLANCO */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden min-h-[600px]">
        
        {/* NAVEGACIÓN POR PESTAÑAS (TABS) */}
        <div className="flex border-b border-slate-200 px-6">
          <button 
            className={`px-6 py-4 text-sm font-semibold flex items-center gap-2 transition-colors relative ${tabActivo === 'general' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTabActivo('general')}
          >
            <span className="material-symbols-outlined text-[20px]">monitoring</span>
            Vista General
            {tabActivo === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
          
          <button 
            className={`px-6 py-4 text-sm font-semibold flex items-center gap-2 transition-colors relative ${tabActivo === 'plantillas' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTabActivo('plantillas')}
          >
            <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
            Plantillas ({plantillasMostrar.length})
            {tabActivo === 'plantillas' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
          
          <button 
            className={`px-6 py-4 text-sm font-semibold flex items-center gap-2 transition-colors relative ${tabActivo === 'campanas' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTabActivo('campanas')}
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
            Campañas ({campanas.length})
            {tabActivo === 'campanas' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>

          <button 
            className={`px-6 py-4 text-sm font-semibold flex items-center gap-2 transition-colors relative ${tabActivo === 'audiencias' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTabActivo('audiencias')}
          >
            <span className="material-symbols-outlined text-[20px]">group_add</span>
            Audiencias Dinámicas
            {tabActivo === 'audiencias' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>

          <button 
            className={`px-6 py-4 text-sm font-semibold flex items-center gap-2 transition-colors relative ${tabActivo === 'anuncios' ? 'text-purple-600' : 'text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTabActivo('anuncios')}
          >
            <span className="material-symbols-outlined text-[20px]">campaign</span>
            Anuncios CTWA ({anuncios.length})
            {tabActivo === 'anuncios' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"></div>}
          </button>
        </div>

        {/* CONTENIDO DE LAS PESTAÑAS */}
        <div className="p-6 md:p-8">
          
          {/* TAB: VISTA GENERAL */}
          {tabActivo === 'general' && (
            <div className="animate-fade-in">
               <h2 className="text-xl font-bold text-slate-800 mb-6">Métricas Globales</h2>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl shadow-sm border border-blue-100 flex flex-col justify-center items-center">
                   <div className="p-3 bg-blue-100 text-blue-600 rounded-xl mb-3"><span className="material-symbols-outlined text-3xl">mark_email_read</span></div>
                   <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Alcance Real</p>
                   <p className="text-4xl font-black text-blue-700 mt-2">{estadisticas.alcanceTotal}</p>
                   <p className="text-xs text-slate-400 mt-1">Personas contactadas</p>
                 </div>
                 <div className="bg-gradient-to-br from-emerald-50 to-white p-6 rounded-2xl shadow-sm border border-emerald-100 flex flex-col justify-center items-center">
                   <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl mb-3"><span className="material-symbols-outlined text-3xl">task_alt</span></div>
                   <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Completadas</p>
                   <p className="text-4xl font-black text-emerald-700 mt-2">{estadisticas.completadas}</p>
                   <p className="text-xs text-slate-400 mt-1">Satisfechas exitosamente</p>
                 </div>
                 <div className="bg-gradient-to-br from-amber-50 to-white p-6 rounded-2xl shadow-sm border border-amber-100 flex flex-col justify-center items-center">
                   <div className="p-3 bg-amber-100 text-amber-600 rounded-xl mb-3"><span className="material-symbols-outlined text-3xl">pending_actions</span></div>
                   <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Configuradas</p>
                   <p className="text-4xl font-black text-amber-700 mt-2">{estadisticas.activas}</p>
                   <p className="text-xs text-slate-400 mt-1">Listas o en espera</p>
                 </div>
               </div>
            </div>
          )}

          {/* TAB: PLANTILLAS */}
          {tabActivo === 'plantillas' && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Plantillas WhatsApp (Meta Cloud)</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={cargarPlantillasMeta}
                    disabled={cargandoMeta}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <span className={`material-symbols-outlined text-sm ${cargandoMeta ? 'animate-spin' : ''}`}>refresh</span>
                    Actualizar
                  </button>
                  <button 
                    onClick={() => setMostrarConstructorPlantilla(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm shadow-blue-500/30"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Crear Plantilla
                  </button>
                </div>
              </div>
              
              {cargandoMeta ? (
                <div className="text-center py-10 text-slate-400 text-sm">Consultando Meta Business Manager...</div>
              ) : plantillasMeta.length === 0 ? (
                <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">speaker_notes_off</span>
                  <p>No se encontraron plantillas en tu cuenta de Meta.</p>
                  <p className="text-xs mt-1">Crea una nueva plantilla con el botón de arriba.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plantillasMeta.map(plt => {
                    const bodyComp = plt.components?.find(c => c.type === 'BODY')
                    const headerComp = plt.components?.find(c => c.type === 'HEADER')
                    const footerComp = plt.components?.find(c => c.type === 'FOOTER')
                    const buttonsComp = plt.components?.find(c => c.type === 'BUTTONS')
                    return (
                      <div key={plt.id} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <span className="font-bold text-slate-800 text-sm break-all" title={plt.name}>{plt.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shrink-0 ml-2 ${
                            plt.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                            plt.status === 'PENDING' ? 'bg-orange-100 text-orange-700' :
                            plt.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {plt.status === 'APPROVED' ? '✓ Aprobada' : plt.status === 'PENDING' ? '⏳ Pendiente' : plt.status === 'REJECTED' ? '✗ Rechazada' : plt.status}
                          </span>
                        </div>
                        {headerComp && (
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">{headerComp.format === 'IMAGE' ? 'image' : 'title'}</span>
                            {headerComp.format === 'IMAGE' ? 'Con imagen' : headerComp.text}
                          </div>
                        )}
                        {bodyComp && (
                          <p className="text-[12px] text-slate-600 leading-relaxed line-clamp-3 mb-2">{bodyComp.text}</p>
                        )}
                        {buttonsComp && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {buttonsComp.buttons?.map((b, i) => (
                              <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{b.text}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center text-slate-400 gap-1 text-xs font-medium">
                            <span className="material-symbols-outlined text-[14px]">language</span>
                            {plt.language === 'es_MX' ? 'Español MX' : plt.language}
                            <span className="mx-1">•</span>
                            <span className="material-symbols-outlined text-[14px]">category</span>
                            {plt.category}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: CAMPAÑAS */}
          {tabActivo === 'campanas' && (
            <div className="animate-fade-in space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-bold text-slate-800">Campañas Automatizadas</h2>
                <button
                  onClick={() => { setCampanaEditando(null); setModalAbierto(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm shadow-blue-500/30 flex items-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Nueva Campaña
                </button>
              </div>

              {cargando ? (
                <div className="text-center py-10">Cargando...</div>
              ) : datosMostrar.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">inbox</span>
                  <p>No tienes envíos configurados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {datosMostrar.map((campana) => {
                    const isRedes = campana.canal === 'messenger' || campana.canal === 'instagram';
                    const metaInfo = isRedes ? null : plantillasMeta.find(p => p.name === campana.nombre_plantilla);
                    const metaStatus = isRedes ? 'LISTO' : (metaInfo?.status || 'NOT_FOUND');
                    const isMetaApproved = isRedes ? true : (metaStatus === 'APPROVED');

                    return (
                      <div key={campana.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{campana.nombre}</h3>
                              <div className="flex gap-2 mt-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  campana.estado === 'activa' ? 'bg-green-50 text-green-600 border-green-200' : 
                                  campana.estado === 'borrador' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                  campana.estado === 'completada' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                  campana.estado === 'rechazada' ? 'bg-red-50 text-red-600 border-red-200' :
                                  'bg-blue-50 text-blue-600 border-blue-200'
                                }`}>
                                  {campana.estado}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1 ${
                                  isMetaApproved ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                                }`}>
                                  <span className="material-symbols-outlined text-[10px]">{isMetaApproved ? 'verified' : 'hourglass_empty'}</span>
                                  {isRedes ? `CANAL: ${campana.canal}` : `META: ${metaStatus}`}
                                </span>
                              </div>
                            </div>
                            
                            {/* BOTONES DE ACCIÓN DE CADA CAMPAÑA */}
                            <div className="flex items-center gap-1">
                              <button onClick={() => abrirEditar(campana)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button 
                                onClick={() => dispararCampana(campana.id)}
                                disabled={enviando === campana.id || !isMetaApproved}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${enviando === campana.id ? 'text-amber-500 bg-amber-50 animate-pulse' : !isMetaApproved ? 'text-slate-300 bg-slate-50 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-100 bg-blue-50'}`}
                                title={isMetaApproved ? `Lanzar Campaña por ${campana.canal || 'WhatsApp'}` : 'No se puede lanzar: La plantilla aún no está aprobada por Meta'}
                              >
                                <span className="material-symbols-outlined text-[18px]">{enviando === campana.id ? 'hourglass_top' : 'rocket_launch'}</span>
                              </button>
                              <button onClick={() => eliminarCampana(campana.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </div>

                          {/* ACCIÓN DE ENVÍO A REVISIÓN (INTERNA) */}
                          {['borrador', 'rechazada'].includes(campana.estado) && (
                            <div className="mb-4">
                                <button 
                                  onClick={() => cambiarEstadoCampana(campana.id, 'pendiente')}
                                  className="text-[10px] font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-200 transition-colors uppercase"
                                >
                                  Mandar a Revisión Interna
                                </button>
                            </div>
                          )}

                          {/* DETALLE DE AUDIENCIA Y PLANTILLA EN LA TARJETA */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-medium mb-5">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{isRedes ? 'MENSAJE / NOTA INTERNA' : 'PLANTILLA (META NAME)'}</span>
                              <span className="text-slate-700 bg-slate-50 px-2 py-1 rounded inline-block border border-slate-100 font-mono text-[11px] truncate max-w-xs">{isRedes ? (campana.mensaje || 'Sin mensaje') : (campana.nombre_plantilla || 'No configurada')}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">AUDIENCIA (FILTROS)</span>
                              <span className="text-slate-700 bg-blue-50/50 px-2 py-1 rounded inline-block border border-blue-100/50">
                                {campana.audiencia_id ? `📍 Segmento: ${audienciasGuardadas.find(a => a.id === campana.audiencia_id)?.nombre || 'Cargando...'}` : (
                                  <>
                                    {campana.publico_estado === 'Todos' && campana.publico_curso === 'Todos' ? 'Masiva (Toda la base)' : ''}
                                    {campana.publico_estado !== 'Todos' ? `Estado: ${campana.publico_estado} ` : ''}
                                    {campana.publico_curso !== 'Todos' ? `| Diplomado: ${campana.publico_curso}` : ''}
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                             <div className="flex gap-8">
                                <div className="text-center">
                                   <p className="text-2xl font-black text-blue-600">{campana.alcance || 0}</p>
                                   <p className="text-[10px] uppercase font-bold text-slate-400">Enviados</p>
                                </div>
                                <div className="text-center">
                                   <p className="text-2xl font-black text-emerald-500">{campana.alcance || 0}</p>
                                   <p className="text-[10px] uppercase font-bold text-slate-400">Entregados</p>
                                </div>
                                <div className="text-center border-l border-slate-100 pl-4 ml-4">
                                   <p className="text-2xl font-black text-amber-500">{campana.interacciones || 0}</p>
                                   <p className="text-[10px] uppercase font-bold text-slate-400">Clicks</p>
                                </div>
                             </div>
                             <div className="text-right">
                                <p className="text-xl font-black text-slate-700">
                                   {campana.alcance > 0 ? ((campana.interacciones || 0) / campana.alcance * 100).toFixed(1) : '0.0'}%
                                </p>
                                <p className="text-[10px] uppercase font-bold text-slate-400">CTR</p>
                             </div>
                          </div>
                          
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIENCIAS */}
          {tabActivo === 'audiencias' && (
            <div className="animate-fade-in space-y-6">
              {!modoConstructor ? (
                <>
                  <div className="flex justify-between items-center">
                     <h2 className="text-xl font-bold text-slate-800">Segmentos de Audiencia</h2>
                     <button 
                       onClick={() => setModoConstructor(true)}
                       className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                     >
                       <span className="material-symbols-outlined text-[20px]">add</span>
                       Nueva Audiencia
                     </button>
                  </div>
                  
                  {audienciasGuardadas.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-400">
                       <span className="material-symbols-outlined text-5xl mb-3">groups</span>
                       <p className="font-bold">Aún no tienes audiencias segmentadas.</p>
                       <p className="text-sm">Personaliza filtros y guárdalos para lanzar campañas precisas.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {audienciasGuardadas.map(aud => (
                         <div key={aud.id} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-4">
                               <div>
                                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{aud.nombre}</h3>
                                  <div className="flex items-center gap-1.5 mt-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                                     <span className="material-symbols-outlined text-[14px]">person</span>
                                     <span className="text-xs font-bold">{aud.total_estimado} contactos</span>
                                  </div>
                               </div>
                               <button 
                                 onClick={() => eliminarAudiencia(aud.id)}
                                 className="text-slate-300 hover:text-red-500 transition-colors"
                               >
                                 <span className="material-symbols-outlined text-[20px]">delete</span>
                               </button>
                            </div>
                            
                            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                               {aud.filtro_estado !== 'Todos' && (
                                 <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                    Estado: {aud.filtro_estado}
                                 </div>
                               )}
                               {aud.filtro_curso !== 'Todos' && (
                                 <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                    Curso: {aud.filtro_curso}
                                 </div>
                               )}
                               {(aud.filtro_edad_min || aud.filtro_edad_max) && (
                                 <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                    Edad: {aud.filtro_edad_min || 0} - {aud.filtro_edad_max || '∞'} años
                                 </div>
                               )}
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="animate-fade-in-up">
                  <div className="flex items-center gap-4 mb-6">
                    <button onClick={() => setModoConstructor(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 transition-colors">
                      <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Constructor de Audiencias</h2>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <span className="material-symbols-outlined text-blue-600">tune</span>
                          Filtros de Segmentación
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">Estado del Lead</label>
                            <select 
                              className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                              value={filtrosAud.estado} onChange={e => { setFiltrosAud({...filtrosAud, estado: e.target.value}); setProspectosSeleccionados([]); }}
                            >
                              <option>Todos</option>
                              <option value="Borrador">Borrador</option>
                              <option value="Contactado">Contactado</option>
                              <option value="Interesado">Interesado</option>
                              <option value="Agendado">Agendado</option>
                              <option value="Convertido">Convertido</option>
                              <option value="Perdido">Perdido</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">Diplomado de Interés</label>
                            <select 
                              className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                              value={filtrosAud.curso} onChange={e => { setFiltrosAud({...filtrosAud, curso: e.target.value}); setProspectosSeleccionados([]); }}
                            >
                              <option>Todos</option>
                              {cursosDisponibles.map(c => (
                                <option key={c.id} value={c.nombre}>{c.nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">🌡️ Temperatura del Lead (Score)</label>
                            <select 
                              className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                              value={filtrosAud.score} onChange={e => { setFiltrosAud({...filtrosAud, score: e.target.value}); setProspectosSeleccionados([]); }}
                            >
                              <option value="Todos">Todos los scores</option>
                              <option value="CALIENTE">🔴 Caliente</option>
                              <option value="TIBIO">🟡 Tibio</option>
                              <option value="FRIO">🔵 Frío</option>
                              <option value="">Sin score</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">📱 Canal de Procedencia</label>
                            <select 
                              className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                              value={filtrosAud.canal} onChange={e => { setFiltrosAud({...filtrosAud, canal: e.target.value}); setProspectosSeleccionados([]); }}
                            >
                              <option value="Todos">Todos los canales</option>
                              <option value="WhatsApp">WhatsApp</option>
                              <option value="Messenger">Messenger</option>
                              <option value="Instagram">Instagram</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">Edad Mínima</label>
                            <input type="number" placeholder="Ej: 5" className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold" value={filtrosAud.edad_min} onChange={e => { setFiltrosAud({...filtrosAud, edad_min: e.target.value}); setProspectosSeleccionados([]); }} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-slate-500">Edad Máxima</label>
                            <input type="number" placeholder="Ej: 18" className="border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all font-semibold" value={filtrosAud.edad_max} onChange={e => { setFiltrosAud({...filtrosAud, edad_max: e.target.value}); setProspectosSeleccionados([]); }} />
                          </div>
                        </div>
                      </div>

                      {prospectosFiltrados.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                              Audiencia ({prospectosFiltrados.length} personas)
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-medium">{prospectosSeleccionados.length} seleccionados</span>
                              <button
                                onClick={todosSeleccionados ? deseleccionarTodos : seleccionarTodos}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                {todosSeleccionados ? 'Desmarcar todos' : 'Seleccionar todos'}
                              </button>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                  <th className="w-10 px-4 py-3"></th>
                                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Nombre</th>
                                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Teléfono</th>
                                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Score</th>
                                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Canal</th>
                                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Estado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {prospectosFiltrados.map(p => {
                                  const seleccionado = prospectosSeleccionados.includes(p.id)
                                  const scoreColor = p.lead_score === 'CALIENTE' ? 'text-red-600 bg-red-50' : p.lead_score === 'TIBIO' ? 'text-amber-600 bg-amber-50' : p.lead_score === 'FRIO' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-50'
                                  const scoreIcon = p.lead_score === 'CALIENTE' ? '🔴' : p.lead_score === 'TIBIO' ? '🟡' : p.lead_score === 'FRIO' ? '🔵' : '–'
                                  return (
                                    <tr
                                      key={p.id}
                                      onClick={() => toggleSeleccion(p.id)}
                                      className={`cursor-pointer transition-colors ${seleccionado ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                                    >
                                      <td className="px-4 py-3 text-center">
                                        <input
                                          type="checkbox"
                                          checked={seleccionado}
                                          onChange={() => toggleSeleccion(p.id)}
                                          onClick={e => e.stopPropagation()}
                                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <p className="font-semibold text-slate-800">{p.nombre_alumno || p.nombre || '—'}</p>
                                        {p.nombre_alumno && p.nombre && <p className="text-xs text-slate-400">Tutor: {p.nombre}</p>}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.telefono}</td>
                                      <td className="px-4 py-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
                                          {scoreIcon} {p.lead_score || 'Sin score'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-slate-500 text-xs">{p.canal || '—'}</td>
                                      <td className="px-4 py-3">
                                        <span className="text-xs font-medium text-slate-500 capitalize">{p.estado || '—'}</span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div className="bg-gradient-to-br from-blue-600 to-[#00236f] p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
                        <span className="material-symbols-outlined text-[160px] absolute -right-10 -bottom-10 opacity-10">groups</span>
                        <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Filtrados</p>
                        <p className="text-6xl font-black relative z-10">{prospectosFiltrados.length}</p>
                        <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mt-4 mb-1 relative z-10">Seleccionados</p>
                        <p className="text-6xl font-black mb-5 relative z-10">{prospectosSeleccionados.length}</p>
                        <p className="text-sm text-blue-100/80 font-medium relative z-10 mb-6 leading-relaxed">
                          Usa los checkboxes para marcar exactamente a quién enviarás el mensaje.
                        </p>
                        <button 
                          onClick={guardarAudienciaActual}
                          disabled={prospectosFiltrados.length === 0}
                          className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all relative z-10 ${prospectosFiltrados.length === 0 ? 'bg-white/10 text-white/30' : 'bg-white text-blue-600 hover:bg-blue-50 shadow-lg'}`}
                        >
                          <span className="material-symbols-outlined text-[20px]">save</span>
                          Guardar Segmento
                        </button>

                        <button 
                          onClick={dispararCampanaDinamica}
                          disabled={prospectosSeleccionados.length === 0}
                          className={`w-full mt-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all relative z-10 border border-white/30 text-white hover:bg-white/10 ${prospectosSeleccionados.length === 0 ? 'opacity-30' : ''}`}
                        >
                          <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                          Lanzar a {prospectosSeleccionados.length} seleccionado(s)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* TAB: ANUNCIOS CTWA */}
      {tabActivo === 'anuncios' && (
        <div className="animate-fade-in space-y-6 p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-600">campaign</span>
                Anuncios Click-to-WhatsApp (CTWA)
              </h2>
              <p className="text-sm text-slate-500 mt-1">Cuando alguien toca tu anuncio de Facebook/Instagram y escribe por WhatsApp, el bot ya sabe de qué anuncio viene y responde directo.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={async () => {
                  setCargandoAnunciosMeta(true); setErrorAnunciosMeta('');
                  try {
                    const r = await fetch('/api/anuncios/meta-activos');
                    const d = await r.json();
                    if (d.error) setErrorAnunciosMeta(d.error);
                    else setAnunciosMetaActivos(d.anuncios || []);
                  } catch(e) { setErrorAnunciosMeta(e.message); }
                  finally { setCargandoAnunciosMeta(false); }
                }}
                disabled={cargandoAnunciosMeta}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
              >
                <span className={`material-symbols-outlined text-sm ${cargandoAnunciosMeta ? 'animate-spin' : ''}`}>refresh</span>
                {cargandoAnunciosMeta ? 'Cargando...' : 'Cargar Anuncios de Meta'}
              </button>
              <button
                onClick={() => { setAnuncioEditando(null); setModalAnuncio(true); }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm shadow-purple-500/30"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Configurar Anuncio
              </button>
            </div>
          </div>

          {/* Anuncios de Meta activos */}
          {anunciosMetaActivos.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-purple-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">ads_click</span>
                Anuncios Activos en tu Cuenta de Meta ({anunciosMetaActivos.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {anunciosMetaActivos.map(ad => {
                  const yaConfigurado = anuncios.some(a => a.meta_ad_id === ad.id);
                  return (
                    <div key={ad.id} className={`bg-white rounded-xl p-4 border flex justify-between items-start gap-3 ${yaConfigurado ? 'border-green-200' : 'border-purple-100'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{ad.nombre}</p>
                        {ad.titulo_creativo && <p className="text-xs text-slate-500 mt-0.5 truncate">{ad.titulo_creativo}</p>}
                        <p className="text-[10px] font-mono text-slate-400 mt-1">ID: {ad.id}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${yaConfigurado ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {yaConfigurado ? '✓ Configurado' : 'Sin configurar'}
                        </span>
                        {!yaConfigurado && (
                          <button
                            onClick={() => { setAnuncioEditando({ meta_ad_id: ad.id, nombre: ad.nombre, palabras_clave: ad.titulo_creativo ? [ad.titulo_creativo.toLowerCase().substring(0,20)] : [] }); setModalAnuncio(true); }}
                            className="text-[11px] font-bold text-purple-600 hover:text-purple-800 underline"
                          >
                            Configurar Bot
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {errorAnunciosMeta && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>⚠️ {errorAnunciosMeta}</strong>
              {errorAnunciosMeta.includes('ads_read') && (
                <p className="mt-2 text-xs">Solución: En Meta for Developers → tu app → Permisos → agrega <code className="bg-amber-100 px-1 rounded">ads_read</code>. O agrega <code className="bg-amber-100 px-1 rounded">META_ADS_ACCOUNT_ID=act_XXXXXXX</code> en tus variables de entorno de Vercel.</p>
              )}
            </div>
          )}

          {/* Anuncios configurados en el ERP */}
          {anuncios.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-400">
              <span className="material-symbols-outlined text-5xl mb-3">ads_click</span>
              <p className="font-bold">Aún no tienes anuncios configurados.</p>
              <p className="text-sm mt-1">Carga tus anuncios de Meta y configura qué debe hacer el bot cuando alguien llega de ese anuncio.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {anuncios.map(an => (
                <div key={an.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800">{an.nombre}</h3>
                      {an.meta_ad_id && <p className="text-[11px] font-mono text-purple-600 mt-0.5">Meta ID: {an.meta_ad_id}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setAnuncioEditando(an); setModalAnuncio(true); }} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button onClick={async () => {
                        if (!confirm('¿Eliminar este anuncio?')) return;
                        await fetch(`/api/anuncios?id=${an.id}`, { method: 'DELETE' });
                        setAnuncios(anuncios.filter(a => a.id !== an.id));
                      }} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-emerald-500">school</span>
                      <span className="text-slate-600">Curso: <strong>{an.curso_relacionado || 'No especificado'}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-blue-500">skip_next</span>
                      <span className="text-slate-600">Omitir onboarding: <strong>{an.saltar_onboarding ? '✅ Sí' : '❌ No'}</strong></span>
                    </div>
                    {an.palabras_clave?.length > 0 && (
                      <div className="flex items-start gap-2 flex-wrap mt-2">
                        {an.palabras_clave.map((c, i) => (
                          <span key={i} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium border border-purple-100">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Configurar Anuncio CTWA */}
      {modalAnuncio && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setModalAnuncio(false); setAnuncioEditando(null); }}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                <span className="material-symbols-outlined">ads_click</span>
                {anuncioEditando?.id ? 'Editar Anuncio' : 'Configurar Anuncio CTWA'}
              </h2>
              <button onClick={() => { setModalAnuncio(false); setAnuncioEditando(null); }} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
                const payload = {
                nombre: fd.get('nombre'),
                meta_ad_id: fd.get('meta_ad_id') || null,
                palabras_clave: fd.get('palabras_clave') ? fd.get('palabras_clave').split(',').map(s=>s.trim()).filter(Boolean) : [],
                curso_relacionado: fd.get('curso_relacionado') || null,
                saltar_onboarding: fd.get('saltar_onboarding') === 'on',
              };
              if (anuncioEditando?.id) payload.id = anuncioEditando.id;
              const resp = await fetch('/api/anuncios', {
                method: anuncioEditando?.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (resp.ok) {
                const updated = await resp.json();
                if (anuncioEditando?.id) setAnuncios(anuncios.map(a => a.id === updated.id ? updated : a));
                else setAnuncios([updated, ...anuncios]);
                setModalAnuncio(false); setAnuncioEditando(null);
              } else {
                const err = await resp.json();
                alert('Error: ' + err.error);
              }
            }} className="p-6 space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Nombre interno del anuncio *</label>
                <input name="nombre" required defaultValue={anuncioEditando?.nombre || ''} placeholder="Ej: Anuncio Summer Quest Julio" className="w-full rounded-xl border-slate-200 focus:border-purple-500 focus:ring-purple-500 text-sm p-3 border" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">ID del Anuncio en Meta</label>
                <input name="meta_ad_id" defaultValue={anuncioEditando?.meta_ad_id || ''} placeholder="Ej: 120213XXXXXXXXX (de Meta Ads Manager)" className="w-full rounded-xl border-slate-200 focus:border-purple-500 focus:ring-purple-500 text-sm p-3 border font-mono" />
                <p className="text-[11px] text-slate-400">Si cargaste anuncios de Meta, ya viene prellenado.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Curso Relacionado</label>
                <select name="curso_relacionado" defaultValue={anuncioEditando?.curso_relacionado || ''} className="w-full rounded-xl border-slate-200 focus:border-purple-500 focus:ring-purple-500 text-sm p-3 border">
                  <option value="">— Seleccionar curso —</option>
                  {cursosDisponibles.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
                <p className="text-[11px] text-slate-400">El bot usará la info de este curso para responder directamente sin hacer onboarding.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Palabras Clave (fallback)</label>
                <input name="palabras_clave" defaultValue={anuncioEditando?.palabras_clave?.join(', ') || ''} placeholder="summer quest, inglés verano, cursos julio" className="w-full rounded-xl border-slate-200 focus:border-purple-500 focus:ring-purple-500 text-sm p-3 border" />
                <p className="text-[11px] text-slate-400">Separadas por coma. Se usan si el ID de Meta no coincide exacto.</p>
              </div>
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <input type="checkbox" name="saltar_onboarding" id="saltar_onboarding" defaultChecked={anuncioEditando?.saltar_onboarding !== false} className="w-4 h-4 accent-purple-600" />
                <label htmlFor="saltar_onboarding" className="text-sm font-medium text-slate-700 cursor-pointer">
                  <strong>Omitir onboarding</strong> — El bot responde directo con info del curso sin preguntar edad, para quién es, etc.
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setModalAnuncio(false); setAnuncioEditando(null); }} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-900/20 hover:opacity-90 transition-all">
                  {anuncioEditando?.id ? 'Guardar Cambios' : 'Configurar Anuncio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ModalFormulario
        abierto={modalAbierto}
        alCerrar={cerrarModal}
        titulo={campanaEditando ? 'Editar Campaña y Públicos' : 'Nueva Campaña de Automatización'}
        campos={camposCampana}
        alEnviar={campanaEditando ? editarCampana : crearCampana}
        textoBoton={campanaEditando ? 'Guardar Cambios' : 'Crear Campaña'}
        datosIniciales={campanaEditando ? {
          nombre: campanaEditando.nombre,
          nombre_plantilla: campanaEditando.nombre_plantilla,
          mensaje: campanaEditando.mensaje,
          audiencia_id: campanaEditando.audiencia_id,
          canal: campanaEditando.canal,
          estado: campanaEditando.estado,
          imagen_url: campanaEditando.imagen_url,
        } : { estado: 'activa' }}
      />


      {mostrarConstructorPlantilla && (
        <ConstructorPlantilla
          onClose={() => setMostrarConstructorPlantilla(false)}
          onCreated={() => { cargarPlantillasMeta(); setMostrarConstructorPlantilla(false) }}
        />
      )}

      {/* Modal: Lanzar Campaña Dinámica */}
      {modalLanzar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-[#00236f] px-8 py-6 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-white text-3xl">rocket_launch</span>
                  <div>
                    <h2 className="text-white text-lg font-black">Elegir Plantilla y Enviar</h2>
                    <p className="text-blue-200 text-sm">{modalLanzar.ids.length} persona(s) seleccionada(s)</p>
                  </div>
                </div>
                <button onClick={() => setModalLanzar(null)} className="text-white/60 hover:text-white transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {!resultadoLanzar ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">Elige la plantilla aprobada de WhatsApp que quieres enviar a las <strong>{modalLanzar.ids.length}</strong> personas seleccionadas:</p>

                  {/* Plantillas aprobadas como tarjetas */}
                  {plantillasMeta.filter(p => p.status === 'APPROVED').length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                      <span className="material-symbols-outlined text-3xl mb-2">speaker_notes_off</span>
                      <p className="font-semibold">No tienes plantillas aprobadas por Meta.</p>
                      <p className="text-xs mt-1">Ve a la pestaña <strong>Plantillas</strong> para crearlas.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {plantillasMeta.filter(p => p.status === 'APPROVED').map(plt => {
                        const body = plt.components?.find(c => c.type === 'BODY')
                        const header = plt.components?.find(c => c.type === 'HEADER')
                        const seleccionada = modalLanzar.plantillaNombre === plt.name
                        const tieneCampana = campanas.some(c => c.nombre_plantilla === plt.name)
                        return (
                          <button
                            key={plt.id}
                            onClick={() => setModalLanzar({ ...modalLanzar, plantillaNombre: plt.name })}
                            className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                              seleccionada
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-sm truncate">{plt.name}</p>
                                {header?.format === 'IMAGE' && (
                                  <span className="text-xs text-slate-400">🖼️ Con imagen</span>
                                )}
                                {body && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{body.text}</p>
                                )}
                                {!tieneCampana && (
                                  <p className="text-[10px] text-amber-600 font-semibold mt-1">⚠️ Sin campaña CRM vinculada</p>
                                )}
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                                seleccionada ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                              }`}>
                                {seleccionada && <span className="text-white text-[10px] font-black">✓</span>}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Botones */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setModalLanzar(null)}
                      className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={ejecutarLanzamiento}
                      disabled={!modalLanzar.plantillaNombre || !!enviando}
                      className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        !modalLanzar.plantillaNombre || enviando
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                      }`}
                    >
                      {enviando ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">send</span>
                          Enviar a {modalLanzar.ids.length} persona(s)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Resultado */
                <div className="text-center space-y-4 py-6">
                  <p className={`text-base font-semibold leading-relaxed ${resultadoLanzar.ok ? 'text-green-700' : 'text-red-600'}`}>
                    {resultadoLanzar.msg}
                  </p>
                  <button
                    onClick={() => setModalLanzar(null)}
                    className="mt-2 px-8 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div >
  )
}

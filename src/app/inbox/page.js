'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/componentes/AuthProvider'

// Emojis frecuentes para el picker rápido
const EMOJIS_RAPIDOS = ['😊', '👍', '❤️', '🎉', '🙌', '😄', '🤔', '👋', '✅', '🔥', '💪', '📚', '⭐', '🎓', '💯', '😃', '🙏', '👏', '📝', '🏫', '📍', '📞', '✨', '🚀', '👌', '😎', '💬', '📢', '🇬🇧', '🇺🇸', '🗓️']

export default function PaginaInbox() {
  const { token } = useAuth()
  const [conversaciones, setConversaciones] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [chatActivo, setChatActivo] = useState(null)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [plataformaFiltro, setPlataformaFiltro] = useState('todas')
  const [cargando, setCargando] = useState(true)
  const [mostrarEmojis, setMostrarEmojis] = useState(false)

  // Resizing states
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const [infoWidth, setInfoWidth] = useState(320)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingInfo, setIsResizingInfo] = useState(false)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [initialWidth, setInitialWidth] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar) {
        const delta = e.clientX - resizeStartX;
        let newWidth = initialWidth + delta;
        if (newWidth < 280) newWidth = 280;
        if (newWidth > 600) newWidth = 600;
        setSidebarWidth(newWidth);
      } else if (isResizingInfo) {
        const delta = resizeStartX - e.clientX;
        let newWidth = initialWidth + delta;
        if (newWidth < 250) newWidth = 250;
        if (newWidth > 500) newWidth = 500;
        setInfoWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingInfo(false);
    };

    if (isResizingSidebar || isResizingInfo) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingInfo, resizeStartX, initialWidth]);
  const [prospectosRelacionados, setProspectosRelacionados] = useState([])
  const [modalNuevoChat, setModalNuevoChat] = useState(false)
  const [telefonoNuevo, setTelefonoNuevo] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [mostrarClipMenu, setMostrarClipMenu] = useState(false)
  const [mensajeInicial, setMensajeInicial] = useState('¡Hola! Soy de Total English. ¿En qué podemos ayudarte?')
  const fileInputRef = useRef(null)
  const docInputRef = useRef(null)

  const chatActivoRef = useRef(null)
  const cargarMensajesRef = useRef(null)
  const cargarConversacionesRef = useRef(null)
  const textareaRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    chatActivoRef.current = chatActivo
  }, [chatActivo])

  const cargarMensajes = useCallback(async (id) => {
    if (!id) return
    const { data } = await supabase.from('mensajes').select('*').eq('conversacion_id', id).order('creado_en', { ascending: true })
    if (data) setMensajes(data)
  }, [])

  const cargarProspectosRelacionados = useCallback(async (telefono) => {
    if (!telefono) { setProspectosRelacionados([]); return }
    const { data } = await supabase
      .from('prospectos')
      .select('*, citas(id, fecha, hora, estado, tipo)')
      .eq('telefono', telefono)
      .order('creado_en', { ascending: false })
    setProspectosRelacionados(data || [])
  }, [])

  const cambiarChat = async (c) => {
    setChatActivo(c)
    cargarMensajes(c.id)
    cargarProspectosRelacionados(c.id_plataforma)
    setMostrarEmojis(false)
    setEscribiendo(false)

    const unreadCount = c.mensajes?.filter(m => !m.leido && m.remitente === 'usuario').length || 0;
    if (unreadCount > 0) {
      // Actualización optimista del estado local
      setConversaciones(prev => prev.map(conv => {
        if (conv.id === c.id) {
          return { ...conv, mensajes: conv.mensajes.map(m => m.remitente === 'usuario' ? { ...m, leido: true } : m) };
        }
        return conv;
      }));
      
      try {
        await fetch('/api/mensajes/leer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversacion_id: c.id })
        });
        // No necesitamos cargarConversaciones aquí por la actualización optimista
      } catch (err) { console.error('Error marcando leido:', err) }
    }
  }

  const cargarConversaciones = useCallback(async () => {
    const { data, error } = await supabase.from('conversaciones').select('*, prospectos(*), mensajes(id, leido, remitente)').order('actualizado_en', { ascending: false })
    if (!error && data) {
      setConversaciones(data)
      const queryId = new URLSearchParams(window.location.search).get('id')
      if (queryId) {
        const conv = data.find(c => c.id === queryId)
        if (conv) {
          cambiarChat(conv)
          // Limpiar la url sin recargar
          window.history.replaceState(null, '', '/inbox')
          return
        }
      }
      if (!chatActivoRef.current && data.length > 0) {
        setChatActivo(data[0])
        cargarMensajes(data[0].id)
        cargarProspectosRelacionados(data[0].id_plataforma)
      } else if (chatActivoRef.current) {
        const up = data.find(c => c.id === chatActivoRef.current.id)
        if (up) setChatActivo(up)
      }
    }
    setCargando(false)
  }, [cargarMensajes, cargarProspectosRelacionados])

  useEffect(() => {
    cargarMensajesRef.current = cargarMensajes
    cargarConversacionesRef.current = cargarConversaciones
  })

  useEffect(() => {
    cargarConversacionesRef.current?.()
    const channel = supabase.channel('inbox_master_v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => {
        cargarConversacionesRef.current?.()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
        cargarConversacionesRef.current?.()
        if (chatActivoRef.current && payload.new.conversacion_id === chatActivoRef.current.id) {
          cargarMensajesRef.current?.(chatActivoRef.current.id)
          if (payload.new.remitente === 'usuario') {
            supabase.from('mensajes').update({ leido: true }).eq('id', payload.new.id).then(() => cargarConversacionesRef.current?.()).catch(console.error)
          }
          // Bot is typing indicator
          if (payload.new.remitente === 'usuario') {
            setEscribiendo(true)
            setTimeout(() => setEscribiendo(false), 4000)
          }
          if (payload.new.remitente === 'bot') {
            setEscribiendo(false)
          }
        }
      })
      .subscribe()

    const interval = setInterval(() => {
      cargarConversacionesRef.current?.()
      if (chatActivoRef.current) cargarMensajesRef.current?.(chatActivoRef.current.id)
    }, 5000)

    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [])

  // Auto scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensajes.length, escribiendo, chatActivo?.id])

  // Limpiar burbuja de no leídos si el chat está activo y llegan mensajes nuevos
  useEffect(() => {
    if (!chatActivo) return;
    const convActual = conversaciones.find(c => c.id === chatActivo.id);
    if (!convActual) return;
    
    const unreadCount = convActual.mensajes?.filter(m => !m.leido && m.remitente === 'usuario').length || 0;
    if (unreadCount > 0) {
      // Optimistic update
      setConversaciones(prev => prev.map(conv => {
        if (conv.id === chatActivo.id) {
          return { ...conv, mensajes: conv.mensajes.map(m => m.remitente === 'usuario' ? { ...m, leido: true } : m) };
        }
        return conv;
      }));
      // DB update
      fetch('/api/mensajes/leer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: chatActivo.id })
      }).catch(err => console.error('Error marcando leido:', err));
    }
  }, [conversaciones, chatActivo]);

  const subirArchivo = async (e, tipo = 'imagen') => {
    const file = e.target.files?.[0]
    if (!file || !chatActivo) return

    try {
      setCargando(true)

      // Usar la API del servidor para subir con supabaseAdmin (bypasa RLS)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/media', {
        method: 'POST',
        headers: {
          // Enviar el token JWT para que la API pueda verificar autenticación
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error al subir el archivo')
      }

      const { url: publicUrl } = await res.json()
      await enviarMensaje(null, publicUrl, tipo === 'documento' ? 'archivo' : 'imagen')
      setMostrarClipMenu(false)
    } catch (err) {
      console.error('Error subiendo:', err)
      alert('Error al subir archivo: ' + (err.message || 'Intenta de nuevo'))
    } finally {
      setCargando(false)
    }
  }

  const enviarMensaje = async (e, fileUrl = null, tipoMsg = 'texto') => {
    if (e) e.preventDefault()
    if ((!nuevoMensaje.trim() && !fileUrl) || !chatActivo) return
    const texto = nuevoMensaje
    setNuevoMensaje('')
    setMostrarEmojis(false)
    try {
      const payload = { to: chatActivo.id_plataforma, text: texto, plataforma: chatActivo.plataforma || 'whatsapp' }
      if (fileUrl) {
        payload.tipo = tipoMsg === 'archivo' ? 'document' : 'image'
        payload.url_archivo = fileUrl
      }
      const res = await fetch('/api/enviar-mensaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        // Recargar para forzar vista de los mensajes que ya guardó el servidor
        setTimeout(() => {
          cargarMensajes(chatActivo.id)
          cargarConversaciones()
        }, 500)
      } else {
        const err = await res.json()
        console.error('Error enviando a Meta:', err)
      }
    } catch (err) { console.error('Excepción enviando:', err) }
  }



  const toggleBotHumano = async () => {
    if (!chatActivo || toggling) return
    setToggling(true)
    const nuevoValor = !chatActivo.asignado_a_humano
    let updates = { asignado_a_humano: nuevoValor }

    // Si lo estamos devolviendo al bot (o tomando siendo humano), limpiamos la alerta
    if (!nuevoValor || chatActivo.escalation_reason) {
      updates.escalation_reason = null
      updates.escalation_category = null
    }

    await supabase.from('conversaciones').update(updates).eq('id', chatActivo.id)
    setChatActivo(prev => ({ ...prev, ...updates }))
    setToggling(false)
  }

  const resolverEscalamiento = async () => {
    if (!chatActivo || toggling) return;
    setToggling(true);
    let updates = {
      asignado_a_humano: true,
      escalation_reason: null,
      escalation_category: null
    };
    await supabase.from('conversaciones').update(updates).eq('id', chatActivo.id);
    setChatActivo(prev => ({ ...prev, ...updates }))
    setToggling(false);
  }

  const crearProspectoRapido = async () => {
    if (!chatActivo) return
    try {
      const { data: nuevoP, error } = await supabase.from('prospectos').insert({
        nombre: 'Interesado',
        telefono: chatActivo.id_plataforma,
        estado: 'nuevo'
      }).select('*').single()
      
      if (error) throw error
      
      await supabase.from('conversaciones').update({ prospecto_id: nuevoP.id }).eq('id', chatActivo.id)
      await cargarConversaciones()
      alert('Prospecto creado y vinculado correctamente.')
    } catch (err) {
      console.error(err)
      alert('Error al crear prospecto.')
    }
  }

  const actualizarEstadoProspecto = async (nuevoEstado) => {
    if (!chatActivo?.prospectos?.id) {
      alert('Primero vincula un prospecto a esta conversación.')
      return
    }
    try {
      const { error } = await supabase.from('prospectos').update({ estado: nuevoEstado }).eq('id', chatActivo.prospectos.id)
      if (error) throw error
      await cargarConversaciones()
    } catch (err) {
      console.error(err)
      alert('Error al actualizar estado.')
    }
  }

  const insertarEmoji = (emoji) => {
    setNuevoMensaje(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  const crearNuevoChat = async () => {
    if (!telefonoNuevo.trim()) { alert('Escribe un número de teléfono'); return }
    
    // Normalizar teléfono (solo números)
    let telLimpio = telefonoNuevo.replace(/\D/g, '')
    
    // Si tiene 10 dígitos (formato MX), agregar prefijo 521
    if (telLimpio.length === 10) {
      telLimpio = '521' + telLimpio
    }

    try {
      // 1. Ver si ya existe la conversación
      const { data: existing } = await supabase
        .from('conversaciones')
        .select('*, prospectos(*)')
        .eq('id_plataforma', telLimpio)
        .eq('plataforma', 'whatsapp')
        .maybeSingle()
      
      if (existing) {
        await cambiarChat(existing)
        setModalNuevoChat(false)
        setTelefonoNuevo('')
        setNombreNuevo('')
        return
      }

      // 2. Si no existe, ver si hay un prospecto huérfano con ese número
      const { data: prosExist } = await supabase
        .from('prospectos')
        .select('*')
        .eq('telefono', telLimpio)
        .maybeSingle()

      // 3. Crear la conversación (con o sin prospecto)
      const { data: nuevaC, error: cError } = await supabase.from('conversaciones').insert({ 
        prospecto_id: prosExist ? prosExist.id : null, 
        plataforma: 'whatsapp', 
        id_plataforma: telLimpio,
        asignado_a_humano: true,
        ultimo_mensaje: mensajeInicial
      }).select('*, prospectos(*)').single()
      
      if (cError) throw cError

      // 4. Enviar el mensaje inicial real por WhatsApp
      await fetch('/api/enviar-mensaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: telLimpio, text: mensajeInicial, plataforma: 'whatsapp' })
      })

      // 5. Guardar el mensaje en la base de datos
      await supabase.from('mensajes').insert({
        conversacion_id: nuevaC.id,
        remitente: 'agente',
        contenido: mensajeInicial,
        tipo: 'texto'
      })

      await cargarConversaciones()
      if (nuevaC) {
        await cambiarChat(nuevaC)
      }
      
      setModalNuevoChat(false)
      setTelefonoNuevo('')
      setNombreNuevo('')
    } catch (err) {
      console.error("Error creando chat:", err)
      alert("Error al iniciar el chat: " + err.message)
    }
  }

  const conversacionesFiltradas = conversaciones.filter(c => {
    const textMatch = (c.prospectos?.nombre || '').toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    (c.prospectos?.nombre_alumno || '').toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    c.id_plataforma.includes(filtroBusqueda);
    const platMatch = plataformaFiltro === 'todas' || c.plataforma === plataformaFiltro;
    return textMatch && platMatch;
  })

  const unreadCounts = conversaciones.reduce((acc, c) => {
    const count = c.mensajes?.filter(m => !m.leido && m.remitente === 'usuario').length || 0;
    if (count > 0) {
      acc.todas += count;
      const plat = c.plataforma || 'whatsapp';
      acc[plat] = (acc[plat] || 0) + count;
    }
    return acc;
  }, { todas: 0, whatsapp: 0, messenger: 0, instagram: 0 })

  const obtenerTiempoRelativo = (fecha) => {
    if (!fecha) return ''
    const ahora = new Date()
    const f = new Date(fecha)
    const diff = ahora - f
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const dias = Math.floor(hrs / 24)
    if (dias === 1) return 'ayer'
    return `${dias}d`
  }

  const eliminarConversacion = async (e, id) => {
    if (e) e.stopPropagation()
    try {
      const res = await fetch(`/api/conversaciones?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        alert('Error al eliminar: ' + (err.error || 'Desconocido'))
        return
      }
      alert('Conversación eliminada con éxito.')
      if (chatActivo?.id === id) setChatActivo(null)
      await cargarConversaciones()
    } catch (err) { 
      console.error('Error eliminando:', err)
      alert('Error de conexión al eliminar.')
    }
  }

  const guardarNotaInterna = async (idProspecto, nota) => {
    try {
      await supabase.from('prospectos').update({ notas_internas: nota }).eq('id', idProspecto)
      if (chatActivo?.prospectos) {
        cargarProspectosRelacionados(chatActivo.id_plataforma)
      }
    } catch (e) {
      console.error('Error guardando nota:', e)
    }
  }

  // Group messages by date
  const agruparMensajesPorFecha = (msgs) => {
    const grupos = []
    let fechaActual = null
    msgs.forEach(msg => {
      const fecha = new Date(msg.creado_en).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
      if (fecha !== fechaActual) {
        grupos.push({ tipo: 'fecha', fecha })
        fechaActual = fecha
      }
      grupos.push({ tipo: 'mensaje', data: msg })
    })
    return grupos
  }

  if (cargando) return <div className="p-10 flex text-[#1e3a8a] items-center gap-2 h-full font-sans"><span className="material-symbols-outlined animate-spin">refresh</span> Conectando al Inbox...</div>

  const mensajesAgrupados = agruparMensajesPorFecha(mensajes)

  return (
    <div className="h-[calc(100vh-65px)] flex overflow-hidden bg-[#eae6df] font-sans w-full max-w-full" style={{ '--sidebar-width': `${sidebarWidth}px`, '--info-width': `${infoWidth}px` }}>

      {/* 1. SIDEBAR DE CONVERSACIONES */}
      <div className={`${chatActivo ? 'hidden md:flex' : 'flex'} w-full md:w-[var(--sidebar-width)] bg-white border-r border-slate-200/80 flex-col h-full shrink-0`}>
        {/* Header Sidebar */}
        <div className="px-4 py-3 flex items-center justify-between bg-[#f0f2f5]">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1e3a8a] to-[#0f172a] flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">forum</span>
            </div>
            <h2 className="text-[16px] font-bold text-[#1e3a8a]">Inbox Alex</h2>
          </div>
          <button
            onClick={() => setModalNuevoChat(true)}
            className="w-9 h-9 rounded-full hover:bg-slate-200/80 flex items-center justify-center transition-colors"
            title="Nuevo chat"
          >
            <span className="material-symbols-outlined text-slate-600 text-[20px]">edit_square</span>
          </button>
        </div>

        {/* Tabs de Plataformas */}
        <div className="bg-[#f0f2f5] px-2 pt-2 border-b border-slate-200/50 flex overflow-x-auto overflow-y-hidden no-scrollbar gap-1">
          {[
            { id: 'todas', label: 'Todos los mensajes' },
            { id: 'messenger', label: 'Messenger', icon: 'chat' },
            { id: 'instagram', label: 'Instagram', icon: 'photo_camera' },
            { id: 'whatsapp', label: 'WhatsApp', icon: 'forum' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setPlataformaFiltro(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                plataformaFiltro === tab.id
                  ? 'bg-white text-blue-700 border-t border-x border-slate-200/50 shadow-sm z-10 -mb-[1px]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border-transparent border-b-slate-200/50'
              }`}
            >
              {tab.label}
              {unreadCounts[tab.id] > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="p-2 bg-[#f0f2f5]">
          <div className="bg-white rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-slate-400">search</span>
            <input
              type="text"
              placeholder="Buscar o empezar un chat nuevo"
              className="bg-transparent w-full text-sm outline-none text-slate-700 placeholder:text-slate-400"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {conversacionesFiltradas.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              <span className="material-symbols-outlined text-4xl mb-2 block">chat_bubble_outline</span>
              No hay conversaciones
            </div>
          ) : conversacionesFiltradas.map(conv => {
            const unreadCount = conv.mensajes?.filter(m => !m.leido && m.remitente === 'usuario').length || 0
            const isActive = chatActivo?.id === conv.id
            return (
              <div
                key={conv.id}
                onClick={() => cambiarChat(conv)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[#f5f6f6] ${isActive ? 'bg-[#f0f2f5]' : ''
                  }`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm uppercase relative ${isActive ? 'bg-[#1e3a8a] text-white' : 'bg-gradient-to-br from-slate-500 to-slate-700 text-white'
                    }`}>
                    {(conv.prospectos?.nombre_alumno || conv.prospectos?.nombre || conv.nombre_contacto)?.[0] || '?'}
                    {/* Platform Icon Badge */}
                    <div className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-sm text-white ${
                      conv.plataforma === 'messenger' ? 'bg-[#0084FF]' :
                      conv.plataforma === 'instagram' ? 'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]' :
                      'bg-[#25D366]'
                    }`}>
                      {conv.plataforma === 'messenger' ? (
                        <svg viewBox="0 0 36 36" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M18 1.99C9.17 1.99 2 8.52 2 16.58c0 4.58 2.33 8.67 5.96 11.39V34l5.44-3.01c1.46.41 3.01.62 4.6.62 8.83 0 16-6.53 16-14.59S26.83 1.99 18 1.99zm1.61 19.53-4.14-4.41-8.08 4.41 8.88-9.43 4.25 4.41 7.97-4.41-8.88 9.43z" />
                        </svg>
                      ) : conv.plataforma === 'instagram' ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-[#25D366] text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                      {unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5 group/header">
                    <h3 className={`text-[14px] truncate ${unreadCount > 0 ? 'font-bold text-[#111b21]' : 'font-medium text-[#111b21]'}`}>
                      {conv.prospectos?.nombre_alumno || conv.prospectos?.nombre || conv.nombre_contacto || conv.id_plataforma}
                    </h3>
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] shrink-0 ml-2 ${unreadCount > 0 ? 'text-[#25D366] font-bold' : 'text-slate-400'}`}>
                        {obtenerTiempoRelativo(conv.actualizado_en)}
                      </span>
                      {/* Botón de eliminar removido de aquí por petición del usuario */}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Double check for sent messages */}
                    {conv.ultimo_mensaje && !conv.ultimo_mensaje.startsWith('[') && (
                      <span className="material-symbols-outlined text-[14px] text-[#53bdeb] shrink-0">done_all</span>
                    )}
                    <p className={`text-[12.5px] truncate ${unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>{conv.ultimo_mensaje || 'Conversación vacía'}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Divisor Izquierdo (Resizer) */}
      <div 
        className="hidden md:block w-1 bg-transparent hover:bg-[#1e3a8a]/40 active:bg-[#1e3a8a]/60 cursor-col-resize z-50 shrink-0 transition-colors"
        onMouseDown={(e) => {
          setIsResizingSidebar(true);
          setResizeStartX(e.clientX);
          setInitialWidth(sidebarWidth);
        }}
      />

      {/* 2. CHAT AREA  */}
      {chatActivo ? (
        <div className="flex-1 flex flex-col h-full min-w-0">
          {/* Chat Header */}
          <div className="h-[60px] bg-[#f0f2f5] border-b border-slate-200/50 px-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <button onClick={() => setChatActivo(null)} className="md:hidden material-symbols-outlined text-slate-500 mr-1">arrow_back</button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] text-white flex items-center justify-center font-bold text-sm uppercase">
                {(chatActivo.prospectos?.nombre_alumno || chatActivo.prospectos?.nombre || chatActivo.nombre_contacto)?.[0] || '?'}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-[#1e293b] text-[15px]">
                  {chatActivo.prospectos?.nombre_alumno || chatActivo.prospectos?.nombre || chatActivo.nombre_contacto || chatActivo.id_plataforma}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {chatActivo.id_plataforma} • {chatActivo.prospectos?.estado?.toUpperCase() || 'NUEVO'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Bot/Human Toggle */}
              <button
                onClick={toggleBotHumano}
                disabled={toggling}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold text-white shadow-sm transition-all active:scale-95 ${chatActivo.asignado_a_humano ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#00a884] hover:bg-[#008f72]'
                  } disabled:opacity-50`}
                title={chatActivo.asignado_a_humano ? 'Cambiar a Bot' : 'Tomar control manual'}
              >
                <span className="material-symbols-outlined text-[12px] mr-1 align-middle">{chatActivo.asignado_a_humano ? 'person' : 'smart_toy'}</span>
                {chatActivo.asignado_a_humano ? 'HUMANO' : 'ALEX IA'}
              </button>

              {/* Botón de eliminar removido de la cabecera por petición del usuario */}
            </div>
          </div>

          {/* ESCALATION BANNER (MANDADOS STYLE) */}
          {chatActivo.escalation_reason && (
            <div className="bg-red-50 border-b border-red-100 p-3 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between z-10 shadow-sm relative">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 shrink-0 mt-0.5">warning</span>
                <div>
                  <h4 className="text-[13px] font-bold text-red-800">ATENCIÓN REQUERIDA</h4>
                  <p className="text-[12px] text-red-600 leading-tight">
                    Alex pausó esta conversación por el siguiente motivo: <br />
                    <strong className="text-red-900">"{chatActivo.escalation_reason}"</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={resolverEscalamiento}
                disabled={toggling}
                className="bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-semibold px-4 py-1.5 rounded-lg text-xs shadow-sm whitespace-nowrap transition-colors"
              >
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">check_circle</span>
                Tomar y Resolver
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-2 md:px-16"
            style={{
              backgroundColor: '#efeae2',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3Cstyle%3E.a%7Bfill:%23ddd6c8;opacity:0.15%7D%3C/style%3E%3C/defs%3E%3Cpath class='a' d='M20 10 Q25 5 30 10 Q25 15 20 10Z'/%3E%3Cpath class='a' d='M60 40 Q65 35 70 40 Q65 45 60 40Z'/%3E%3Cpath class='a' d='M140 20 Q145 15 150 20 Q145 25 140 20Z'/%3E%3Cpath class='a' d='M100 80 Q105 75 110 80 Q105 85 100 80Z'/%3E%3Cpath class='a' d='M30 120 Q35 115 40 120 Q35 125 30 120Z'/%3E%3Cpath class='a' d='M170 70 Q175 65 180 70 Q175 75 170 70Z'/%3E%3Cpath class='a' d='M80 150 Q85 145 90 150 Q85 155 80 150Z'/%3E%3Cpath class='a' d='M150 130 Q155 125 160 130 Q155 135 150 130Z'/%3E%3Cpath class='a' d='M10 170 Q15 165 20 170 Q15 175 10 170Z'/%3E%3Cpath class='a' d='M120 180 Q125 175 130 180 Q125 185 120 180Z'/%3E%3Ccircle class='a' cx='50' cy='95' r='3'/%3E%3Ccircle class='a' cx='180' cy='160' r='2'/%3E%3Ccircle class='a' cx='90' cy='25' r='2'/%3E%3Crect class='a' x='150' y='90' width='6' height='4' rx='1'/%3E%3Crect class='a' x='20' y='60' width='5' height='3' rx='1'/%3E%3C/svg%3E")`,
            }}
          >
            {mensajes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400/70">
                <div className="bg-white/50 rounded-2xl p-6 text-center shadow-sm">
                  <span className="material-symbols-outlined text-5xl mb-3 text-[#1e3a8a]/30">lock</span>
                  <p className="font-medium text-sm text-slate-500">Los mensajes están cifrados de extremo a extremo.</p>
                  <p className="text-xs text-slate-400 mt-1">Sin mensajes aún en esta conversación.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1 py-2">
                {mensajesAgrupados.map((item, idx) => {
                  if (item.tipo === 'fecha') {
                    return (
                      <div key={`fecha-${idx}`} className="flex justify-center my-3">
                        <span className="bg-white/80 text-slate-500 text-[11px] font-medium px-4 py-1.5 rounded-lg shadow-sm">
                          {item.fecha}
                        </span>
                      </div>
                    )
                  }

                  const msj = item.data
                  const esBot = msj.remitente === 'bot'
                  const esHumano = msj.remitente === 'humano' || msj.remitente === 'agente'
                  const soyYo = esBot || esHumano
                  const esImagen = msj.tipo === 'imagen' || msj.url_archivo

                  return (
                    <div key={msj.id} className={`flex w-full ${soyYo ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[65%] relative group`}>
                        {/* Bot/Human label */}
                        {esBot && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="material-symbols-outlined text-[10px] text-[#00a884]">smart_toy</span>
                            <span className="text-[9px] text-[#00a884] font-bold">Alex IA</span>
                          </div>
                        )}
                        {esHumano && (
                          <div className="flex items-center gap-1 mb-0.5 justify-end">
                            <span className="text-[9px] text-blue-500 font-bold">Asesor</span>
                            <span className="material-symbols-outlined text-[10px] text-blue-500">person</span>
                          </div>
                        )}

                        {/* Message bubble */}
                        <div className={`px-3 py-2 text-[13.5px] leading-relaxed shadow-sm relative ${esBot ? 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none' :
                            esHumano ? 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none' :
                              'bg-white text-[#111b21] rounded-lg rounded-tl-none'
                          }`}>
                          {/* Tail */}
                          <div className={`absolute top-0 w-3 h-3 ${soyYo ? '-right-1.5 text-[#d9fdd3]' : '-left-1.5 text-white'
                            }`}>
                            <svg viewBox="0 0 8 13" className={`w-full h-full ${soyYo ? 'fill-[#d9fdd3]' : 'fill-white'}`}>
                              {soyYo
                                ? <path d="M1,0 L8,0 L8,13 C5,10 2,6 1,0Z" />
                                : <path d="M7,0 L0,0 L0,13 C3,10 6,6 7,0Z" />
                              }
                            </svg>
                          </div>

                          {esImagen && msj.url_archivo ? (
                            <div className="flex flex-col gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={msj.url_archivo} alt="Imagen" className="rounded-lg max-w-full h-auto cursor-pointer" onClick={() => window.open(msj.url_archivo)} />
                              {msj.contenido && <p className="whitespace-pre-wrap">{msj.contenido}</p>}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msj.contenido}</p>
                          )}

                          {/* Timestamp + checks */}
                          <span className={`text-[10px] float-right ml-3 mt-1 flex items-center gap-0.5 ${soyYo ? 'text-slate-500/70' : 'text-slate-400'}`}>
                            {new Date(msj.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {soyYo && (
                              <span className={`material-symbols-outlined text-[14px] ${msj.leido ? 'text-[#53bdeb]' : 'text-slate-400/60'}`}>
                                done_all
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Typing indicator */}
                {escribiendo && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-[10px] text-slate-400 ml-1">Alex está escribiendo...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={scrollRef}></div>
              </div>
            )}
          </div>

          {/* Emoji Picker */}
          {mostrarEmojis && (
            <div className="bg-[#f0f2f5] px-4 py-3 border-t border-slate-200/50">
              <div className="flex flex-wrap gap-1.5">
                {EMOJIS_RAPIDOS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => insertarEmoji(emoji)}
                    className="w-9 h-9 rounded-lg hover:bg-white flex items-center justify-center text-xl transition-colors active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Input */}
          <form onSubmit={enviarMensaje} className="px-4 py-2.5 bg-[#f0f2f5] flex items-end gap-2 relative">
            
            {/* Clip Menu Popover */}
            {mostrarClipMenu && (
              <div className="absolute bottom-[60px] left-4 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 z-50 animate-in fade-in slide-in-from-bottom-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors rounded-xl text-left whitespace-nowrap">
                  <span className="material-symbols-outlined text-[#00a884] text-[20px]">image</span>
                  <span className="text-[13px] font-medium">Fotos y Videos</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={(e) => subirArchivo(e, 'imagen')} accept="image/*" className="hidden" />

                <button type="button" onClick={() => docInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors rounded-xl text-left whitespace-nowrap">
                  <span className="material-symbols-outlined text-[#7f66ff] text-[20px]">description</span>
                  <span className="text-[13px] font-medium">Documento</span>
                </button>
                <input type="file" ref={docInputRef} onChange={(e) => subirArchivo(e, 'documento')} className="hidden" />

                <button type="button" onClick={async () => {
                  if (!chatActivo) return
                  if (!confirm('¿Enviar ubicación al cliente?')) return
                  try {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(async (pos) => {
                        const ubicacion = `📍 Ubicación: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`
                        setNuevoMensaje(ubicacion)
                      })
                    } else {
                      await supabase.from('mensajes').insert({ conversacion_id: chatActivo.id, remitente: 'agente', contenido: '📍 Ubicación no disponible', tipo: 'texto' })
                      await supabase.from('conversaciones').update({ ultimo_mensaje: '📍 Ubicación no disponible', actualizado_en: new Date().toISOString() }).eq('id', chatActivo.id)
                      cargarMensajes(chatActivo.id)
                    }
                  } catch (err) { console.error(err); alert('Error al enviar ubicación') }
                  setMostrarClipMenu(false)
                }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors rounded-xl text-left whitespace-nowrap">
                  <span className="material-symbols-outlined text-[#f05950] text-[20px]">location_on</span>
                  <span className="text-[13px] font-medium">Ubicación</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setMostrarEmojis(!mostrarEmojis); setMostrarClipMenu(false); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${mostrarEmojis ? 'text-[#1e3a8a]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span className="material-symbols-outlined text-[24px]">mood</span>
            </button>
            <button
              type="button"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${mostrarClipMenu ? 'text-[#1e3a8a]' : 'text-slate-500 hover:text-slate-700'}`}
              title="Adjuntar archivo"
              onClick={() => { setMostrarClipMenu(!mostrarClipMenu); setMostrarEmojis(false); }}
            >
              <span className="material-symbols-outlined text-[24px] rotate-45">attach_file</span>
            </button>
            <textarea
              ref={textareaRef}
              value={nuevoMensaje}
              onChange={(e) => setNuevoMensaje(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(e); } }}
              placeholder="Escribe un mensaje"
              className="flex-1 bg-white rounded-lg px-4 py-2.5 outline-none resize-none text-[14px] text-[#111b21] placeholder:text-slate-400 focus:ring-0 border-none shadow-sm"
              rows={1}
            />
            <button
              type="submit"
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-[#1e3a8a] transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[24px]">{nuevoMensaje.trim() ? 'send' : 'mic'}</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: '#f0f2f5' }}>
          <div className="text-center max-w-md">
            <div className="w-[240px] h-[240px] mx-auto mb-6 rounded-full bg-gradient-to-br from-[#1e3a8a]/5 to-transparent flex items-center justify-center">
              <span className="material-symbols-outlined text-8xl text-[#1e3a8a]/20">forum</span>
            </div>
            <h3 className="text-3xl font-light text-slate-600 mb-3">Total English Inbox</h3>
            <p className="text-slate-400 text-sm leading-relaxed">Envía y recibe mensajes. Selecciona una conversación para comenzar.</p>
            <div className="mt-6 flex items-center justify-center gap-1 text-slate-300 text-[11px]">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              Mensajes cifrados de extremo a extremo
            </div>
          </div>
        </div>
      )}

      {/* Divisor Derecho (Resizer) */}
      {chatActivo && (
        <div 
          className="hidden xl:block w-1 bg-transparent hover:bg-[#1e3a8a]/40 active:bg-[#1e3a8a]/60 cursor-col-resize z-50 shrink-0 transition-colors"
          onMouseDown={(e) => {
            setIsResizingInfo(true);
            setResizeStartX(e.clientX);
            setInitialWidth(infoWidth);
          }}
        />
      )}

      {/* 3. RIGHT PANEL - CONTACT INFO */}
      {chatActivo && (
        <div className="hidden xl:flex w-[var(--info-width)] border-l border-slate-200/80 bg-white flex-col h-full shrink-0 overflow-y-auto">
          {/* Avatar and main data */}
          <div className="p-5 bg-gradient-to-b from-[#0f172a] to-[#1e3a8a] text-center flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl text-white font-bold mb-3 uppercase ring-4 ring-white/10">
              {(chatActivo.prospectos?.nombre_alumno || chatActivo.prospectos?.nombre)?.[0] || '?'}
            </div>
            <h3 className="text-[18px] font-bold text-white">{chatActivo.prospectos?.nombre_alumno || chatActivo.prospectos?.nombre || 'Prospecto'}</h3>
            <p className="text-[12px] text-blue-200 mt-0.5">{chatActivo.id_plataforma}</p>
            {chatActivo.prospectos?.lead_score && (
              <div className={`mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase ${chatActivo.prospectos.lead_score === 'CALIENTE' ? 'bg-red-500/20 text-red-200' :
                  chatActivo.prospectos.lead_score === 'TIBIO' ? 'bg-amber-500/20 text-amber-200' :
                    'bg-white/10 text-white/70'
                }`}>
                {chatActivo.prospectos.lead_score}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-b border-slate-100">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => actualizarEstadoProspecto('contactado')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors bg-white border ${chatActivo.prospectos?.estado === 'contactado' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-blue-50'}`}>
                <span className="material-symbols-outlined text-[16px] text-[#1e3a8a]">call</span>
                <span className="text-[9px] text-slate-500 font-semibold truncate w-full text-center">Contactado</span>
              </button>
              <button onClick={() => actualizarEstadoProspecto('agendado')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors bg-white border ${chatActivo.prospectos?.estado === 'agendado' ? 'border-orange-500 bg-orange-50' : 'border-slate-100 hover:bg-orange-50'}`}>
                <span className="material-symbols-outlined text-[16px] text-orange-600">event_available</span>
                <span className="text-[9px] text-slate-500 font-semibold truncate w-full text-center">Agendar</span>
              </button>
              <button onClick={() => actualizarEstadoProspecto('cerrado')}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors bg-white border ${chatActivo.prospectos?.estado === 'cerrado' ? 'border-green-500 bg-green-50' : 'border-slate-100 hover:bg-green-50'}`}>
                <span className="material-symbols-outlined text-[16px] text-green-600">verified</span>
                <span className="text-[9px] text-slate-500 font-semibold truncate w-full text-center">Cerrar</span>
              </button>
              <button onClick={toggleBotHumano}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors bg-white border ${chatActivo.asignado_a_humano ? 'border-amber-500 bg-amber-50' : 'border-slate-100 hover:bg-amber-50'}`}>
                <span className="material-symbols-outlined text-[16px] text-amber-600">{chatActivo.asignado_a_humano ? 'person' : 'smart_toy'}</span>
                <span className="text-[9px] text-slate-500 font-semibold truncate w-full text-center">{chatActivo.asignado_a_humano ? 'Humano' : 'Bot'}</span>
              </button>
            </div>
          </div>

          {/* CRM Data */}
          <div className="p-4 border-b border-slate-100 font-sans">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">person</span>
              Datos del Prospecto
            </h4>
            <div className="space-y-2.5">
              {[
                ['Estado', chatActivo.prospectos?.estado?.toUpperCase() || 'NUEVO'],
                ['Alumno', chatActivo.prospectos?.nombre_alumno || 'Mismo contacto'],
                ['Curso', chatActivo.prospectos?.curso_interes || '—'],
                ['Edad', chatActivo.prospectos?.edad ? `${chatActivo.prospectos.edad} años` : '—'],
                ['Nivel', chatActivo.prospectos?.nivel || '—'],
                ['Horario', chatActivo.prospectos?.horario || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400 font-medium">{label}</span>
                  <span className={`text-[12px] font-semibold ${label === 'Estado' ? 'text-[#1e3a8a] bg-blue-50 px-2 py-0.5 rounded uppercase text-[10px] font-bold' : 'text-slate-700'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* INTERNAL NOTES (Colaboración) */}
          <div className="p-4 border-b border-slate-100 flex-1 flex flex-col">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">sticky_note_2</span>
              Notas Internas
            </h4>
            <textarea
              className="w-full h-32 bg-amber-50/50 rounded-xl border border-amber-100 p-3 text-[12px] text-slate-800 outline-none focus:bg-amber-50 transition-colors placeholder:text-slate-400"
              placeholder="Notas privadas..."
              defaultValue={chatActivo.prospectos?.notas_internas || ''}
              onBlur={(e) => {
                if (e.target.value !== (chatActivo.prospectos?.notas_internas || '')) {
                  guardarNotaInterna(chatActivo.prospectos?.id, e.target.value)
                }
              }}
            ></textarea>
          </div>

          {/* Related prospects */}
          {prospectosRelacionados.length > 1 && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">group</span>
                Alumnos ({prospectosRelacionados.length})
              </h4>
              <div className="space-y-2">
                {prospectosRelacionados.map((p) => (
                  <div key={p.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-bold text-slate-800">{p.nombre_alumno || p.nombre}</span>
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{p.estado}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{p.curso_interes || 'Interés general'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New: Quick Create Prospect if missing */}
          {!chatActivo.prospecto_id && (
            <div className="p-4 border-b border-slate-100">
              <button 
                onClick={crearProspectoRapido}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                Vincular como Prospecto
              </button>
              <p className="text-[10px] text-slate-400 mt-2 text-center">Este chat aún no tiene un prospecto creado en el CRM.</p>
            </div>
          )}

          {/* Delete Conversation Button (Moved here per user request) */}
          <div className="p-4 mt-auto">
            <button
              onClick={() => {
                if (confirm('¿Estás seguro de eliminar esta conversación permanentemente?')) {
                  eliminarConversacion(null, chatActivo.id)
                }
              }}
              className="w-full py-3 border-2 border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Eliminar Conversación
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo Chat */}
      {modalNuevoChat && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalNuevoChat(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-[#1e3a8a]">Nuevo Chat</h2>
              <button onClick={() => setModalNuevoChat(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Número de WhatsApp</label>
                <input
                  type="tel"
                  placeholder="Ej: 5213412345678"
                  className="w-full rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-sm p-3"
                  value={telefonoNuevo}
                  onChange={(e) => setTelefonoNuevo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Nombre (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Juan Pérez"
                  className="w-full rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-sm p-3"
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Mensaje Inicial</label>
                <textarea
                  placeholder="Escribe el primer mensaje..."
                  className="w-full rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-sm p-3 h-24"
                  value={mensajeInicial}
                  onChange={(e) => setMensajeInicial(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3">
                <button onClick={() => setModalNuevoChat(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={crearNuevoChat}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#00236f] to-[#1e3a8a] text-white text-sm font-semibold rounded-xl shadow-lg hover:opacity-90 transition-all active:scale-95"
                >
                  Iniciar Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

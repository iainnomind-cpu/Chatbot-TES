'use client'
import { useState, useRef } from 'react'
import { fetchAuth } from '@/lib/fetchAuth'

const VARIABLES = [
  { id: '{{1}}', label: 'Nombre', icon: 'person', color: 'blue' },
  { id: '{{2}}', label: 'Curso', icon: 'school', color: 'purple' },
  { id: '{{3}}', label: 'Fecha', icon: 'calendar_month', color: 'amber' },
  { id: '{{4}}', label: 'Hora', icon: 'schedule', color: 'emerald' },
  { id: '{{5}}', label: 'Precio', icon: 'payments', color: 'rose' },
  { id: '{{6}}', label: 'Personalizado', icon: 'edit', color: 'slate' },
]

const CATEGORIAS = [
  { valor: 'MARKETING', label: 'Marketing', desc: 'Promociones, ofertas, novedades' },
  { valor: 'UTILITY', label: 'Utilidad', desc: 'Confirmaciones, recordatorios, actualizaciones' },
  { valor: 'AUTHENTICATION', label: 'Autenticación', desc: 'Códigos OTP, verificación' },
]

const IDIOMAS = [
  { valor: 'es_MX', label: 'Español (México)' },
  { valor: 'es', label: 'Español' },
  { valor: 'en_US', label: 'English (US)' },
]

export default function ConstructorPlantilla({ onClose, onCreated }) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('MARKETING')
  const [idioma, setIdioma] = useState('es_MX')
  const [tipoHeader, setTipoHeader] = useState('none') // none, text, image
  const [headerText, setHeaderText] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState('')
  const [botones, setBotones] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [ejemplosVars, setEjemplosVars] = useState({})
  const bodyRef = useRef(null)

  const insertarVariable = (varId) => {
    if (!bodyRef.current) return
    const ta = bodyRef.current
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newBody = body.substring(0, start) + varId + body.substring(end)
    setBody(newBody)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + varId.length }, 50)
  }

  const agregarBoton = (tipo) => {
    if (botones.length >= 3) return
    if (tipo === 'url') setBotones([...botones, { type: 'URL', text: '', url: '' }])
    else if (tipo === 'phone') setBotones([...botones, { type: 'PHONE_NUMBER', text: '', phone_number: '' }])
    else setBotones([...botones, { type: 'QUICK_REPLY', text: '' }])
  }

  const actualizarBoton = (idx, campo, valor) => {
    const copia = [...botones]
    copia[idx][campo] = valor
    setBotones(copia)
  }

  const quitarBoton = (idx) => setBotones(botones.filter((_, i) => i !== idx))

  // Extraer variables del body
  const variablesUsadas = [...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])
  const variablesUnicas = [...new Set(variablesUsadas)].sort()

  // Construir preview
  const previewBody = () => {
    let txt = body
    variablesUnicas.forEach(v => {
      const ejemplo = ejemplosVars[v] || `[Variable ${v}]`
      txt = txt.replaceAll(`{{${v}}}`, ejemplo)
    })
    return txt
  }

  const construirComponentes = () => {
    const components = []

    if (tipoHeader === 'text' && headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
    } else if (tipoHeader === 'image') {
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerImageUrl] } })
    }

    if (body) {
      const bodyComp = { type: 'BODY', text: body }
      if (variablesUnicas.length > 0) {
        bodyComp.example = {
          body_text: [variablesUnicas.map(v => ejemplosVars[v] || `ejemplo_${v}`)]
        }
      }
      components.push(bodyComp)
    }

    if (footer) {
      components.push({ type: 'FOOTER', text: footer })
    }

    if (botones.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: botones.map(b => {
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url }
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
          return { type: 'QUICK_REPLY', text: b.text }
        })
      })
    }

    return components
  }

  const enviarAMeta = async () => {
    setError(''); setExito('')
    if (!nombre.trim()) { setError('Ingresa un nombre para la plantilla'); return }
    if (!body.trim()) { setError('El cuerpo del mensaje es requerido'); return }
    if (variablesUnicas.length > 0) {
      for (const v of variablesUnicas) {
        if (!ejemplosVars[v]?.trim()) { setError(`Ingresa un ejemplo para la variable {{${v}}}`); return }
      }
    }

    setEnviando(true)
    try {
      const res = await fetchAuth('/api/campanas/plantillas/crear', {
        method: 'POST',
        body: JSON.stringify({
          name: nombre.trim(),
          category: categoria,
          language: idioma,
          components: construirComponentes()
        })
      })
      const data = await res.json()
      if (res.ok) {
        setExito('✅ Plantilla enviada a revisión de Meta exitosamente')
        setTimeout(() => { onCreated?.(); onClose?.() }, 2000)
      } else {
        setError(data.error || 'Error desconocido')
      }
    } catch (e) {
      setError('Error de conexión: ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[1100px] my-8 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e3a8a] to-[#0f766e] p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="material-symbols-outlined">chat_bubble</span>
              Constructor de Plantilla WhatsApp
            </h2>
            <p className="text-white/70 text-sm mt-1">Crea y envía a revisión de Meta</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
          {/* EDITOR (3/5) */}
          <div className="lg:col-span-3 p-6 space-y-5 border-r border-slate-100 max-h-[75vh] overflow-y-auto">

            {/* Nombre y categoría */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Nombre</label>
                <input value={nombre} onChange={e => setNombre(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="ej: promo_buen_fin" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none"/>
                <p className="text-[10px] text-slate-400 mt-1">Solo minúsculas, números y _</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Categoría</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none font-semibold">
                  {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Idioma</label>
                <select value={idioma} onChange={e => setIdioma(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none font-semibold">
                  {IDIOMAS.map(i => <option key={i.valor} value={i.valor}>{i.label}</option>)}
                </select>
              </div>
            </div>

            {/* Header */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Encabezado (Opcional)</label>
              <div className="flex gap-2 mb-2">
                {[{v:'none',l:'Sin encabezado',i:'block'},{v:'text',l:'Texto',i:'title'},{v:'image',l:'Imagen',i:'image'}].map(t => (
                  <button key={t.v} onClick={() => setTipoHeader(t.v)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border ${tipoHeader === t.v ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                    <span className="material-symbols-outlined text-[14px]">{t.i}</span>{t.l}
                  </button>
                ))}
              </div>
              {tipoHeader === 'text' && (
                <input value={headerText} onChange={e => setHeaderText(e.target.value)} maxLength={60}
                  placeholder="Título del mensaje (máx 60 caracteres)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none"/>
              )}
              {tipoHeader === 'image' && (
                <input value={headerImageUrl} onChange={e => setHeaderImageUrl(e.target.value)}
                  placeholder="URL de la imagen (https://...)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none"/>
              )}
            </div>

            {/* Variables toolbar */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Variables disponibles (clic para insertar)</label>
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map(v => (
                  <button key={v.id} onClick={() => insertarVariable(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all hover:scale-105 active:scale-95 bg-${v.color}-50 text-${v.color}-600 border-${v.color}-200 hover:bg-${v.color}-100`}>
                    <span className="material-symbols-outlined text-[12px]">{v.icon}</span>
                    {v.label} <code className="text-[10px] opacity-60">{v.id}</code>
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Cuerpo del mensaje <span className="text-red-400">*</span>
              </label>
              <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)}
                rows={5} maxLength={1024} placeholder={'Escribe tu mensaje aquí...\n\nUsa {{1}} para nombre, {{2}} para curso, etc.'}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none resize-none leading-relaxed"/>
              <div className="flex justify-between mt-1">
                <p className="text-[10px] text-slate-400">Tip: Usa *negrita*, _cursiva_ y ~tachado~</p>
                <p className="text-[10px] text-slate-400">{body.length}/1024</p>
              </div>
            </div>

            {/* Ejemplos de variables */}
            {variablesUnicas.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-[11px] font-bold text-amber-700 uppercase mb-2">⚠️ Meta requiere ejemplos para cada variable</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {variablesUnicas.map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <code className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded">{`{{${v}}}`}</code>
                      <input value={ejemplosVars[v] || ''} onChange={e => setEjemplosVars({...ejemplosVars, [v]: e.target.value})}
                        placeholder={`Ej: ${VARIABLES[parseInt(v)-1]?.label || 'valor'}`}
                        className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-sm bg-white outline-none focus:ring-1 focus:ring-amber-300"/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Pie de página (Opcional)</label>
              <input value={footer} onChange={e => setFooter(e.target.value)} maxLength={60}
                placeholder="Ej: Total English School | Colima" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-100 outline-none"/>
            </div>

            {/* Botones */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Botones (Máx 3)</label>
              <div className="flex gap-2 mb-3">
                {[{t:'quick',l:'Respuesta rápida',i:'reply'},{t:'url',l:'Enlace',i:'link'},{t:'phone',l:'Llamar',i:'call'}].map(b => (
                  <button key={b.t} onClick={() => agregarBoton(b.t)} disabled={botones.length >= 3}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-30">
                    <span className="material-symbols-outlined text-[14px]">{b.i}</span>{b.l}
                  </button>
                ))}
              </div>
              {botones.map((btn, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 w-6">{idx+1}.</span>
                  <input value={btn.text} onChange={e => actualizarBoton(idx, 'text', e.target.value)} maxLength={25}
                    placeholder="Texto del botón" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none"/>
                  {btn.type === 'URL' && (
                    <input value={btn.url} onChange={e => actualizarBoton(idx, 'url', e.target.value)}
                      placeholder="https://..." className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none"/>
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input value={btn.phone_number} onChange={e => actualizarBoton(idx, 'phone_number', e.target.value)}
                      placeholder="+523121234567" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none"/>
                  )}
                  <button onClick={() => quitarBoton(idx)} className="text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-[16px]">close</span></button>
                </div>
              ))}
            </div>

            {/* Errores y éxito */}
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl font-medium">{error}</div>}
            {exito && <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-xl font-medium">{exito}</div>}

            {/* Botón enviar */}
            <button onClick={enviarAMeta} disabled={enviando || !nombre || !body}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#1e3a8a] to-[#0f766e] hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg">
              <span className="material-symbols-outlined text-[20px]">{enviando ? 'hourglass_top' : 'send'}</span>
              {enviando ? 'Enviando a Meta...' : 'Enviar Plantilla a Revisión'}
            </button>
          </div>

          {/* PREVIEW (2/5) */}
          <div className="lg:col-span-2 bg-[#efeae2] p-6 flex flex-col items-center max-h-[75vh] overflow-y-auto">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-4 self-start">Vista previa</p>

            {/* Phone mockup */}
            <div className="w-full max-w-[320px] bg-[#efeae2] rounded-2xl p-3">
              {/* Message bubble */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Header image */}
                {tipoHeader === 'image' && headerImageUrl && (
                  <div className="w-full h-40 bg-slate-200 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={headerImageUrl} alt="Header" className="w-full h-full object-cover" onError={e => e.target.style.display='none'}/>
                  </div>
                )}
                {tipoHeader === 'image' && !headerImageUrl && (
                  <div className="w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-slate-300">image</span>
                    <p className="text-[10px] text-slate-400">Imagen de encabezado</p>
                  </div>
                )}

                <div className="p-3 space-y-1.5">
                  {/* Header text */}
                  {tipoHeader === 'text' && headerText && (
                    <p className="font-bold text-[14px] text-[#111b21]">{headerText}</p>
                  )}

                  {/* Body */}
                  <p className="text-[13px] text-[#111b21] leading-relaxed whitespace-pre-wrap">
                    {previewBody() || <span className="text-slate-300 italic">Escribe el cuerpo del mensaje...</span>}
                  </p>

                  {/* Footer */}
                  {footer && <p className="text-[11px] text-slate-400 mt-2">{footer}</p>}

                  {/* Timestamp */}
                  <p className="text-[10px] text-slate-400 text-right mt-1">
                    {new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                  </p>
                </div>

                {/* Buttons */}
                {botones.length > 0 && (
                  <div className="border-t border-slate-100">
                    {botones.map((btn, idx) => (
                      <button key={idx} className="w-full py-2.5 text-[13px] font-medium text-[#0094f4] hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 border-b border-slate-50 last:border-b-0">
                        {btn.type === 'URL' && <span className="material-symbols-outlined text-[14px]">open_in_new</span>}
                        {btn.type === 'PHONE_NUMBER' && <span className="material-symbols-outlined text-[14px]">call</span>}
                        {btn.type === 'QUICK_REPLY' && <span className="material-symbols-outlined text-[14px]">reply</span>}
                        {btn.text || `Botón ${idx+1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="mt-4 bg-white/60 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="material-symbols-outlined text-[14px]">label</span>
                  <span className="font-bold">{nombre || 'nombre_plantilla'}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="material-symbols-outlined text-[14px]">category</span>
                  <span>{CATEGORIAS.find(c => c.valor === categoria)?.label}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="material-symbols-outlined text-[14px]">language</span>
                  <span>{IDIOMAS.find(i => i.valor === idioma)?.label}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

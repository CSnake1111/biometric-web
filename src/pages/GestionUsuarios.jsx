import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────
//  GestionUsuarios — Registro de foto + enrolamiento facial
//  Sube imágenes a Supabase Storage bucket "biometric-fotos"
//  Guarda rutas en usuarios.foto y en muestras_faciales
// ─────────────────────────────────────────────────────────

const BUCKET_FOTOS    = 'biometric-fotos'
const BUCKET_MUESTRAS = 'biometric-muestras'

export default function GestionUsuarios({ user }) {
  const [usuarios, setUsuarios]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [seleccionado, setSeleccionado] = useState(null)   // usuario activo en panel derecho
  const [tab, setTab]               = useState('info')     // 'info' | 'foto' | 'facial'
  const [msg, setMsg]               = useState(null)       // {text, ok}

  // Foto
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoPreview, setFotoPreview]   = useState(null)
  const fotoInputRef = useRef()

  // Enrolamiento facial
  const videoRef    = useRef()
  const canvasRef   = useRef()
  const streamRef   = useRef()
  const [camActiva, setCamActiva]       = useState(false)
  const [capturando, setCapturando]     = useState(false)
  const [muestrasCapturadas, setMuestrasCapturadas] = useState(0)
  const [muestrasExistentes, setMuestrasExistentes] = useState(0)
  const TOTAL_MUESTRAS = 20

  const esAdmin = ['Administrador','Catedratico'].includes(user?.roles?.nombre_rol || '')

  useEffect(() => { cargarUsuarios() }, [])
  useEffect(() => {
    if (seleccionado) {
      setFotoPreview(seleccionado.foto || null)
      cargarMuestrasCount(seleccionado.id_usuario)
    }
    return () => detenerCamara()
  }, [seleccionado])

  const cargarUsuarios = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('usuarios')
      .select('id_usuario, nombre, apellido, correo, carne, tipo_persona, carrera, foto, activo, id_rol, roles!left(nombre_rol)')
      .eq('activo', true)
      .order('nombre')
    setUsuarios(data || [])
    setLoading(false)
  }

  const cargarMuestrasCount = async (idUsuario) => {
    const { count } = await supabase
      .from('muestras_faciales')
      .select('*', { count: 'exact', head: true })
      .eq('id_usuario', idUsuario)
    setMuestrasExistentes(count || 0)
  }

  const mostrarMsg = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  // ─── FILTRO ───
  const usuariosFiltrados = usuarios.filter(u => {
    const q = busqueda.toLowerCase()
    return (
      u.nombre?.toLowerCase().includes(q) ||
      u.apellido?.toLowerCase().includes(q) ||
      u.correo?.toLowerCase().includes(q) ||
      u.carne?.toLowerCase().includes(q)
    )
  })

  // ─── SUBIR FOTO DE PERFIL ───
  const handleFotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setFotoPreview(url)
  }

  const subirFoto = async () => {
    const file = fotoInputRef.current?.files[0]
    if (!file || !seleccionado) return
    setSubiendoFoto(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `fotos/${seleccionado.id_usuario}/foto_perfil.${ext}`

      const { error: upErr } = await supabase.storage
        .from(BUCKET_FOTOS)
        .upload(path, file, { upsert: true, contentType: file.type })

      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: dbErr } = await supabase
        .from('usuarios')
        .update({ foto: publicUrl })
        .eq('id_usuario', seleccionado.id_usuario)

      if (dbErr) throw dbErr

      // Actualizar local
      setSeleccionado(prev => ({ ...prev, foto: publicUrl }))
      setUsuarios(prev => prev.map(u =>
        u.id_usuario === seleccionado.id_usuario ? { ...u, foto: publicUrl } : u
      ))
      mostrarMsg('✅ Foto guardada correctamente en la nube')
    } catch (e) {
      mostrarMsg('❌ Error subiendo foto: ' + e.message, false)
    }
    setSubiendoFoto(false)
  }

  // ─── CÁMARA ───
  const iniciarCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamActiva(true)
    } catch {
      mostrarMsg('❌ No se pudo acceder a la cámara', false)
    }
  }

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCamActiva(false)
    setCapturando(false)
  }

  // ─── ENROLAMIENTO FACIAL ───
  // Captura TOTAL_MUESTRAS frames desde la cámara,
  // los sube a Supabase Storage y registra en muestras_faciales
  const iniciarEnrolamiento = async () => {
    if (!seleccionado) return
    if (!camActiva) { await iniciarCamara(); return }

    setCapturando(true)
    setMuestrasCapturadas(0)

    // Borrar muestras anteriores de esta persona
    await supabase
      .from('muestras_faciales')
      .delete()
      .eq('id_usuario', seleccionado.id_usuario)

    // Borrar archivos anteriores en storage
    const { data: archivosAnt } = await supabase.storage
      .from(BUCKET_MUESTRAS)
      .list(`muestras/${seleccionado.id_usuario}`)
    if (archivosAnt?.length) {
      const paths = archivosAnt.map(f => `muestras/${seleccionado.id_usuario}/${f.name}`)
      await supabase.storage.from(BUCKET_MUESTRAS).remove(paths)
    }

    let capturadas = 0
    const canvas = canvasRef.current
    const video  = videoRef.current

    const capturarFrame = async () => {
      if (capturadas >= TOTAL_MUESTRAS) {
        setCapturando(false)
        setMuestrasExistentes(TOTAL_MUESTRAS)
        mostrarMsg(`✅ ${TOTAL_MUESTRAS} muestras faciales guardadas en la nube`)
        return
      }

      canvas.width  = video.videoWidth  || 320
      canvas.height = video.videoHeight || 240
      canvas.getContext('2d').drawImage(video, 0, 0)

      canvas.toBlob(async (blob) => {
        if (!blob) { setTimeout(capturarFrame, 300); return }

        const nombreArchivo = `muestra_${capturadas}.jpg`
        const storagePath   = `muestras/${seleccionado.id_usuario}/${nombreArchivo}`

        try {
          const { error: upErr } = await supabase.storage
            .from(BUCKET_MUESTRAS)
            .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from(BUCKET_MUESTRAS)
              .getPublicUrl(storagePath)

            await supabase.from('muestras_faciales').insert({
              id_usuario:     seleccionado.id_usuario,
              nombre_archivo: urlData.publicUrl,
              fecha_captura:  new Date().toISOString()
            })

            capturadas++
            setMuestrasCapturadas(capturadas)
          }
        } catch (e) {
          console.error('Error capturando muestra:', e)
        }

        // Pausa entre capturas para variación
        setTimeout(capturarFrame, 400)
      }, 'image/jpeg', 0.85)
    }

    capturarFrame()
  }

  const cancelarEnrolamiento = () => {
    setCapturando(false)
    detenerCamara()
  }

  const eliminarMuestras = async () => {
    if (!seleccionado || !confirm('¿Eliminar todas las muestras faciales de este usuario?')) return
    await supabase.from('muestras_faciales').delete().eq('id_usuario', seleccionado.id_usuario)
    const { data: archivos } = await supabase.storage
      .from(BUCKET_MUESTRAS).list(`muestras/${seleccionado.id_usuario}`)
    if (archivos?.length) {
      const paths = archivos.map(f => `muestras/${seleccionado.id_usuario}/${f.name}`)
      await supabase.storage.from(BUCKET_MUESTRAS).remove(paths)
    }
    setMuestrasExistentes(0)
    setMuestrasCapturadas(0)
    mostrarMsg('🗑 Muestras eliminadas')
  }

  if (!esAdmin) return (
    <div style={S.center}>
      <p style={{ color: 'var(--text2)' }}>Solo administradores y catedráticos pueden gestionar usuarios.</p>
    </div>
  )

  return (
    <div style={S.root}>
      {/* ── Panel izquierdo: lista ── */}
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <h2 style={S.sideTitle}>👥 Usuarios</h2>
          <input
            style={S.search}
            placeholder="Buscar por nombre, carné..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={S.center}><span style={S.spin} /></div>
        ) : (
          <div style={S.lista}>
            {usuariosFiltrados.map(u => (
              <button
                key={u.id_usuario}
                style={{ ...S.userItem, ...(seleccionado?.id_usuario === u.id_usuario ? S.userItemActive : {}) }}
                onClick={() => { setSeleccionado(u); setTab('info'); setMuestrasCapturadas(0) }}
              >
                <div style={S.avatar}>
                  {u.foto
                    ? <img src={u.foto} alt="" style={S.avatarImg} />
                    : <span style={{ fontSize: 20 }}>👤</span>
                  }
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={S.userName}>{u.nombre} {u.apellido}</div>
                  <div style={S.userSub}>{u.roles?.nombre_rol || 'Sin rol'} · {u.carne || 'sin carné'}</div>
                </div>
                {/* Badge biométrico */}
                <div style={{ fontSize: 11, color: u.foto ? '#10b981' : '#6b7280' }} title="Foto">📷</div>
              </button>
            ))}
            {usuariosFiltrados.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                Sin resultados
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Panel derecho: detalle ── */}
      <div style={S.detail}>
        {!seleccionado ? (
          <div style={S.center}>
            <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
              <p>Selecciona un usuario para gestionar su foto y datos biométricos</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header del usuario */}
            <div style={S.detailHeader}>
              <div style={S.avatarLg}>
                {seleccionado.foto
                  ? <img src={seleccionado.foto} alt="" style={S.avatarImgLg} />
                  : <span style={{ fontSize: 36 }}>👤</span>
                }
              </div>
              <div>
                <h3 style={S.detailName}>{seleccionado.nombre} {seleccionado.apellido}</h3>
                <p style={S.detailSub}>{seleccionado.roles?.nombre_rol} · {seleccionado.correo}</p>
                <div style={S.badges}>
                  <span style={{ ...S.badge, background: seleccionado.foto ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)', color: seleccionado.foto ? '#10b981' : '#9ca3af' }}>
                    📷 {seleccionado.foto ? 'Foto ✓' : 'Sin foto'}
                  </span>
                  <span style={{ ...S.badge, background: muestrasExistentes > 0 ? 'rgba(37,99,235,0.15)' : 'rgba(107,114,128,0.15)', color: muestrasExistentes > 0 ? '#60a5fa' : '#9ca3af' }}>
                    👁 {muestrasExistentes > 0 ? `${muestrasExistentes} muestras ✓` : 'Sin datos faciales'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={S.tabs}>
              {[['info','📋 Info'],['foto','📷 Foto'],['facial','👁 Facial']].map(([t, l]) => (
                <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
                  onClick={() => { setTab(t); if (t !== 'facial') detenerCamara() }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Mensaje */}
            {msg && (
              <div style={{ ...S.msgBox, background: msg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)', borderColor: msg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(220,38,38,0.3)', color: msg.ok ? '#6ee7b7' : '#fca5a5' }}>
                {msg.text}
              </div>
            )}

            {/* ── Tab Info ── */}
            {tab === 'info' && (
              <div style={S.infoGrid}>
                {[
                  ['Carné', seleccionado.carne],
                  ['Correo', seleccionado.correo],
                  ['Tipo', seleccionado.tipo_persona],
                  ['Carrera', seleccionado.carrera],
                  ['Sección', seleccionado.seccion],
                  ['Rol', seleccionado.roles?.nombre_rol],
                ].map(([k, v]) => v ? (
                  <div key={k} style={S.infoRow}>
                    <span style={S.infoKey}>{k}</span>
                    <span style={S.infoVal}>{v}</span>
                  </div>
                ) : null)}
              </div>
            )}

            {/* ── Tab Foto ── */}
            {tab === 'foto' && (
              <div style={S.fotoWrap}>
                <p style={S.hint}>
                  Sube una foto de perfil. Se guardará en la nube y se usará en reportes y dashboards.
                </p>

                <div style={S.fotoBox}>
                  {fotoPreview
                    ? <img src={fotoPreview} alt="preview" style={S.fotoPreview} />
                    : <div style={S.fotoPlaceholder}><span style={{ fontSize: 48 }}>📷</span><p style={{ color: 'var(--text3)', fontSize: 13 }}>Sin foto</p></div>
                  }
                </div>

                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFotoChange}
                />

                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={S.btnSecondary} onClick={() => fotoInputRef.current?.click()}>
                    📁 Seleccionar imagen
                  </button>
                  <button
                    style={{ ...S.btnPrimary, opacity: subiendoFoto ? .6 : 1 }}
                    onClick={subirFoto}
                    disabled={subiendoFoto || !fotoPreview}
                  >
                    {subiendoFoto ? <><span style={S.spin} /> Subiendo...</> : '☁ Guardar en nube'}
                  </button>
                </div>

                <p style={{ ...S.hint, marginTop: 8 }}>
                  💡 También puedes tomar una foto con la cámara usando la pestaña <strong>Facial</strong>.
                </p>
              </div>
            )}

            {/* ── Tab Facial ── */}
            {tab === 'facial' && (
              <div style={S.facialWrap}>
                <p style={S.hint}>
                  Captura <strong>{TOTAL_MUESTRAS} muestras faciales</strong> para que el sistema pueda identificar al usuario por reconocimiento facial. El proceso toma unos segundos.
                </p>

                {/* Estado actual */}
                <div style={S.statsRow}>
                  <div style={S.statBox}>
                    <span style={S.statNum}>{muestrasExistentes}</span>
                    <span style={S.statLbl}>en nube</span>
                  </div>
                  <div style={S.statBox}>
                    <span style={{ ...S.statNum, color: '#2563eb' }}>{muestrasCapturadas}</span>
                    <span style={S.statLbl}>esta sesión</span>
                  </div>
                  <div style={S.statBox}>
                    <span style={{ ...S.statNum, color: '#d97706' }}>{TOTAL_MUESTRAS}</span>
                    <span style={S.statLbl}>objetivo</span>
                  </div>
                </div>

                {/* Cámara */}
                <div style={S.camBox}>
                  <video ref={videoRef} style={{ ...S.video, display: camActiva ? 'block' : 'none' }} playsInline muted autoPlay />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />

                  {!camActiva && (
                    <div style={S.camPlaceholder}>
                      <span style={{ fontSize: 48 }}>👁</span>
                      <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
                        Presiona "Iniciar cámara" para comenzar
                      </p>
                    </div>
                  )}

                  {/* Barra de progreso durante captura */}
                  {capturando && (
                    <div style={S.progressOverlay}>
                      <div style={S.progressBar}>
                        <div style={{ ...S.progressFill, width: `${(muestrasCapturadas / TOTAL_MUESTRAS) * 100}%` }} />
                      </div>
                      <p style={{ color: '#fff', fontSize: 13, marginTop: 8 }}>
                        Capturando... {muestrasCapturadas}/{TOTAL_MUESTRAS}
                      </p>
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {!camActiva ? (
                    <button style={S.btnPrimary} onClick={iniciarCamara}>
                      📹 Iniciar cámara
                    </button>
                  ) : !capturando ? (
                    <>
                      <button style={S.btnPrimary} onClick={iniciarEnrolamiento}>
                        ▶ {muestrasExistentes > 0 ? 'Re-enrolar' : 'Enrolar rostro'}
                      </button>
                      <button style={S.btnSecondary} onClick={detenerCamara}>
                        ⏹ Detener cámara
                      </button>
                    </>
                  ) : (
                    <button style={{ ...S.btnSecondary, borderColor: 'rgba(220,38,38,0.4)', color: '#fca5a5' }} onClick={cancelarEnrolamiento}>
                      ✕ Cancelar
                    </button>
                  )}

                  {muestrasExistentes > 0 && !capturando && (
                    <button style={{ ...S.btnSecondary, borderColor: 'rgba(220,38,38,0.3)', color: '#f87171' }} onClick={eliminarMuestras}>
                      🗑 Eliminar muestras
                    </button>
                  )}
                </div>

                <p style={S.hint}>
                  💡 Pide al usuario que mire directo a la cámara con buena iluminación. El sistema capturará imágenes automáticamente cada 0.4 segundos.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Estilos ───
const S = {
  root: {
    display: 'flex', height: '100%', gap: 0, overflow: 'hidden',
  },
  sidebar: {
    width: 280, flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column',
    background: 'rgba(255,255,255,0.015)',
  },
  sideHeader: { padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  sideTitle:  { fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 10, fontFamily: 'Syne,sans-serif' },
  search: {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  },
  lista: { flex: 1, overflowY: 'auto', padding: '8px 8px' },
  userItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 10px', borderRadius: 10, border: 'none',
    background: 'transparent', cursor: 'pointer', transition: 'background .15s',
    marginBottom: 2,
  },
  userItemActive: { background: 'rgba(37,99,235,0.12)', outline: '1px solid rgba(37,99,235,0.3)' },
  avatar: {
    width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  userName: { fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'left' },
  userSub:  { fontSize: 11, color: 'var(--text3)', marginTop: 1 },

  // Detail panel
  detail: {
    flex: 1, padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
  },
  detailHeader: { display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  avatarLg: {
    width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid rgba(37,99,235,0.3)',
  },
  avatarImgLg: { width: '100%', height: '100%', objectFit: 'cover' },
  detailName: { fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'Syne,sans-serif', margin: 0 },
  detailSub:  { fontSize: 12, color: 'var(--text2)', marginTop: 3 },
  badges: { display: 'flex', gap: 8, marginTop: 8 },
  badge: { fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600 },

  tabs: { display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 },
  tab: {
    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  tabActive: { background: 'rgba(255,255,255,0.08)', color: 'var(--text)', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },

  msgBox: { padding: '10px 14px', borderRadius: 10, border: '1px solid', fontSize: 13 },

  // Info tab
  infoGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  infoRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 },
  infoKey: { fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' },
  infoVal: { fontSize: 13, color: 'var(--text)', fontWeight: 500 },

  // Foto tab
  fotoWrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  fotoBox: {
    width: 200, height: 200, borderRadius: 12, overflow: 'hidden',
    background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  fotoPreview: { width: '100%', height: '100%', objectFit: 'cover' },
  fotoPlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },

  // Facial tab
  facialWrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  statsRow: { display: 'flex', gap: 12 },
  statBox: {
    flex: 1, textAlign: 'center', padding: '12px 8px',
    background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
  },
  statNum: { display: 'block', fontSize: 28, fontWeight: 700, color: '#10b981', fontFamily: 'Syne,sans-serif' },
  statLbl: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' },

  camBox: {
    width: '100%', maxWidth: 400, aspectRatio: '4/3', borderRadius: 14, overflow: 'hidden',
    background: '#06090f', border: '1px solid rgba(255,255,255,0.08)',
    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  camPlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  progressOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px',
    background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  progressBar: { width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.2)' },
  progressFill: { height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#2563eb,#10b981)', transition: 'width .3s' },

  // Botones
  btnPrimary: {
    padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg,#1e3a6e,#2563eb)', color: '#fff',
    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
  },
  btnSecondary: {
    padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text2)', fontSize: 13, fontWeight: 500,
  },
  hint: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 },
  spin: {
    width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite',
  },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}

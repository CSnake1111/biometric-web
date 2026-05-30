import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
//  DashboardMaestro — Catedráticos
//  Pueden: tomar asistencia, ver sus alumnos (solo info)
//  NO pueden: modificar datos, ver cursos de otros, acceder a gestión de usuarios
// ─────────────────────────────────────────────────────────────────────────────

const DAY_COLORS = {
  'Lunes':'#2563eb','Martes':'#7c3aed','Miércoles':'#db2777',
  'Jueves':'#d97706','Viernes':'#059669','Sábado':'#0891b2',
}

const ESTADO_COLOR = {
  PRESENTE:    { bg:'rgba(16,185,129,0.15)',  text:'#10b981', border:'rgba(16,185,129,0.3)'  },
  AUSENTE:     { bg:'rgba(239,68,68,0.15)',   text:'#ef4444', border:'rgba(239,68,68,0.3)'   },
  TARDANZA:    { bg:'rgba(139,92,246,0.15)',  text:'#8b5cf6', border:'rgba(139,92,246,0.3)'  },
  JUSTIFICADO: { bg:'rgba(245,158,11,0.15)',  text:'#f59e0b', border:'rgba(245,158,11,0.3)'  },
  PENDIENTE:   { bg:'rgba(71,85,105,0.15)',   text:'#94a3b8', border:'rgba(71,85,105,0.3)'   },
}

const TABS = [
  ['cursos',    '📚 Mis Cursos'],
  ['historial', '📋 Asistencia Hoy'],
  ['alumnos',   '👥 Mis Alumnos'],
]

export default function DashboardMaestro({ user, onLogout, onIrAsistencia }) {
  const [tab, setTab]         = useState('cursos')
  const [ahora, setAhora]     = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [cursos, setCursos]   = useState([])
  const [stats, setStats]     = useState({ cursos:0, estudiantes:0, presentes:0, pct:0 })

  // Historial
  const [historial, setHistorial]   = useState([])
  const [loadHist, setLoadHist]     = useState(false)

  // Alumnos
  const [alumnos, setAlumnos]       = useState([])
  const [loadAlumnos, setLoadAlumnos] = useState(false)
  const [busqAlumnos, setBusqAlumnos] = useState('')
  const [alumnoSel, setAlumnoSel]   = useState(null)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchCursos() }, [user])
  useEffect(() => {
    if (tab === 'historial') fetchHistorial()
    if (tab === 'alumnos' && alumnos.length === 0) fetchAlumnos()
  }, [tab])

  const fetchCursos = async () => {
    setLoading(true)
    try {
      const { data: cs } = await supabase
        .from('cursos')
        .select('*, salones(nombre,nivel), inscripciones_curso(id_inscripcion,activo)')
        .eq('activo', true)
        .eq('id_catedratico', user.id_usuario)

      const lista = cs || []
      setCursos(lista)

      const hoy = new Date().toISOString().split('T')[0]
      const ids = lista.map(c => c.id_curso)
      let presentes = 0
      if (ids.length > 0) {
        const { count } = await supabase.from('asistencias')
          .select('*', { count:'exact', head:true })
          .in('id_curso', ids).eq('fecha', hoy).eq('estado','PRESENTE')
        presentes = count || 0
      }

      const totalEst = lista.reduce((a,c) => a + (c.inscripciones_curso?.filter(i=>i.activo).length||0), 0)
      const pct = totalEst > 0 ? Math.round((presentes/totalEst)*100) : 0
      setStats({ cursos:lista.length, estudiantes:totalEst, presentes, pct })
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const fetchHistorial = async () => {
    setLoadHist(true)
    const hoy = new Date().toISOString().split('T')[0]
    const ids = cursos.map(c => c.id_curso)
    if (ids.length === 0) { setHistorial([]); setLoadHist(false); return }
    const { data } = await supabase.from('asistencias')
      .select('*, usuarios(nombre,apellido,carne), cursos(nombre_curso,seccion)')
      .in('id_curso', ids).eq('fecha', hoy)
      .order('id_asistencia', { ascending:false }).limit(200)
    setHistorial(data || [])
    setLoadHist(false)
  }

  const fetchAlumnos = async () => {
    setLoadAlumnos(true)
    if (cursos.length === 0) { setAlumnos([]); setLoadAlumnos(false); return }
    const ids = cursos.map(c => c.id_curso)
    const { data: insc } = await supabase.from('inscripciones_curso')
      .select('id_estudiante, id_curso, cursos(nombre_curso,seccion)')
      .in('id_curso', ids).eq('activo', true)

    if (!insc || insc.length === 0) { setAlumnos([]); setLoadAlumnos(false); return }

    const idsEst = [...new Set(insc.map(i => i.id_estudiante))]
    const { data: usrs } = await supabase.from('usuarios')
      .select('id_usuario,nombre,apellido,correo,carne,carrera,seccion,foto,activo')
      .in('id_usuario', idsEst).eq('activo', true).order('nombre')

    // Añadir qué cursos tiene cada alumno
    const alumnosConCursos = (usrs || []).map(u => {
      const misCursos = insc
        .filter(i => i.id_estudiante === u.id_usuario)
        .map(i => i.cursos)
        .filter(Boolean)
      return { ...u, misInscripciones: misCursos }
    })

    setAlumnos(alumnosConCursos)
    setLoadAlumnos(false)
  }

  const fmt    = d => d.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const fmtDate = d => d.toLocaleDateString('es-GT', { weekday:'long', day:'numeric', month:'long' })

  const alumnosFiltrados = alumnos.filter(u => {
    const q = busqAlumnos.toLowerCase()
    return !q || `${u.nombre} ${u.apellido} ${u.correo} ${u.carne||''}`.toLowerCase().includes(q)
  })

  return (
    <div style={L.root}>
      {/* ═══ SIDEBAR ═══ */}
      <aside style={L.sidebar}>
        <div style={L.sTop}>
          <div style={L.brand}>
            <img src="/logo_umg.png" alt="UMG"
              style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(200,168,75,0.4)' }}
              onError={e => { e.target.style.display='none' }}
            />
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:'Syne,sans-serif', lineHeight:1.2 }}>BiometricUMG</div>
              <div style={{ fontSize:9, color:'var(--gold)', fontFamily:"'DM Mono',monospace", marginTop:1 }}>Portal Catedrático</div>
            </div>
          </div>

          <div style={L.userCard}>
            <div style={{ ...L.avatar, overflow:'hidden', padding:0 }}>
              {user.foto
                ? <img src={user.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                : <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{user.nombre?.[0]}{user.apellido?.[0]}</span>
              }
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {user.nombre} {user.apellido}
              </div>
              <div style={{ fontSize:10, color:'var(--gold)', fontFamily:"'DM Mono',monospace", marginTop:2 }}>Catedrático</div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--green2)', display:'inline-block', animation:'pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontSize:11, color:'var(--text2)' }}>Conectado · Supabase</span>
          </div>

          <nav style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {TABS.map(([t,l]) => (
              <button key={t} style={{ ...L.navBtn, ...(tab===t ? L.navBtnActive : {}) }} onClick={() => setTab(t)}>{l}</button>
            ))}
          </nav>
        </div>

        <div style={L.sBot}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:28, fontWeight:500, color:'var(--text)', letterSpacing:'-1px' }}>{fmt(ahora)}</div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'capitalize', marginBottom:12 }}>{fmtDate(ahora)}</div>
          <button style={L.logoutBtn} onClick={onLogout}>⏻ Cerrar sesión</button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main style={L.main}>

        {/* Stats */}
        <div style={L.statsRow} className="fade-up">
          {[
            { label:'Mis cursos',      val:stats.cursos,      icon:'📚', color:'var(--accent2)' },
            { label:'Mis estudiantes', val:stats.estudiantes, icon:'👥', color:'#7c3aed' },
            { label:'Presentes hoy',   val:stats.presentes,   icon:'✅', color:'var(--green2)' },
            { label:'% Asistencia',    val:`${stats.pct}%`,   icon:'📊', color:'var(--gold)' },
          ].map((s,i) => (
            <div key={i} style={L.statCard}>
              <span style={{ fontSize:26 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:26, fontWeight:700, color:s.color, letterSpacing:'-1px', fontFamily:'Syne,sans-serif' }}>
                  {loading ? '—' : s.val}
                </div>
                <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── MIS CURSOS ── */}
        {tab === 'cursos' && (
          <>
            <div style={L.sectionHeader} className="fade-up fade-up-1">
              <h2 style={L.sectionTitle}>Mis Cursos</h2>
              <button style={L.refreshBtn} onClick={fetchCursos}>↻ Actualizar</button>
            </div>

            {loading ? (
              <div style={L.grid}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:200, borderRadius:16 }}/>)}
              </div>
            ) : cursos.length === 0 ? (
              <div style={L.empty}>
                <div style={{ fontSize:56 }}>📭</div>
                <p style={{ fontSize:17, fontWeight:600, color:'var(--text)', marginTop:12 }}>Sin cursos asignados</p>
                <p style={{ fontSize:13, color:'var(--text2)', marginTop:4 }}>Contacta al administrador</p>
              </div>
            ) : (
              <div style={L.grid}>
                {cursos.map((c,i) => {
                  const color = DAY_COLORS[c.dia_semana] || 'var(--accent)'
                  const inscritos = c.inscripciones_curso?.filter(x=>x.activo).length || 0
                  return (
                    <div key={c.id_curso} style={L.courseCard} className={`fade-up fade-up-${Math.min(i+1,5)}`}
                      onClick={() => onIrAsistencia(c)}>
                      <div style={{ height:4, background:`linear-gradient(90deg,${color},${color}88)` }}/>
                      <div style={{ padding:20 }}>
                        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                          <span style={{ ...L.badge, background:`${color}22`, color, border:`1px solid ${color}44` }}>{c.dia_semana||'Sin día'}</span>
                          <span style={{ ...L.badge, background:'rgba(255,255,255,0.04)', color:'var(--text2)' }}>Sección {c.seccion||'—'}</span>
                        </div>
                        <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:10, lineHeight:1.3, fontFamily:'Syne,sans-serif' }}>
                          {c.nombre_curso}
                        </h3>
                        <div style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--text2)', marginBottom:16 }}>
                          <span>🕐 {c.hora_inicio||'—'} – {c.hora_fin||'—'}</span>
                          <span>📍 {c.salones?.nombre||'Sin salón'} · {c.salones?.nivel||''}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div>
                            <span style={{ fontSize:22, fontWeight:700, color:'var(--text)', fontFamily:'Syne,sans-serif' }}>{inscritos}</span>
                            <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>estudiantes</span>
                          </div>
                          <button style={{ ...L.asistBtn, background:`linear-gradient(135deg,${color}cc,${color})` }}>
                            Tomar asistencia →
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── ASISTENCIA HOY ── */}
        {tab === 'historial' && (
          <div className="fade-up">
            <div style={L.sectionHeader}>
              <h2 style={L.sectionTitle}>Asistencia de Hoy</h2>
              <button style={L.refreshBtn} onClick={fetchHistorial}>↻ Actualizar</button>
            </div>
            {loadHist ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height:52, borderRadius:10 }}/>)}
              </div>
            ) : historial.length === 0 ? (
              <div style={L.empty}>
                <div style={{ fontSize:48 }}>📋</div>
                <p style={{ color:'var(--text2)', marginTop:12 }}>Sin registros de asistencia hoy</p>
              </div>
            ) : (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['Estudiante','Carné','Curso','Estado','Hora'].map(h => (
                        <th key={h} style={L.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map(a => {
                      const col = ESTADO_COLOR[a.estado] || ESTADO_COLOR.PENDIENTE
                      return (
                        <tr key={a.id_asistencia} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                          <td style={L.td}><span style={{ fontSize:13, color:'var(--text)' }}>{a.usuarios?.nombre} {a.usuarios?.apellido}</span></td>
                          <td style={L.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--text2)' }}>{a.usuarios?.carne||'—'}</span></td>
                          <td style={L.td}><span style={{ fontSize:12, color:'var(--text2)' }}>{a.cursos?.nombre_curso} ({a.cursos?.seccion})</span></td>
                          <td style={L.td}>
                            <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:col.bg, color:col.text, border:`1px solid ${col.border}` }}>
                              {a.estado||'PENDIENTE'}
                            </span>
                          </td>
                          <td style={L.td}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--text2)' }}>{a.hora_ingreso||'—'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MIS ALUMNOS (solo lectura) ── */}
        {tab === 'alumnos' && (
          <div className="fade-up">
            <div style={L.sectionHeader}>
              <h2 style={L.sectionTitle}>Mis Alumnos</h2>
              <button style={L.refreshBtn} onClick={fetchAlumnos}>↻ Actualizar</button>
            </div>

            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:4 }}>
              Vista de solo lectura. Para modificar datos usa la app de escritorio.
            </div>

            <input
              style={{ ...L.searchInput, width:'100%', marginBottom:12 }}
              placeholder="🔍 Buscar por nombre, carné, correo..."
              value={busqAlumnos}
              onChange={e => setBusqAlumnos(e.target.value)}
            />

            {loadAlumnos ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:60, borderRadius:12 }}/>)}
              </div>
            ) : alumnosFiltrados.length === 0 ? (
              <div style={L.empty}>
                <div style={{ fontSize:48 }}>👥</div>
                <p style={{ color:'var(--text2)', marginTop:12 }}>
                  {alumnos.length === 0 ? 'No hay alumnos inscritos en tus cursos' : 'Sin resultados para esa búsqueda'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:8 }}>{alumnosFiltrados.length} alumnos</div>
                <div style={{ display:'flex', gap:14 }}>
                  {/* Lista */}
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                    {alumnosFiltrados.map(u => (
                      <div key={u.id_usuario}
                        style={{
                          display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                          background: alumnoSel?.id_usuario === u.id_usuario ? 'rgba(37,99,235,0.1)' : 'var(--surface)',
                          border:`1px solid ${alumnoSel?.id_usuario === u.id_usuario ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`,
                          borderRadius:12, cursor:'pointer', transition:'all .15s',
                        }}
                        onClick={() => setAlumnoSel(alumnoSel?.id_usuario === u.id_usuario ? null : u)}>
                        <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(37,99,235,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--accent3)', flexShrink:0, overflow:'hidden' }}>
                          {u.foto
                            ? <img src={u.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : `${u.nombre?.[0]||''}${u.apellido?.[0]||''}`
                          }
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{u.nombre} {u.apellido}</div>
                          <div style={{ fontSize:11, color:'var(--text3)' }}>{u.carne||'sin carné'} · {u.correo}</div>
                        </div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>{u.misInscripciones?.length||0} curso(s)</div>
                      </div>
                    ))}
                  </div>

                  {/* Detalle del alumno seleccionado */}
                  {alumnoSel && (
                    <div style={{ width:280, flexShrink:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 16px', alignSelf:'flex-start' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text)', fontFamily:'Syne,sans-serif' }}>Detalle</h3>
                        <button style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:16 }} onClick={() => setAlumnoSel(null)}>✕</button>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(37,99,235,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'var(--accent3)', overflow:'hidden' }}>
                          {alumnoSel.foto
                            ? <img src={alumnoSel.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : `${alumnoSel.nombre?.[0]||''}${alumnoSel.apellido?.[0]||''}`
                          }
                        </div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{alumnoSel.nombre} {alumnoSel.apellido}</div>
                          <div style={{ fontSize:11, color:'var(--text3)' }}>Estudiante</div>
                        </div>
                      </div>
                      {[
                        ['Carné',    alumnoSel.carne],
                        ['Correo',   alumnoSel.correo],
                        ['Carrera',  alumnoSel.carrera],
                        ['Sección',  alumnoSel.seccion],
                      ].map(([k,v]) => v ? (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{k}</span>
                          <span style={{ fontSize:12, color:'var(--text)', fontWeight:500, maxWidth:160, textAlign:'right' }}>{v}</span>
                        </div>
                      ) : null)}
                      <div style={{ marginTop:14 }}>
                        <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Cursos inscritos</div>
                        {alumnoSel.misInscripciones?.map((c,i) => (
                          <div key={i} style={{ fontSize:12, color:'var(--text2)', padding:'5px 8px', background:'rgba(255,255,255,0.03)', borderRadius:6, marginBottom:4 }}>
                            📚 {c.nombre_curso} ({c.seccion})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

const L = {
  root: { display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg)' },
  sidebar: {
    width:260, flexShrink:0, background:'var(--bg2)',
    borderRight:'1px solid var(--border)',
    display:'flex', flexDirection:'column', justifyContent:'space-between',
    padding:'24px 18px',
  },
  sTop:  { display:'flex', flexDirection:'column', gap:18 },
  sBot:  { display:'flex', flexDirection:'column', gap:6 },
  brand: { display:'flex', alignItems:'center', gap:10 },
  userCard: {
    display:'flex', alignItems:'center', gap:10,
    background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)',
    borderRadius:12, padding:'10px 12px',
  },
  avatar: {
    width:36, height:36, borderRadius:'50%',
    background:'linear-gradient(135deg,#1e3a6e,#2563eb)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:13, fontWeight:700, flexShrink:0,
  },
  navBtn: {
    textAlign:'left', padding:'10px 12px', borderRadius:10,
    border:'none', background:'transparent', color:'var(--text2)',
    fontSize:13, fontWeight:500, transition:'all .2s', cursor:'pointer',
  },
  navBtnActive: { background:'rgba(37,99,235,0.12)', color:'var(--accent3)', fontWeight:600 },
  logoutBtn: {
    background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)',
    borderRadius:10, padding:'10px 14px', color:'#fca5a5',
    fontSize:13, fontWeight:500, width:'100%', cursor:'pointer',
  },
  main: { flex:1, overflow:'auto', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 },
  statCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, padding:'16px',
    display:'flex', alignItems:'center', gap:14,
  },
  sectionHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  sectionTitle: { fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.5px', fontFamily:'Syne,sans-serif' },
  refreshBtn: {
    background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.25)',
    borderRadius:10, padding:'9px 16px', color:'var(--accent3)', fontSize:13, fontWeight:500, cursor:'pointer',
  },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 },
  courseCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:16, overflow:'hidden', cursor:'pointer',
    transition:'transform .2s, border-color .2s',
  },
  badge: { fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 10px', fontFamily:"'DM Mono',monospace" },
  asistBtn: {
    border:'none', borderRadius:8, padding:'8px 14px',
    color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer',
  },
  th: {
    padding:'12px 14px', fontSize:11, fontWeight:600, color:'var(--text2)',
    textTransform:'uppercase', letterSpacing:'.06em', textAlign:'left',
    borderBottom:'1px solid var(--border)', background:'rgba(0,0,0,0.2)',
    position:'sticky', top:0,
  },
  td: { padding:'11px 14px', verticalAlign:'middle' },
  searchInput: {
    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13,
    boxSizing:'border-box',
  },
  empty: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, gap:8 },
}

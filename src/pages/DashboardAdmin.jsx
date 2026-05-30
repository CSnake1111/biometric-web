import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
//  DashboardAdmin — Supervisión de todo el sistema (solo lectura + control)
//  Admins ven todo pero NO modifican datos (eso es la app de escritorio)
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO_COLOR = {
  PRESENTE:    { bg:'rgba(16,185,129,0.15)',  text:'#10b981', border:'rgba(16,185,129,0.3)'  },
  AUSENTE:     { bg:'rgba(239,68,68,0.15)',   text:'#ef4444', border:'rgba(239,68,68,0.3)'   },
  TARDANZA:    { bg:'rgba(139,92,246,0.15)',  text:'#8b5cf6', border:'rgba(139,92,246,0.3)'  },
  JUSTIFICADO: { bg:'rgba(245,158,11,0.15)',  text:'#f59e0b', border:'rgba(245,158,11,0.3)'  },
  PENDIENTE:   { bg:'rgba(71,85,105,0.15)',   text:'#94a3b8', border:'rgba(71,85,105,0.3)'   },
}

const DAY_COLORS = {
  'Lunes':'#2563eb','Martes':'#7c3aed','Miércoles':'#db2777',
  'Jueves':'#d97706','Viernes':'#059669','Sábado':'#0891b2',
}

const TABS = [
  ['overview',   '📊 Resumen'],
  ['cursos',     '📚 Cursos'],
  ['asistencia', '📋 Asistencia Hoy'],
  ['usuarios',   '👥 Usuarios'],
  ['auditoria',  '🔍 Auditoría'],
]

export default function DashboardAdmin({ user, onLogout, onIrAsistencia }) {
  const [tab, setTab]         = useState('overview')
  const [ahora, setAhora]     = useState(new Date())
  const [loading, setLoading] = useState(true)

  // Stats globales
  const [stats, setStats] = useState({
    totalUsuarios: 0, totalEstudiantes: 0, totalCatedraticos: 0,
    totalCursos: 0, totalInscritos: 0,
    presentes: 0, ausentes: 0, tardanzas: 0, pendientes: 0,
    pctAsistencia: 0,
  })

  // Datos por tab
  const [cursos, setCursos]       = useState([])
  const [asistencias, setAsist]   = useState([])
  const [usuarios, setUsuarios]   = useState([])
  const [auditoria, setAuditoria] = useState([])
  const [busqUsuario, setBusqUsuario] = useState('')
  const [filtroRol, setFiltroRol]     = useState('TODOS')

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchAll() }, [])
  useEffect(() => {
    if (tab === 'auditoria' && auditoria.length === 0) fetchAuditoria()
    if (tab === 'usuarios'  && usuarios.length === 0)  fetchUsuarios()
  }, [tab])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const [
        { count: totUsr },
        { count: totEst },
        { count: totCat },
        { data: cursosData },
        { data: asistData },
      ] = await Promise.all([
        supabase.from('usuarios').select('*', { count:'exact', head:true }).eq('activo', true),
        supabase.from('usuarios').select('*', { count:'exact', head:true }).eq('activo', true).eq('id_rol',
          supabase.from('roles').select('id_rol').eq('nombre_rol','Estudiante')
        ),
        supabase.from('usuarios').select('*', { count:'exact', head:true }).eq('activo', true).eq('id_rol',
          supabase.from('roles').select('id_rol').eq('nombre_rol','Catedratico')
        ),
        supabase.from('cursos').select(`
          *, salones(nombre,nivel),
          usuarios!cursos_id_catedratico_fkey(nombre,apellido),
          inscripciones_curso!inner(id_inscripcion, activo)
        `).eq('activo', true),
        supabase.from('asistencias').select(`
          *, usuarios(nombre,apellido,carne),
          cursos(nombre_curso,seccion)
        `).eq('fecha', hoy).order('id_asistencia', { ascending:false }).limit(200),
      ])

      const lista = cursosData || []
      setCursos(lista)
      setAsist(asistData || [])

      const asist = asistData || []
      const presentes  = asist.filter(a => a.estado === 'PRESENTE').length
      const ausentes   = asist.filter(a => a.estado === 'AUSENTE').length
      const tardanzas  = asist.filter(a => a.estado === 'TARDANZA').length
      const pendientes = asist.filter(a => a.estado === 'PENDIENTE' || !a.estado).length
      const totalInscritos = lista.reduce((s,c) => s + (c.inscripciones_curso?.filter(i=>i.activo).length||0), 0)
      const pct = (presentes + tardanzas) > 0
        ? Math.round(((presentes + tardanzas) / Math.max(1, presentes + ausentes + tardanzas + pendientes)) * 100)
        : 0

      // Conteo real de estudiantes y catedráticos vía roles join
      const { data: rolesData } = await supabase.from('roles').select('id_rol,nombre_rol')
      const rolMap = {}
      ;(rolesData || []).forEach(r => { rolMap[r.nombre_rol] = r.id_rol })

      const { count: estCount } = await supabase.from('usuarios')
        .select('*', { count:'exact', head:true })
        .eq('activo', true).eq('id_rol', rolMap['Estudiante'])
      const { count: catCount } = await supabase.from('usuarios')
        .select('*', { count:'exact', head:true })
        .eq('activo', true).eq('id_rol', rolMap['Catedratico'])

      setStats({
        totalUsuarios: totUsr || 0,
        totalEstudiantes: estCount || 0,
        totalCatedraticos: catCount || 0,
        totalCursos: lista.length,
        totalInscritos,
        presentes, ausentes, tardanzas, pendientes,
        pctAsistencia: pct,
      })
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const fetchUsuarios = async () => {
    const { data } = await supabase.from('usuarios')
      .select('id_usuario,nombre,apellido,correo,carne,tipo_persona,carrera,seccion,foto,activo,ultimo_login,roles(nombre_rol)')
      .order('nombre').limit(300)
    setUsuarios(data || [])
  }

  const fetchAuditoria = async () => {
    const { data } = await supabase.from('auditlog')
      .select('*').order('fecha_hora', { ascending:false }).limit(100)
    setAuditoria(data || [])
  }

  const fmt    = d => d.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const fmtDate = d => d.toLocaleDateString('es-GT', { weekday:'long', day:'numeric', month:'long' })
  const fmtTs  = ts => ts ? new Date(ts).toLocaleString('es-GT', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'

  // Filtros de usuarios
  const ROLES_FILTRO = ['TODOS','Administrador','Catedratico','Estudiante','Seguridad','Administrativo']
  const usuariosFiltrados = usuarios.filter(u => {
    const q = busqUsuario.toLowerCase()
    const matchQ = !q || `${u.nombre} ${u.apellido} ${u.correo} ${u.carne||''}`.toLowerCase().includes(q)
    const matchR = filtroRol === 'TODOS' || u.roles?.nombre_rol === filtroRol
    return matchQ && matchR
  })

  return (
    <div style={L.root}>
      {/* ═══ SIDEBAR ═══ */}
      <aside style={L.sidebar}>
        <div style={L.sTop}>
          {/* Branding */}
          <div style={L.brand}>
            <img src="/logo_umg.png" alt="UMG"
              style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(200,168,75,0.4)' }}
              onError={e => { e.target.style.display='none' }}
            />
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:'Syne,sans-serif', lineHeight:1.2 }}>BiometricUMG</div>
              <div style={{ fontSize:9, color:'var(--gold)', fontFamily:"'DM Mono',monospace", marginTop:1 }}>Portal Admin · UMG La Florida</div>
            </div>
          </div>

          {/* Admin card */}
          <div style={L.userCard}>
            <div style={{ ...L.avatar, background:'linear-gradient(135deg,#7c3aed,#2563eb)', overflow:'hidden', padding:0 }}>
              {user.foto
                ? <img src={user.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                : <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{user.nombre?.[0]}{user.apellido?.[0]}</span>
              }
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {user.nombre} {user.apellido}
              </div>
              <div style={{ fontSize:10, color:'#a78bfa', fontFamily:"'DM Mono',monospace", marginTop:2 }}>
                🔑 Administrador
              </div>
            </div>
          </div>

          {/* Status */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--green2)', display:'inline-block', animation:'pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontSize:11, color:'var(--text2)' }}>Conectado · Supabase</span>
          </div>

          {/* Nav */}
          <nav style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {TABS.map(([t,l]) => (
              <button key={t} style={{ ...L.navBtn, ...(tab===t ? L.navBtnActive : {}) }} onClick={() => setTab(t)}>{l}</button>
            ))}
          </nav>

          {/* Nota modo lectura */}
          <div style={{ fontSize:11, color:'var(--text3)', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.15)', borderRadius:8, padding:'8px 10px', lineHeight:1.5 }}>
            ⚠️ Portal de supervisión. Para modificar datos usa la <strong style={{ color:'#fcd34d' }}>app de escritorio</strong>.
          </div>
        </div>

        <div style={L.sBot}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:26, fontWeight:500, color:'var(--text)', letterSpacing:'-1px' }}>{fmt(ahora)}</div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'capitalize', marginBottom:12 }}>{fmtDate(ahora)}</div>
          <button style={L.logoutBtn} onClick={onLogout}>⏻ Cerrar sesión</button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main style={L.main}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div style={L.pageHeader} className="fade-up">
              <h2 style={L.pageTitle}>Resumen del Sistema</h2>
              <button style={L.refreshBtn} onClick={fetchAll}>↻ Actualizar</button>
            </div>

            {/* Stats grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 }} className="fade-up">
              {[
                { label:'Usuarios activos',    val:stats.totalUsuarios,      icon:'👤', color:'var(--accent3)' },
                { label:'Estudiantes',         val:stats.totalEstudiantes,   icon:'🎓', color:'#7c3aed' },
                { label:'Catedráticos',        val:stats.totalCatedraticos,  icon:'👨‍🏫', color:'#0891b2' },
                { label:'Cursos activos',      val:stats.totalCursos,        icon:'📚', color:'#d97706' },
                { label:'Inscripciones',       val:stats.totalInscritos,     icon:'📝', color:'#059669' },
                { label:'Asistencia global %', val:`${stats.pctAsistencia}%`,icon:'📊', color:'var(--gold)' },
              ].map((s,i) => (
                <div key={i} style={L.statCard}>
                  <span style={{ fontSize:28 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize:28, fontWeight:700, color:s.color, letterSpacing:'-1px', fontFamily:'Syne,sans-serif' }}>
                      {loading ? '—' : s.val}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Asistencia hoy — barra de estado */}
            <div style={{ ...L.card }} className="fade-up fade-up-1">
              <h3 style={L.cardTitle}>Asistencia de Hoy</h3>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  { label:'Presentes',  val:stats.presentes,  color:'#10b981' },
                  { label:'Tardanzas',  val:stats.tardanzas,  color:'#8b5cf6' },
                  { label:'Ausentes',   val:stats.ausentes,   color:'#ef4444' },
                  { label:'Pendientes', val:stats.pendientes, color:'#64748b' },
                ].map(s => (
                  <div key={s.label} style={{ flex:1, minWidth:100, textAlign:'center', padding:'12px 8px', background:`${s.color}12`, border:`1px solid ${s.color}30`, borderRadius:12 }}>
                    <div style={{ fontSize:26, fontWeight:700, color:s.color, fontFamily:'Syne,sans-serif' }}>{loading ? '—' : s.val}</div>
                    <div style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Barra visual */}
              {!loading && (stats.presentes + stats.ausentes + stats.tardanzas + stats.pendientes) > 0 && (() => {
                const total = stats.presentes + stats.ausentes + stats.tardanzas + stats.pendientes
                return (
                  <div style={{ display:'flex', height:10, borderRadius:99, overflow:'hidden', gap:2 }}>
                    <div style={{ flex:stats.presentes, background:'#10b981', transition:'flex .5s' }} title={`Presentes: ${stats.presentes}`} />
                    <div style={{ flex:stats.tardanzas, background:'#8b5cf6' }} title={`Tardanzas: ${stats.tardanzas}`} />
                    <div style={{ flex:stats.ausentes,  background:'#ef4444' }} title={`Ausentes: ${stats.ausentes}`} />
                    <div style={{ flex:stats.pendientes,background:'rgba(100,116,139,0.4)' }} title={`Pendientes: ${stats.pendientes}`} />
                  </div>
                )
              })()}
            </div>

            {/* Cursos recientes */}
            <div style={L.card} className="fade-up fade-up-2">
              <h3 style={L.cardTitle}>Cursos activos ({stats.totalCursos})</h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10 }}>
                {cursos.slice(0,6).map(c => {
                  const color = DAY_COLORS[c.dia_semana] || 'var(--accent)'
                  const inscritos = c.inscripciones_curso?.filter(i=>i.activo).length || 0
                  return (
                    <div key={c.id_curso} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                      <div style={{ height:3, background:`linear-gradient(90deg,${color},${color}88)` }}/>
                      <div style={{ padding:'12px 14px' }}>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4, fontFamily:'Syne,sans-serif' }}>{c.nombre_curso}</div>
                        <div style={{ fontSize:11, color:'var(--text2)' }}>
                          {c.dia_semana||'—'} · {c.hora_inicio}–{c.hora_fin} · {inscritos} alumnos
                        </div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                          👨‍🏫 {c.usuarios ? `${c.usuarios.nombre} ${c.usuarios.apellido}` : 'Sin asignar'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {cursos.length > 6 && (
                <button style={{ ...L.refreshBtn, marginTop:10 }} onClick={() => setTab('cursos')}>
                  Ver todos los cursos →
                </button>
              )}
            </div>
          </>
        )}

        {/* ── CURSOS ── */}
        {tab === 'cursos' && (
          <>
            <div style={L.pageHeader} className="fade-up">
              <h2 style={L.pageTitle}>Todos los Cursos</h2>
              <button style={L.refreshBtn} onClick={fetchAll}>↻ Actualizar</button>
            </div>
            {loading ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:180, borderRadius:16 }}/>)}
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {cursos.map((c,i) => {
                  const color = DAY_COLORS[c.dia_semana] || 'var(--accent)'
                  const inscritos = c.inscripciones_curso?.filter(x=>x.activo).length || 0
                  return (
                    <div key={c.id_curso} style={L.courseCard} className={`fade-up fade-up-${Math.min(i+1,5)}`}
                      onClick={() => onIrAsistencia(c)}>
                      <div style={{ height:4, background:`linear-gradient(90deg,${color},${color}88)` }}/>
                      <div style={{ padding:18 }}>
                        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                          <span style={{ ...L.badge, background:`${color}22`, color, border:`1px solid ${color}44` }}>{c.dia_semana||'Sin día'}</span>
                          <span style={{ ...L.badge, background:'rgba(255,255,255,0.04)', color:'var(--text2)' }}>Sección {c.seccion||'—'}</span>
                        </div>
                        <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:8, lineHeight:1.3, fontFamily:'Syne,sans-serif' }}>{c.nombre_curso}</h3>
                        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.8 }}>
                          <div>🕐 {c.hora_inicio||'—'} – {c.hora_fin||'—'}</div>
                          <div>📍 {c.salones?.nombre||'Sin salón'}</div>
                          <div>👨‍🏫 {c.usuarios ? `${c.usuarios.nombre} ${c.usuarios.apellido}` : 'Sin asignar'}</div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
                          <span style={{ fontSize:13, color:'var(--text3)' }}>{inscritos} estudiantes</span>
                          <span style={{ ...L.badge, background:`${color}22`, color, border:`1px solid ${color}44`, fontSize:11 }}>Ver asistencia →</span>
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
        {tab === 'asistencia' && (
          <>
            <div style={L.pageHeader} className="fade-up">
              <h2 style={L.pageTitle}>Asistencia de Hoy</h2>
              <button style={L.refreshBtn} onClick={fetchAll}>↻ Actualizar</button>
            </div>
            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height:52, borderRadius:10 }}/>)}
              </div>
            ) : asistencias.length === 0 ? (
              <div style={L.empty}>
                <div style={{ fontSize:48 }}>📋</div>
                <p style={{ color:'var(--text2)', marginTop:12 }}>Sin registros de asistencia hoy</p>
              </div>
            ) : (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['Estudiante','Carné','Curso','Sección','Estado','Hora'].map(h => (
                        <th key={h} style={L.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {asistencias.map(a => {
                      const col = ESTADO_COLOR[a.estado] || ESTADO_COLOR.PENDIENTE
                      return (
                        <tr key={a.id_asistencia} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                          <td style={L.td}><span style={{ fontSize:13, color:'var(--text)' }}>{a.usuarios?.nombre} {a.usuarios?.apellido}</span></td>
                          <td style={L.td}><span style={L.mono}>{a.usuarios?.carne||'—'}</span></td>
                          <td style={L.td}><span style={{ fontSize:12, color:'var(--text2)' }}>{a.cursos?.nombre_curso||'—'}</span></td>
                          <td style={L.td}><span style={L.mono}>{a.cursos?.seccion||'—'}</span></td>
                          <td style={L.td}>
                            <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:col.bg, color:col.text, border:`1px solid ${col.border}` }}>
                              {a.estado||'PENDIENTE'}
                            </span>
                          </td>
                          <td style={L.td}><span style={L.mono}>{a.hora_ingreso||'—'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── USUARIOS ── */}
        {tab === 'usuarios' && (
          <>
            <div style={L.pageHeader} className="fade-up">
              <h2 style={L.pageTitle}>Usuarios del Sistema</h2>
              <button style={L.refreshBtn} onClick={fetchUsuarios}>↻ Actualizar</button>
            </div>

            {/* Filtros */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }} className="fade-up">
              <input
                style={{ ...L.searchInput, flex:1, minWidth:220 }}
                placeholder="🔍 Buscar por nombre, correo, carné..."
                value={busqUsuario}
                onChange={e => setBusqUsuario(e.target.value)}
              />
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {ROLES_FILTRO.map(r => (
                  <button key={r} style={{
                    padding:'7px 12px', borderRadius:8, border:'1px solid',
                    fontSize:12, fontWeight:500, cursor:'pointer',
                    background: filtroRol===r ? 'rgba(37,99,235,0.15)' : 'transparent',
                    borderColor: filtroRol===r ? 'rgba(37,99,235,0.4)' : 'rgba(255,255,255,0.08)',
                    color: filtroRol===r ? 'var(--accent3)' : 'var(--text2)',
                  }} onClick={() => setFiltroRol(r)}>{r}</button>
                ))}
              </div>
            </div>

            <div style={{ fontSize:12, color:'var(--text3)' }}>{usuariosFiltrados.length} usuarios</div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['#','Nombre','Correo','Rol','Carrera','Último login'].map(h => (
                      <th key={h} style={L.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u,i) => (
                    <tr key={u.id_usuario} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                      <td style={L.td}><span style={{ ...L.mono, color:'var(--text3)' }}>{i+1}</span></td>
                      <td style={L.td}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(37,99,235,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--accent3)', flexShrink:0, overflow:'hidden' }}>
                            {u.foto
                              ? <img src={u.foto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              : `${u.nombre?.[0]||''}${u.apellido?.[0]||''}`
                            }
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{u.nombre} {u.apellido}</div>
                            {u.carne && <div style={{ fontSize:10, color:'var(--text3)', fontFamily:"'DM Mono',monospace" }}>{u.carne}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={L.td}><span style={{ fontSize:12, color:'var(--text2)' }}>{u.correo}</span></td>
                      <td style={L.td}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99,
                          background: u.roles?.nombre_rol === 'Administrador' ? 'rgba(124,58,237,0.15)' :
                                      u.roles?.nombre_rol === 'Catedratico'   ? 'rgba(8,145,178,0.15)' :
                                      u.roles?.nombre_rol === 'Estudiante'    ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                          color: u.roles?.nombre_rol === 'Administrador' ? '#a78bfa' :
                                 u.roles?.nombre_rol === 'Catedratico'   ? '#38bdf8' :
                                 u.roles?.nombre_rol === 'Estudiante'    ? '#10b981' : 'var(--text2)',
                        }}>
                          {u.roles?.nombre_rol || '—'}
                        </span>
                      </td>
                      <td style={L.td}><span style={{ fontSize:12, color:'var(--text2)' }}>{u.carrera ? u.carrera.substring(0,30)+(u.carrera.length>30?'…':'') : '—'}</span></td>
                      <td style={L.td}><span style={{ ...L.mono, fontSize:11 }}>{fmtTs(u.ultimo_login)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── AUDITORÍA ── */}
        {tab === 'auditoria' && (
          <>
            <div style={L.pageHeader} className="fade-up">
              <h2 style={L.pageTitle}>Log de Auditoría</h2>
              <button style={L.refreshBtn} onClick={fetchAuditoria}>↻ Actualizar</button>
            </div>
            <p style={{ fontSize:12, color:'var(--text3)' }}>Últimas 100 acciones registradas por la app de escritorio y el portal web.</p>
            {auditoria.length === 0 ? (
              <div style={L.empty}>
                <div style={{ fontSize:48 }}>🔍</div>
                <p style={{ color:'var(--text2)', marginTop:12 }}>Sin registros de auditoría</p>
              </div>
            ) : (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['Fecha','Tabla','Operación','Campo','Antes','Después','Descripción'].map(h => (
                        <th key={h} style={L.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditoria.map(a => (
                      <tr key={a.id_audit} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                        <td style={L.td}><span style={{ ...L.mono, fontSize:11 }}>{fmtTs(a.fecha_hora)}</span></td>
                        <td style={L.td}><span style={{ fontSize:12, color:'var(--accent3)' }}>{a.tabla}</span></td>
                        <td style={L.td}>
                          <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:6,
                            background: a.operacion==='INSERT' ? 'rgba(16,185,129,0.12)' : a.operacion==='DELETE' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: a.operacion==='INSERT' ? '#10b981' : a.operacion==='DELETE' ? '#ef4444' : '#f59e0b',
                          }}>{a.operacion}</span>
                        </td>
                        <td style={L.td}><span style={{ ...L.mono, fontSize:11, color:'var(--text3)' }}>{a.campo_modificado||'—'}</span></td>
                        <td style={L.td}><span style={{ fontSize:11, color:'#ef4444', maxWidth:120, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.valor_anterior||'—'}</span></td>
                        <td style={L.td}><span style={{ fontSize:11, color:'#10b981', maxWidth:120, display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.valor_nuevo||'—'}</span></td>
                        <td style={L.td}><span style={{ fontSize:12, color:'var(--text2)' }}>{a.descripcion||'—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:13, fontWeight:700, flexShrink:0,
  },
  navBtn: {
    textAlign:'left', padding:'10px 12px', borderRadius:10,
    border:'none', background:'transparent', color:'var(--text2)',
    fontSize:13, fontWeight:500, transition:'all .2s', cursor:'pointer',
  },
  navBtnActive: { background:'rgba(124,58,237,0.12)', color:'#a78bfa', fontWeight:600 },
  logoutBtn: {
    background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)',
    borderRadius:10, padding:'10px 14px', color:'#fca5a5',
    fontSize:13, fontWeight:500, width:'100%', cursor:'pointer',
  },
  main: { flex:1, overflow:'auto', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 },
  pageHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  pageTitle: { fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.5px', fontFamily:'Syne,sans-serif' },
  refreshBtn: {
    background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.25)',
    borderRadius:10, padding:'9px 16px', color:'#a78bfa', fontSize:13, fontWeight:500, cursor:'pointer',
  },
  statCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, padding:'16px',
    display:'flex', alignItems:'center', gap:14,
  },
  card: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:16, padding:'20px 22px',
  },
  cardTitle: { fontSize:15, fontWeight:700, color:'var(--text)', fontFamily:'Syne,sans-serif', marginBottom:16 },
  courseCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:16, overflow:'hidden', cursor:'pointer',
    transition:'transform .2s, border-color .2s',
  },
  badge: { fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 10px', fontFamily:"'DM Mono',monospace" },
  th: {
    padding:'12px 14px', fontSize:11, fontWeight:600, color:'var(--text2)',
    textTransform:'uppercase', letterSpacing:'.06em', textAlign:'left',
    borderBottom:'1px solid var(--border)', background:'rgba(0,0,0,0.2)',
    position:'sticky', top:0,
  },
  td: { padding:'11px 14px', verticalAlign:'middle' },
  mono: { fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--text2)' },
  searchInput: {
    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13,
  },
  empty: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60, gap:8 },
}

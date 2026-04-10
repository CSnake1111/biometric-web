import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const DAY_COLORS = {
  'Lunes':     '#3b82f6',
  'Martes':    '#8b5cf6',
  'Miércoles': '#ec4899',
  'Jueves':    '#f59e0b',
  'Viernes':   '#10b981',
  'Sábado':    '#06b6d4',
}

export default function Dashboard({ user, onLogout, onIrAsistencia }) {
  const [cursos, setCursos]         = useState([])
  const [stats, setStats]           = useState({ totalEstudiantes: 0, totalCursos: 0, asistenciaHoy: 0 })
  const [loading, setLoading]       = useState(true)
  const [fechaHora, setFechaHora]   = useState(new Date())
  const rol = user.roles?.nombre_rol || ''

  useEffect(() => {
    const t = setInterval(() => setFechaHora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchData() }, [user])

  const fetchData = async () => {
    setLoading(true)
    try {
      let cursosQuery = supabase
        .from('cursos')
        .select(`
          *,
          salones(nombre, nivel),
          inscripciones_curso(id_inscripcion, activo)
        `)
        .eq('activo', true)

      // Si es catedrático, solo sus cursos; admin ve todos
      if (rol === 'Catedratico') {
        cursosQuery = cursosQuery.eq('id_catedratico', user.id_usuario)
      }

      const { data: cursosData } = await cursosQuery
      const cursosList = cursosData || []
      setCursos(cursosList)

      // Stats
      const totalEstudiantes = cursosList.reduce((acc, c) =>
        acc + (c.inscripciones_curso?.filter(i => i.activo).length || 0), 0)

      // Asistencias de hoy
      const hoy = new Date().toISOString().split('T')[0]
      const { count: asistenciaHoy } = await supabase
        .from('asistencias')
        .select('*', { count: 'exact', head: true })
        .eq('fecha', hoy)
        .eq('estado', 'PRESENTE')

      setStats({
        totalCursos: cursosList.length,
        totalEstudiantes,
        asistenciaHoy: asistenciaHoy || 0,
      })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const formatTime = (d) => d.toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const formatDate = (d) => d.toLocaleDateString('es-GT', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.sideLogoRow}>
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="#1e3a6e"/>
              <path d="M18 8L28 13V23L18 28L8 23V13L18 8Z" stroke="#c8a84b" strokeWidth="1.5" fill="none"/>
              <circle cx="18" cy="18" r="4" fill="#3b82f6"/>
              <circle cx="18" cy="18" r="2" fill="#60a5fa"/>
            </svg>
            <div>
              <div style={styles.sideTitle}>BiometricUMG</div>
              <div style={styles.sideVersion}>Portal Docente v4.0</div>
            </div>
          </div>

          <div style={styles.userCard}>
            <div style={styles.avatar}>
              {user.nombre?.[0]?.toUpperCase()}{user.apellido?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={styles.userName}>{user.nombre} {user.apellido}</div>
              <div style={styles.userRole}>{rol}</div>
            </div>
          </div>

          <div style={styles.onlineRow}>
            <span style={styles.dot} />
            <span style={styles.onlineText}>En línea · Supabase</span>
          </div>
        </div>

        <div style={styles.sidebarBottom}>
          <div style={styles.clock}>{formatTime(fechaHora)}</div>
          <div style={styles.clockDate}>{formatDate(fechaHora)}</div>
          <button style={styles.logoutBtn} onClick={onLogout}>
            ⏻ Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        {/* Header */}
        <div style={styles.topbar} className="fade-up">
          <div>
            <h1 style={styles.pageTitle}>Mis Cursos</h1>
            <p style={styles.pageSub}>Selecciona un curso para tomar asistencia</p>
          </div>
          <button style={styles.refreshBtn} onClick={fetchData}>↻ Actualizar</button>
        </div>

        {/* Stats */}
        <div style={styles.statsRow}>
          {[
            { label: 'Cursos activos',     value: stats.totalCursos,      icon: '📚', color: '#3b82f6' },
            { label: 'Estudiantes total',  value: stats.totalEstudiantes, icon: '👥', color: '#8b5cf6' },
            { label: 'Presentes hoy',      value: stats.asistenciaHoy,    icon: '✅', color: '#10b981' },
          ].map((s, i) => (
            <div key={i} style={styles.statCard} className={`fade-up fade-up-${i+1}`}>
              <div style={styles.statIcon}>{s.icon}</div>
              <div>
                <div style={{...styles.statVal, color: s.color}}>{loading ? '—' : s.value}</div>
                <div style={styles.statLabel}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Courses grid */}
        {loading ? (
          <div style={styles.grid}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{height: 200, borderRadius: 16}} />
            ))}
          </div>
        ) : cursos.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📭</div>
            <p style={styles.emptyText}>No tienes cursos asignados aún</p>
            <p style={styles.emptySub}>Contacta al administrador para que te asigne cursos</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {cursos.map((curso, i) => {
              const inscritos = curso.inscripciones_curso?.filter(x => x.activo).length || 0
              const color = DAY_COLORS[curso.dia_semana] || '#3b82f6'
              return (
                <div
                  key={curso.id_curso}
                  style={styles.courseCard}
                  className={`fade-up fade-up-${Math.min(i+1,5)}`}
                  onClick={() => onIrAsistencia(curso)}
                >
                  <div style={{...styles.courseAccent, background: color}} />
                  <div style={styles.courseBody}>
                    <div style={styles.courseTop}>
                      <span style={{...styles.dayBadge, background: color + '22', color}}>
                        {curso.dia_semana || 'Sin día'}
                      </span>
                      <span style={styles.seccionBadge}>Sección {curso.seccion || '—'}</span>
                    </div>
                    <h3 style={styles.courseName}>{curso.nombre_curso}</h3>
                    <div style={styles.courseMeta}>
                      <span>🕐 {curso.hora_inicio || '—'} – {curso.hora_fin || '—'}</span>
                      <span>📍 {curso.salones?.nombre || 'Sin salón'}</span>
                    </div>
                    <div style={styles.courseFooter}>
                      <div style={styles.estudiantesCount}>
                        <span style={styles.countNum}>{inscritos}</span>
                        <span style={styles.countLabel}>estudiantes</span>
                      </div>
                      <button style={{...styles.asistenciaBtn, background: color}}>
                        Tomar asistencia →
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    background: '#080c14',
  },
  sidebar: {
    width: 260,
    flexShrink: 0,
    background: '#0d1422',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '28px 20px',
  },
  sidebarTop: { display:'flex', flexDirection:'column', gap:24 },
  sideLogoRow: { display:'flex', alignItems:'center', gap:12 },
  sideTitle: { fontSize:15, fontWeight:700, color:'#f1f5f9' },
  sideVersion: { fontSize:10, color:'#c8a84b', fontFamily:"'JetBrains Mono',monospace" },
  userCard: {
    display:'flex', alignItems:'center', gap:12,
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:12, padding:'12px 14px',
  },
  avatar: {
    width:38, height:38, borderRadius:'50%',
    background:'linear-gradient(135deg,#1e3a6e,#3b82f6)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:14, fontWeight:700, color:'#fff', flexShrink:0,
  },
  userName: { fontSize:13, fontWeight:600, color:'#f1f5f9' },
  userRole: { fontSize:11, color:'#c8a84b', fontFamily:"'JetBrains Mono',monospace", marginTop:2 },
  onlineRow: { display:'flex', alignItems:'center', gap:8 },
  dot: {
    width:8, height:8, borderRadius:'50%', background:'#10b981',
    animation:'pulse-dot 2s ease-in-out infinite', display:'inline-block',
  },
  onlineText: { fontSize:12, color:'#64748b' },
  sidebarBottom: { display:'flex', flexDirection:'column', gap:8 },
  clock: { fontSize:28, fontWeight:700, color:'#f1f5f9', fontFamily:"'JetBrains Mono',monospace", letterSpacing:'-1px' },
  clockDate: { fontSize:11, color:'#475569', textTransform:'capitalize', marginBottom:8 },
  logoutBtn: {
    background:'rgba(239,68,68,0.08)',
    border:'1px solid rgba(239,68,68,0.2)',
    borderRadius:10, padding:'10px 14px',
    color:'#fca5a5', fontSize:13, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
    transition:'background .2s',
  },
  main: {
    flex:1, overflow:'auto',
    padding:'32px 36px',
    display:'flex', flexDirection:'column', gap:24,
  },
  topbar: { display:'flex', alignItems:'flex-start', justifyContent:'space-between' },
  pageTitle: { fontSize:26, fontWeight:700, color:'#f1f5f9', letterSpacing:'-0.5px' },
  pageSub: { fontSize:13, color:'#64748b', marginTop:4 },
  refreshBtn: {
    background:'rgba(59,130,246,0.1)',
    border:'1px solid rgba(59,130,246,0.25)',
    borderRadius:10, padding:'10px 18px',
    color:'#60a5fa', fontSize:13, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
  },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 },
  statCard: {
    background:'#0d1422',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:14, padding:'20px',
    display:'flex', alignItems:'center', gap:16,
  },
  statIcon: { fontSize:28 },
  statVal: { fontSize:28, fontWeight:700, letterSpacing:'-1px' },
  statLabel: { fontSize:12, color:'#64748b', marginTop:2 },
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))',
    gap:18,
  },
  courseCard: {
    background:'#0d1422',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:16, overflow:'hidden',
    cursor:'pointer',
    transition:'transform .2s, border-color .2s, box-shadow .2s',
    position:'relative',
  },
  courseAccent: { height:4, width:'100%' },
  courseBody: { padding:'20px' },
  courseTop: { display:'flex', gap:8, marginBottom:12 },
  dayBadge: {
    fontSize:11, fontWeight:600, borderRadius:6, padding:'4px 10px',
    fontFamily:"'JetBrains Mono',monospace",
  },
  seccionBadge: {
    fontSize:11, color:'#475569',
    background:'rgba(255,255,255,0.04)',
    borderRadius:6, padding:'4px 10px',
  },
  courseName: { fontSize:17, fontWeight:700, color:'#f1f5f9', marginBottom:10, lineHeight:1.3 },
  courseMeta: {
    display:'flex', flexDirection:'column', gap:4,
    fontSize:12, color:'#64748b', marginBottom:16,
  },
  courseFooter: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  estudiantesCount: { display:'flex', flexDirection:'column' },
  countNum: { fontSize:20, fontWeight:700, color:'#f1f5f9' },
  countLabel: { fontSize:11, color:'#64748b' },
  asistenciaBtn: {
    border:'none', borderRadius:8,
    padding:'8px 14px',
    color:'#fff', fontSize:12, fontWeight:600,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
  },
  empty: {
    flex:1, display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center', gap:12, padding:60,
  },
  emptyIcon: { fontSize:48 },
  emptyText: { fontSize:18, fontWeight:600, color:'#f1f5f9' },
  emptySub: { fontSize:14, color:'#64748b' },
}

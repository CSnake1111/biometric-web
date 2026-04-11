import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAY_COLORS = {
  'Lunes':'#2563eb','Martes':'#7c3aed','Miércoles':'#db2777',
  'Jueves':'#d97706','Viernes':'#059669','Sábado':'#0891b2',
}

export default function DashboardMaestro({ user, onLogout, onIrAsistencia }) {
  const [cursos, setCursos]   = useState([])
  const [stats, setStats]     = useState({ cursos:0, estudiantes:0, presentes:0, porcentaje:0 })
  const [loading, setLoading] = useState(true)
  const [ahora, setAhora]     = useState(new Date())
  const [tab, setTab]         = useState('cursos')
  const [historial, setHistorial] = useState([])
  const [loadHist, setLoadHist]   = useState(false)
  const rol = user.roles?.nombre_rol || ''

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchData() }, [user])
  useEffect(() => { if (tab === 'historial') fetchHistorial() }, [tab])

  const fetchData = async () => {
    setLoading(true)
    try {
      let q = supabase.from('cursos').select(`
        *, salones(nombre,nivel),
        inscripciones_curso(id_inscripcion, activo)
      `).eq('activo', true)

      if (rol === 'Catedratico') q = q.eq('id_catedratico', user.id_usuario)
      const { data: cs } = await q
      const lista = cs || []
      setCursos(lista)

      const hoy = new Date().toISOString().split('T')[0]
      const { count: presentes } = await supabase.from('asistencias')
        .select('*', { count:'exact', head:true })
        .eq('fecha', hoy).eq('estado', 'PRESENTE')

      const totalEst = lista.reduce((a,c) => a + (c.inscripciones_curso?.filter(i=>i.activo).length||0), 0)
      const pct = totalEst > 0 ? Math.round(((presentes||0)/totalEst)*100) : 0

      setStats({ cursos:lista.length, estudiantes:totalEst, presentes:presentes||0, porcentaje:pct })
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const fetchHistorial = async () => {
    setLoadHist(true)
    const hoy = new Date().toISOString().split('T')[0]
    const idsCursos = cursos.map(c => c.id_curso)
    if (idsCursos.length === 0) { setHistorial([]); setLoadHist(false); return }
    const { data } = await supabase.from('asistencias')
      .select('*, usuarios(nombre,apellido,carne)')
      .in('id_curso', idsCursos)
      .eq('fecha', hoy)
      .order('id_asistencia', { ascending: false })
      .limit(100)
    setHistorial(data || [])
    setLoadHist(false)
  }

  const fmt = d => d.toLocaleTimeString('es-GT', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const fmtDate = d => d.toLocaleDateString('es-GT', {weekday:'long',day:'numeric',month:'long'})

  const ESTADO_COLOR = {
    PRESENTE:'#059669', AUSENTE:'#dc2626', TARDANZA:'#7c3aed', JUSTIFICADO:'#d97706', PENDIENTE:'#3d4f6e'
  }

  return (
    <div style={L.root}>
      {/* Sidebar */}
      <aside style={L.sidebar}>
        <div style={L.sTop}>
          <div style={L.brand}>
            <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="#1e3a6e"/>
              <path d="M18 8L28 13V23L18 28L8 23V13L18 8Z" stroke="#d4a843" strokeWidth="1.5" fill="none"/>
              <circle cx="18" cy="18" r="3.5" fill="#2563eb"/>
            </svg>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Syne,sans-serif'}}>BiometricUMG</div>
              <div style={{fontSize:10,color:'var(--gold)',fontFamily:"'DM Mono',monospace"}}>Portal Docente v4.0</div>
            </div>
          </div>

          <div style={L.userCard}>
            <div style={L.avatar}>{user.nombre?.[0]}{user.apellido?.[0]}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {user.nombre} {user.apellido}
              </div>
              <div style={{fontSize:10,color:'var(--gold)',fontFamily:"'DM Mono',monospace",marginTop:2}}>{rol}</div>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:'var(--green2)',display:'inline-block',animation:'pulse 2s ease-in-out infinite'}}/>
            <span style={{fontSize:11,color:'var(--text2)'}}>Conectado · Supabase</span>
          </div>

          <nav style={{display:'flex',flexDirection:'column',gap:4}}>
            {[['cursos','📚 Mis Cursos'],['historial','📋 Asistencia Hoy']].map(([t,l]) => (
              <button key={t} style={{...L.navBtn,...(tab===t?L.navBtnActive:{})}} onClick={() => setTab(t)}>{l}</button>
            ))}
          </nav>
        </div>

        <div style={L.sBot}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:500,color:'var(--text)',letterSpacing:'-1px'}}>
            {fmt(ahora)}
          </div>
          <div style={{fontSize:11,color:'var(--text3)',textTransform:'capitalize',marginBottom:12}}>{fmtDate(ahora)}</div>
          <button style={L.logoutBtn} onClick={onLogout}>⏻ Cerrar sesión</button>
        </div>
      </aside>

      {/* Main */}
      <main style={L.main}>
        {/* Stats row */}
        <div style={L.statsRow} className="fade-up">
          {[
            {label:'Cursos activos', val:stats.cursos, icon:'📚', color:'var(--accent2)'},
            {label:'Estudiantes', val:stats.estudiantes, icon:'👥', color:'#7c3aed'},
            {label:'Presentes hoy', val:stats.presentes, icon:'✅', color:'var(--green2)'},
            {label:'% Asistencia', val:`${stats.porcentaje}%`, icon:'📊', color:'var(--gold)'},
          ].map((s,i) => (
            <div key={i} style={L.statCard}>
              <span style={{fontSize:26}}>{s.icon}</span>
              <div>
                <div style={{fontSize:26,fontWeight:700,color:s.color,letterSpacing:'-1px',fontFamily:'Syne,sans-serif'}}>
                  {loading ? '—' : s.val}
                </div>
                <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        {tab === 'cursos' && (
          <>
            <div style={L.sectionHeader} className="fade-up fade-up-1">
              <h2 style={L.sectionTitle}>Mis Cursos</h2>
              <button style={L.refreshBtn} onClick={fetchData}>↻ Actualizar</button>
            </div>

            {loading ? (
              <div style={L.grid}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{height:200,borderRadius:16}}/>)}
              </div>
            ) : cursos.length === 0 ? (
              <div style={L.empty}>
                <div style={{fontSize:56}}>📭</div>
                <p style={{fontSize:17,fontWeight:600,color:'var(--text)',marginTop:12}}>Sin cursos asignados</p>
                <p style={{fontSize:13,color:'var(--text2)',marginTop:4}}>Contacta al administrador para asignarte cursos</p>
              </div>
            ) : (
              <div style={L.grid}>
                {cursos.map((c,i) => {
                  const color = DAY_COLORS[c.dia_semana] || 'var(--accent)'
                  const inscritos = c.inscripciones_curso?.filter(x=>x.activo).length || 0
                  return (
                    <div key={c.id_curso} style={L.courseCard} className={`fade-up fade-up-${Math.min(i+1,5)}`}
                      onClick={() => onIrAsistencia(c)}>
                      <div style={{height:4,background:`linear-gradient(90deg,${color},${color}88)`}}/>
                      <div style={{padding:20}}>
                        <div style={{display:'flex',gap:8,marginBottom:12}}>
                          <span style={{...L.badge, background:`${color}22`, color, border:`1px solid ${color}44`}}>
                            {c.dia_semana||'Sin día'}
                          </span>
                          <span style={{...L.badge, background:'rgba(255,255,255,0.04)', color:'var(--text2)'}}>
                            Sección {c.seccion||'—'}
                          </span>
                        </div>
                        <h3 style={{fontSize:16,fontWeight:700,color:'var(--text)',marginBottom:10,lineHeight:1.3,fontFamily:'Syne,sans-serif'}}>
                          {c.nombre_curso}
                        </h3>
                        <div style={{display:'flex',flexDirection:'column',gap:4,fontSize:12,color:'var(--text2)',marginBottom:16}}>
                          <span>🕐 {c.hora_inicio||'—'} – {c.hora_fin||'—'}</span>
                          <span>📍 {c.salones?.nombre||'Sin salón'} · {c.salones?.nivel||''}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                          <div>
                            <span style={{fontSize:22,fontWeight:700,color:'var(--text)',fontFamily:'Syne,sans-serif'}}>{inscritos}</span>
                            <span style={{fontSize:11,color:'var(--text2)',marginLeft:4}}>estudiantes</span>
                          </div>
                          <button style={{...L.asistBtn, background:`linear-gradient(135deg,${color}cc,${color})`}}>
                            Asistencia →
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

        {tab === 'historial' && (
          <div className="fade-up">
            <div style={L.sectionHeader}>
              <h2 style={L.sectionTitle}>Asistencia de Hoy</h2>
              <button style={L.refreshBtn} onClick={fetchHistorial}>↻ Actualizar</button>
            </div>
            {loadHist ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{height:56,borderRadius:12}}/>)}
              </div>
            ) : historial.length === 0 ? (
              <div style={L.empty}>
                <div style={{fontSize:48}}>📋</div>
                <p style={{color:'var(--text2)',marginTop:12}}>Sin registros de asistencia hoy</p>
              </div>
            ) : (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {['Estudiante','Carné','Estado','Hora'].map(h => (
                        <th key={h} style={{padding:'12px 16px',fontSize:11,fontWeight:600,color:'var(--text2)',
                          textTransform:'uppercase',letterSpacing:'.06em',textAlign:'left',
                          borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,0.2)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map(a => (
                      <tr key={a.id_asistencia} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                        <td style={{padding:'12px 16px',fontSize:13,color:'var(--text)'}}>
                          {a.usuarios?.nombre} {a.usuarios?.apellido}
                        </td>
                        <td style={{padding:'12px 16px',fontFamily:"'DM Mono',monospace",fontSize:12,color:'var(--text2)'}}>
                          {a.usuarios?.carne||'—'}
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{
                            fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:99,
                            background:`${ESTADO_COLOR[a.estado]||'#3d4f6e'}22`,
                            color: ESTADO_COLOR[a.estado]||'var(--text2)',
                            border:`1px solid ${ESTADO_COLOR[a.estado]||'#3d4f6e'}44`,
                          }}>{a.estado||'PENDIENTE'}</span>
                        </td>
                        <td style={{padding:'12px 16px',fontFamily:"'DM Mono',monospace",fontSize:12,color:'var(--text2)'}}>
                          {a.hora_ingreso||'—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
  sTop:  { display:'flex', flexDirection:'column', gap:20 },
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
    fontSize:13, fontWeight:700, color:'#fff', flexShrink:0,
  },
  navBtn: {
    textAlign:'left', padding:'10px 12px', borderRadius:10,
    border:'none', background:'transparent', color:'var(--text2)',
    fontSize:13, fontWeight:500, transition:'all .2s',
  },
  navBtnActive: { background:'rgba(37,99,235,0.12)', color:'var(--accent3)', fontWeight:600 },
  logoutBtn: {
    background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)',
    borderRadius:10, padding:'10px 14px', color:'#fca5a5',
    fontSize:13, fontWeight:500, width:'100%',
  },
  main: { flex:1, overflow:'auto', padding:'28px 32px', display:'flex', flexDirection:'column', gap:20 },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 },
  statCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, padding:'18px 16px',
    display:'flex', alignItems:'center', gap:14,
  },
  sectionHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  sectionTitle: { fontSize:22,fontWeight:700,color:'var(--text)',letterSpacing:'-0.5px',fontFamily:'Syne,sans-serif' },
  refreshBtn: {
    background:'rgba(37,99,235,0.1)', border:'1px solid rgba(37,99,235,0.25)',
    borderRadius:10, padding:'9px 16px', color:'var(--accent3)', fontSize:13, fontWeight:500,
  },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 },
  courseCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:16, overflow:'hidden', cursor:'pointer',
    transition:'transform .2s, border-color .2s, box-shadow .2s',
  },
  badge: {
    fontSize:11, fontWeight:600, borderRadius:6, padding:'3px 10px',
    fontFamily:"'DM Mono',monospace",
  },
  asistBtn: {
    border:'none', borderRadius:8, padding:'8px 14px',
    color:'#fff', fontSize:12, fontWeight:600,
  },
  empty: {
    flex:1, display:'flex', flexDirection:'column', alignItems:'center',
    justifyContent:'center', padding:60, gap:8,
  },
}

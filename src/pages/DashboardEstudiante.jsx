import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardEstudiante({ user, onLogout }) {
  const [cursos,    setCursos]    = useState([])
  const [asistencias, setAsist]  = useState([])
  const [stats,     setStats]    = useState({ total:0, presente:0, ausente:0, tardanza:0 })
  const [loading,   setLoading]  = useState(true)
  const [ahora,     setAhora]    = useState(new Date())
  const [tab,       setTab]      = useState('cursos')

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchData() }, [user])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Get inscribed courses
      const { data: inscripciones } = await supabase
        .from('inscripciones_curso')
        .select(`*, cursos(*, salones(nombre,nivel), usuarios!cursos_id_catedratico_fkey(nombre,apellido))`)
        .eq('id_estudiante', user.id_usuario)
        .eq('activo', true)

      const cursosList = (inscripciones || []).map(i => i.cursos).filter(Boolean)
      setCursos(cursosList)

      // Get attendance records
      const { data: asist } = await supabase
        .from('asistencias')
        .select('*, cursos(nombre_curso, seccion)')
        .eq('id_estudiante', user.id_usuario)
        .order('fecha', { ascending: false })
        .limit(60)

      const asistList = asist || []
      setAsist(asistList)

      const presente  = asistList.filter(a => a.estado === 'PRESENTE').length
      const ausente   = asistList.filter(a => a.estado === 'AUSENTE').length
      const tardanza  = asistList.filter(a => a.estado === 'TARDANZA').length

      setStats({ total:asistList.length, presente, ausente, tardanza })
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const pctPresente = stats.total > 0 ? Math.round((stats.presente/stats.total)*100) : 0

  const ESTADO_COLOR = {
    PRESENTE:'#059669', AUSENTE:'#dc2626', TARDANZA:'#7c3aed',
    JUSTIFICADO:'#d97706', PENDIENTE:'#3d4f6e'
  }

  const fmt    = d => d.toLocaleTimeString('es-GT', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const fmtD   = d => d.toLocaleDateString('es-GT', {weekday:'short',day:'numeric',month:'short'})

  const DAY_COLORS = {
    'Lunes':'#2563eb','Martes':'#7c3aed','Miércoles':'#db2777',
    'Jueves':'#d97706','Viernes':'#059669','Sábado':'#0891b2',
  }

  return (
    <div style={L.root}>
      {/* Sidebar */}
      <aside style={L.sidebar}>
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="#1e3a6e"/>
              <path d="M18 8L28 13V23L18 28L8 23V13L18 8Z" stroke="#d4a843" strokeWidth="1.5" fill="none"/>
              <circle cx="18" cy="18" r="3.5" fill="#2563eb"/>
            </svg>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'Syne,sans-serif'}}>BiometricUMG</div>
              <div style={{fontSize:10,color:'var(--gold)',fontFamily:"'DM Mono',monospace"}}>Portal Estudiantil v4.0</div>
            </div>
          </div>

          {/* Student profile card */}
          <div style={{background:'linear-gradient(135deg,rgba(37,99,235,0.15),rgba(124,58,237,0.1))',border:'1px solid rgba(37,99,235,0.25)',borderRadius:14,padding:16}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{width:44,height:44,borderRadius:'50%',background:'linear-gradient(135deg,#1e3a6e,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff',flexShrink:0,overflow:'hidden'}}>
                {user.foto
                  ? <img src={user.foto} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  : <>{user.nombre?.[0]}{user.apellido?.[0]}</>
                }
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>{user.nombre} {user.apellido}</div>
                <div style={{fontSize:10,color:'var(--gold)',fontFamily:"'DM Mono',monospace",marginTop:2}}>{user.roles?.nombre_rol || user.tipo_persona || 'Estudiante'}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--text2)',lineHeight:1.6}}>
              <div>📋 {user.carne || 'Sin carné'}</div>
              <div>📚 {user.carrera ? user.carrera.substring(0,35)+'...' : '—'}</div>
              <div>📧 {user.correo}</div>
            </div>
          </div>

          {/* Attendance summary */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:16}}>
            <p style={{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>Mi Asistencia Global</p>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{position:'relative',width:56,height:56,flexShrink:0}}>
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#059669" strokeWidth="5"
                    strokeDasharray={`${2*Math.PI*22}`}
                    strokeDashoffset={`${2*Math.PI*22*(1-pctPresente/100)}`}
                    strokeLinecap="round" transform="rotate(-90 28 28)"
                    style={{transition:'stroke-dashoffset .6s ease'}}/>
                </svg>
                <span style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:12,fontWeight:700,color:'#059669',fontFamily:"'DM Mono',monospace"}}>{pctPresente}%</span>
              </div>
              <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.8}}>
                <div style={{color:'#059669'}}>✓ {stats.presente} presentes</div>
                <div style={{color:'#dc2626'}}>✗ {stats.ausente} ausentes</div>
                <div style={{color:'#7c3aed'}}>⏱ {stats.tardanza} tardanzas</div>
              </div>
            </div>
          </div>

          <nav style={{display:'flex',flexDirection:'column',gap:4}}>
            {[['cursos','📚 Mis Cursos'],['asistencias','📋 Mi Asistencia']].map(([t,l]) => (
              <button key={t} style={{textAlign:'left',padding:'10px 12px',borderRadius:10,border:'none',
                background:tab===t?'rgba(37,99,235,0.12)':'transparent',
                color:tab===t?'var(--accent3)':'var(--text2)',fontSize:13,fontWeight:tab===t?600:500,transition:'all .2s'}}
                onClick={() => setTab(t)}>{l}</button>
            ))}
          </nav>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:500,color:'var(--text)',letterSpacing:'-1px'}}>{fmt(ahora)}</div>
          <div style={{fontSize:11,color:'var(--text3)',textTransform:'capitalize',marginBottom:8}}>{fmtD(ahora)}</div>
          <button style={{background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'9px 14px',color:'#fca5a5',fontSize:13,fontWeight:500,width:'100%'}}
            onClick={onLogout}>⏻ Cerrar sesión</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,overflow:'auto',padding:'28px 32px',display:'flex',flexDirection:'column',gap:20}}>
        {tab === 'cursos' && (
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}} className="fade-up">
              <h2 style={{fontSize:22,fontWeight:700,color:'var(--text)',fontFamily:'Syne,sans-serif'}}>Mis Cursos Inscritos</h2>
              <button style={{background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.25)',borderRadius:10,padding:'9px 16px',color:'var(--accent3)',fontSize:13,fontWeight:500}}
                onClick={fetchData}>↻ Actualizar</button>
            </div>

            {loading ? (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{height:180,borderRadius:16}}/>)}
              </div>
            ) : cursos.length === 0 ? (
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:8}}>
                <div style={{fontSize:56}}>📭</div>
                <p style={{fontSize:17,fontWeight:600,color:'var(--text)',marginTop:12}}>Sin cursos inscritos</p>
                <p style={{fontSize:13,color:'var(--text2)'}}>Contacta a tu catedrático para inscribirte</p>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
                {cursos.map((c,i) => {
                  const color = DAY_COLORS[c.dia_semana] || 'var(--accent)'
                  const catedratico = c.usuarios ? `${c.usuarios.nombre} ${c.usuarios.apellido}` : '—'
                  return (
                    <div key={c.id_curso} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden'}}
                      className={`fade-up fade-up-${Math.min(i+1,5)}`}>
                      <div style={{height:4,background:`linear-gradient(90deg,${color},${color}88)`}}/>
                      <div style={{padding:18}}>
                        <div style={{display:'flex',gap:8,marginBottom:10}}>
                          <span style={{fontSize:11,fontWeight:600,borderRadius:6,padding:'3px 10px',background:`${color}22`,color,border:`1px solid ${color}44`,fontFamily:"'DM Mono',monospace"}}>
                            {c.dia_semana||'Sin día'}
                          </span>
                          <span style={{fontSize:11,fontWeight:600,borderRadius:6,padding:'3px 10px',background:'rgba(255,255,255,0.04)',color:'var(--text2)'}}>
                            Sección {c.seccion||'—'}
                          </span>
                        </div>
                        <h3 style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:8,lineHeight:1.3,fontFamily:'Syne,sans-serif'}}>
                          {c.nombre_curso}
                        </h3>
                        <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.8}}>
                          <div>🕐 {c.hora_inicio} – {c.hora_fin}</div>
                          <div>📍 {c.salones?.nombre||'—'}</div>
                          <div>👨‍🏫 {catedratico}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'asistencias' && (
          <div className="fade-up">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <h2 style={{fontSize:22,fontWeight:700,color:'var(--text)',fontFamily:'Syne,sans-serif'}}>Mi Registro de Asistencia</h2>
              <button style={{background:'rgba(37,99,235,0.1)',border:'1px solid rgba(37,99,235,0.25)',borderRadius:10,padding:'9px 16px',color:'var(--accent3)',fontSize:13,fontWeight:500}}
                onClick={fetchData}>↻ Actualizar</button>
            </div>

            {loading ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{height:56,borderRadius:12}}/>)}
              </div>
            ) : asistencias.length === 0 ? (
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,gap:8}}>
                <div style={{fontSize:48}}>📋</div>
                <p style={{color:'var(--text2)',marginTop:12}}>Sin registros de asistencia aún</p>
              </div>
            ) : (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      {['Fecha','Curso','Estado','Hora'].map(h => (
                        <th key={h} style={{padding:'12px 16px',fontSize:11,fontWeight:600,color:'var(--text2)',
                          textTransform:'uppercase',letterSpacing:'.06em',textAlign:'left',
                          borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,0.2)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {asistencias.map(a => (
                      <tr key={a.id_asistencia} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                        <td style={{padding:'12px 16px',fontFamily:"'DM Mono',monospace",fontSize:12,color:'var(--text2)'}}>
                          {a.fecha}
                        </td>
                        <td style={{padding:'12px 16px',fontSize:13,color:'var(--text)'}}>
                          {a.cursos?.nombre_curso||'—'} <span style={{color:'var(--text2)',fontSize:11}}>({a.cursos?.seccion})</span>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{
                            fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:99,
                            background:`${ESTADO_COLOR[a.estado]||'#3d4f6e'}22`,
                            color:ESTADO_COLOR[a.estado]||'var(--text2)',
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
    width:270, flexShrink:0, background:'var(--bg2)',
    borderRight:'1px solid var(--border)',
    display:'flex', flexDirection:'column', justifyContent:'space-between',
    padding:'24px 18px', overflowY:'auto',
  },
}

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ESTADOS = ['PRESENTE', 'AUSENTE', 'JUSTIFICADO', 'TARDANZA']
const ESTADO_COLORS = {
  PRESENTE:    { bg: 'rgba(16,185,129,0.15)', text: '#10b981', border: 'rgba(16,185,129,0.3)' },
  AUSENTE:     { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444', border: 'rgba(239,68,68,0.3)'  },
  JUSTIFICADO: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  TARDANZA:    { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
  PENDIENTE:   { bg: 'rgba(71,85,105,0.15)',  text: '#94a3b8', border: 'rgba(71,85,105,0.3)'  },
}

export default function Asistencia({ curso, user, onVolver }) {
  const [estudiantes, setEstudiantes] = useState([])
  const [asistencias, setAsistencias] = useState({}) // { idEstudiante: { estado, idAsistencia } }
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [filter, setFilter]           = useState('TODOS')
  const [search, setSearch]           = useState('')

  const hoy = new Date().toISOString().split('T')[0]
  const hoyDisplay = new Date().toLocaleDateString('es-GT', { weekday:'long', day:'numeric', month:'long' })

  useEffect(() => { fetchEstudiantes() }, [curso])

  const fetchEstudiantes = async () => {
    setLoading(true)
    try {
      // Traer estudiantes inscritos
      const { data: inscritos } = await supabase
        .from('inscripciones_curso')
        .select('id_estudiante, usuarios(id_usuario, nombre, apellido, carne, correo, carrera, seccion)')
        .eq('id_curso', curso.id_curso)
        .eq('activo', true)

      const lista = (inscritos || []).map(i => i.usuarios).filter(Boolean)
      setEstudiantes(lista)

      // Traer asistencias de hoy para este curso
      const ids = lista.map(e => e.id_usuario)
      if (ids.length > 0) {
        const { data: asist } = await supabase
          .from('asistencias')
          .select('*')
          .eq('id_curso', curso.id_curso)
          .eq('fecha', hoy)
          .in('id_estudiante', ids)

        const map = {}
        ;(asist || []).forEach(a => {
          map[a.id_estudiante] = { estado: a.estado, idAsistencia: a.id_asistencia }
        })
        setAsistencias(map)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const setEstado = (idEstudiante, estado) => {
    setAsistencias(prev => ({
      ...prev,
      [idEstudiante]: { ...prev[idEstudiante], estado }
    }))
    setSaved(false)
  }

  const marcarTodos = (estado) => {
    const map = {}
    estudiantes.forEach(e => {
      map[e.id_usuario] = { ...asistencias[e.id_usuario], estado }
    })
    setAsistencias(map)
    setSaved(false)
  }

  const guardar = async () => {
    setSaving(true)
    try {
      const hora = new Date().toLocaleTimeString('es-GT', { hour:'2-digit', minute:'2-digit' })

      for (const est of estudiantes) {
        const id = est.id_usuario
        const estado = asistencias[id]?.estado || 'PENDIENTE'
        const idAsistencia = asistencias[id]?.idAsistencia

        if (idAsistencia) {
          // UPDATE
          await supabase
            .from('asistencias')
            .update({ estado, hora_ingreso: estado === 'PRESENTE' || estado === 'TARDANZA' ? hora : null })
            .eq('id_asistencia', idAsistencia)
        } else {
          // INSERT
          const { data } = await supabase
            .from('asistencias')
            .insert({
              id_curso: curso.id_curso,
              id_estudiante: id,
              fecha: hoy,
              estado,
              hora_ingreso: estado === 'PRESENTE' || estado === 'TARDANZA' ? hora : null,
            })
            .select()
            .single()
          if (data) {
            setAsistencias(prev => ({
              ...prev,
              [id]: { estado, idAsistencia: data.id_asistencia }
            }))
          }
        }
      }
      setSaved(true)
      // Re-fetch para actualizar IDs
      await fetchEstudiantes()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  // Estadísticas rápidas
  const conteo = estudiantes.reduce((acc, e) => {
    const est = asistencias[e.id_usuario]?.estado || 'PENDIENTE'
    acc[est] = (acc[est] || 0) + 1
    return acc
  }, {})

  const filtrados = estudiantes.filter(e => {
    const est = asistencias[e.id_usuario]?.estado || 'PENDIENTE'
    const matchFilter = filter === 'TODOS' || est === filter
    const matchSearch = search === '' ||
      `${e.nombre} ${e.apellido}`.toLowerCase().includes(search.toLowerCase()) ||
      (e.carne || '').toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const pct = estudiantes.length > 0
    ? Math.round(((conteo.PRESENTE || 0) / estudiantes.length) * 100)
    : 0

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header} className="fade-up">
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={onVolver}>← Volver</button>
          <div>
            <h1 style={styles.title}>{curso.nombre_curso}</h1>
            <p style={styles.sub}>
              Sección {curso.seccion} · {curso.dia_semana} · {curso.hora_inicio}–{curso.hora_fin}
              <span style={styles.subDot}>·</span>
              <span style={{color:'#c8a84b', fontFamily:"'JetBrains Mono',monospace", textTransform:'capitalize'}}>
                {hoyDisplay}
              </span>
            </p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.pctCircle}>
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
              <circle cx="28" cy="28" r="22" fill="none" stroke="#10b981" strokeWidth="5"
                strokeDasharray={`${2*Math.PI*22}`}
                strokeDashoffset={`${2*Math.PI*22*(1-pct/100)}`}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{transition:'stroke-dashoffset .6s ease'}}
              />
            </svg>
            <span style={styles.pctText}>{pct}%</span>
          </div>
          <div>
            <div style={styles.pctLabel}>Asistencia</div>
            <div style={styles.pctSub}>{conteo.PRESENTE || 0} de {estudiantes.length}</div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar} className="fade-up fade-up-1">
        {ESTADOS.map(est => (
          <button
            key={est}
            style={{
              ...styles.statPill,
              background: filter === est ? ESTADO_COLORS[est].bg : 'transparent',
              border: `1px solid ${filter === est ? ESTADO_COLORS[est].border : 'rgba(255,255,255,0.07)'}`,
              color: filter === est ? ESTADO_COLORS[est].text : '#64748b',
            }}
            onClick={() => setFilter(filter === est ? 'TODOS' : est)}
          >
            <span style={styles.statNum}>{conteo[est] || 0}</span>
            <span>{est}</span>
          </button>
        ))}
        <div style={{marginLeft:'auto', display:'flex', gap:8}}>
          <button style={styles.quickBtn} onClick={() => marcarTodos('PRESENTE')}>✓ Todos presentes</button>
          <button style={{...styles.quickBtn, color:'#ef4444', borderColor:'rgba(239,68,68,0.2)'}}
            onClick={() => marcarTodos('AUSENTE')}>✗ Todos ausentes</button>
        </div>
      </div>

      {/* Search */}
      <div style={styles.searchRow} className="fade-up fade-up-2">
        <input
          style={styles.searchInput}
          placeholder="🔍  Buscar por nombre o carné..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span style={styles.countBadge}>{filtrados.length} estudiantes</span>
      </div>

      {/* Table */}
      <div style={styles.tableWrap} className="fade-up fade-up-3">
        {loading ? (
          <div style={{display:'flex',flexDirection:'column',gap:10,padding:20}}>
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{height:64,borderRadius:12}}/>)}
          </div>
        ) : filtrados.length === 0 ? (
          <div style={styles.empty}>
            <p>No se encontraron estudiantes</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Estudiante</th>
                <th style={styles.th}>Carné</th>
                <th style={styles.th}>Carrera</th>
                <th style={styles.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((est, idx) => {
                const estadoActual = asistencias[est.id_usuario]?.estado || 'PENDIENTE'
                const col = ESTADO_COLORS[estadoActual] || ESTADO_COLORS.PENDIENTE
                return (
                  <tr key={est.id_usuario} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.rowNum}>{idx+1}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.estName}>
                        <div style={{...styles.miniAvatar, background: col.bg, color: col.text}}>
                          {est.nombre?.[0]}{est.apellido?.[0]}
                        </div>
                        <div>
                          <div style={styles.estNombreText}>{est.nombre} {est.apellido}</div>
                          <div style={styles.estCorreo}>{est.correo}</div>
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.carne}>{est.carne || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.carrera}>{est.carrera || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.btnGroup}>
                        {ESTADOS.map(e => {
                          const c = ESTADO_COLORS[e]
                          const active = estadoActual === e
                          return (
                            <button
                              key={e}
                              onClick={() => setEstado(est.id_usuario, e)}
                              style={{
                                ...styles.estadoBtn,
                                background: active ? c.bg : 'transparent',
                                border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.07)'}`,
                                color: active ? c.text : '#475569',
                                fontWeight: active ? 600 : 400,
                              }}
                              title={e}
                            >
                              {e === 'PRESENTE' ? '✓' : e === 'AUSENTE' ? '✗' : e === 'JUSTIFICADO' ? 'J' : 'T'}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer save */}
      <div style={styles.footer} className="fade-up fade-up-4">
        <div style={styles.footerInfo}>
          {saved
            ? <span style={{color:'#10b981'}}>✓ Guardado correctamente en Supabase</span>
            : <span style={{color:'#64748b'}}>Cambios sin guardar</span>
          }
        </div>
        <button
          style={{
            ...styles.saveBtn,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
          onClick={guardar}
          disabled={saving}
        >
          {saving ? '⏳ Guardando...' : '💾 Guardar asistencia'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#080c14',
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 36px',
    gap: 20,
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
  },
  header: {
    display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20,
  },
  headerLeft: { display:'flex', alignItems:'flex-start', gap:16 },
  backBtn: {
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:10, padding:'10px 16px',
    color:'#94a3b8', fontSize:13, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
    flexShrink:0, marginTop:4,
  },
  title: { fontSize:24, fontWeight:700, color:'#f1f5f9', letterSpacing:'-0.5px' },
  sub: { fontSize:13, color:'#64748b', marginTop:6, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
  subDot: { color:'#334155' },
  headerRight: { display:'flex', alignItems:'center', gap:14, flexShrink:0 },
  pctCircle: { position:'relative', width:56, height:56, display:'flex', alignItems:'center', justifyContent:'center' },
  pctText: { position:'absolute', fontSize:12, fontWeight:700, color:'#10b981', fontFamily:"'JetBrains Mono',monospace" },
  pctLabel: { fontSize:13, fontWeight:600, color:'#f1f5f9' },
  pctSub: { fontSize:12, color:'#64748b', marginTop:2 },
  statsBar: {
    display:'flex', gap:8, flexWrap:'wrap', alignItems:'center',
  },
  statPill: {
    display:'flex', alignItems:'center', gap:8,
    borderRadius:10, padding:'8px 14px',
    fontSize:12, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
    transition:'all .2s',
  },
  statNum: { fontSize:16, fontWeight:700 },
  quickBtn: {
    background:'rgba(16,185,129,0.08)',
    border:'1px solid rgba(16,185,129,0.2)',
    borderRadius:10, padding:'8px 14px',
    color:'#10b981', fontSize:12, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
  },
  searchRow: { display:'flex', alignItems:'center', gap:14 },
  searchInput: {
    flex:1,
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:12, padding:'12px 16px',
    color:'#f1f5f9', fontSize:14,
    fontFamily:"'Space Grotesk',sans-serif", outline:'none',
  },
  countBadge: {
    fontSize:12, color:'#475569',
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:8, padding:'6px 12px',
    whiteSpace:'nowrap',
  },
  tableWrap: {
    flex:1,
    background:'#0d1422',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:16, overflow:'auto',
  },
  table: { width:'100%', borderCollapse:'collapse' },
  th: {
    padding:'14px 16px',
    fontSize:11, fontWeight:600, color:'#475569',
    textTransform:'uppercase', letterSpacing:'0.06em',
    textAlign:'left',
    borderBottom:'1px solid rgba(255,255,255,0.06)',
    background:'rgba(0,0,0,0.2)',
    position:'sticky', top:0,
  },
  tr: {
    borderBottom:'1px solid rgba(255,255,255,0.04)',
    transition:'background .15s',
  },
  td: { padding:'12px 16px', verticalAlign:'middle' },
  rowNum: { fontSize:12, color:'#334155', fontFamily:"'JetBrains Mono',monospace" },
  estName: { display:'flex', alignItems:'center', gap:10 },
  miniAvatar: {
    width:32, height:32, borderRadius:'50%',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:11, fontWeight:700, flexShrink:0,
  },
  estNombreText: { fontSize:13, fontWeight:600, color:'#e2e8f0' },
  estCorreo: { fontSize:11, color:'#475569', marginTop:1 },
  carne: {
    fontFamily:"'JetBrains Mono',monospace",
    fontSize:12, color:'#94a3b8',
    background:'rgba(255,255,255,0.04)',
    borderRadius:6, padding:'3px 8px',
  },
  carrera: { fontSize:12, color:'#64748b' },
  btnGroup: { display:'flex', gap:6 },
  estadoBtn: {
    width:32, height:32, borderRadius:8,
    fontSize:13, fontWeight:500,
    cursor:'pointer', fontFamily:"'Space Grotesk',sans-serif",
    transition:'all .15s',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  footer: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    background:'#0d1422',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:14, padding:'16px 24px',
  },
  footerInfo: { fontSize:13 },
  saveBtn: {
    background:'linear-gradient(135deg,#1e3a6e,#3b82f6)',
    border:'none', borderRadius:10,
    padding:'12px 28px',
    color:'#fff', fontSize:14, fontWeight:600,
    fontFamily:"'Space Grotesk',sans-serif",
    transition:'opacity .2s',
  },
  empty: {
    padding:40, textAlign:'center', color:'#475569', fontSize:14,
  },
}

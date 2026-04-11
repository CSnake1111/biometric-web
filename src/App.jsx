import { useState, useEffect } from 'react'
import Login from './pages/Login'
import DashboardMaestro from './pages/DashboardMaestro'
import DashboardEstudiante from './pages/DashboardEstudiante'
import Asistencia from './pages/Asistencia'

export default function App() {
  const [user, setUser]           = useState(null)
  const [page, setPage]           = useState('dashboard')
  const [cursoActivo, setCursoActivo] = useState(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('umg_session')
      if (stored) setUser(JSON.parse(stored))
    } catch {}
    setLoading(false)
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('umg_session', JSON.stringify(userData))
    setPage('dashboard')
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('umg_session')
    setPage('dashboard')
    setCursoActivo(null)
  }

  const irAsistencia = (curso) => {
    setCursoActivo(curso)
    setPage('asistencia')
  }

  const volverDashboard = () => {
    setCursoActivo(null)
    setPage('dashboard')
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16}}>
      <div style={{width:36,height:36,border:'2px solid rgba(37,99,235,0.3)',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user) return <Login onLogin={handleLogin} />

  // Detectar rol: join con tabla roles tiene prioridad, tipo_persona como fallback
  const rol = user.roles?.nombre_rol || user.tipo_persona || ''

  // ⛔ CONTROL DE ACCESO — solo estos roles pueden usar la web
  const ROLES_WEB = ['Administrador', 'Catedratico', 'Estudiante']
  if (!ROLES_WEB.includes(rol)) {
    // Rol no autorizado: limpiar sesión y mostrar error en login
    localStorage.removeItem('umg_session')
    return (
      <Login
        onLogin={handleLogin}
        errorInicial={`Acceso denegado: el rol "${rol || 'sin rol'}" no tiene acceso al portal web. Usa el programa de escritorio.`}
      />
    )
  }

  if (page === 'asistencia' && cursoActivo)
    return <Asistencia curso={cursoActivo} user={user} onVolver={volverDashboard} />

  if (rol === 'Estudiante')
    return <DashboardEstudiante user={user} onLogout={handleLogout} />

  // Catedratico y Administrador
  return <DashboardMaestro user={user} onLogout={handleLogout} onIrAsistencia={irAsistencia} />
}

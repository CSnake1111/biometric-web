import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Asistencia from './pages/Asistencia'

export default function App() {
  const [session, setSession] = useState(null)
  const [user, setUser]       = useState(null) // row from usuarios table
  const [page, setPage]       = useState('dashboard') // 'dashboard' | 'asistencia'
  const [cursoActivo, setCursoActivo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('umg_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('umg_user', JSON.stringify(userData))
    setPage('dashboard')
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('umg_user')
    setPage('dashboard')
  }

  const irAAsistencia = (curso) => {
    setCursoActivo(curso)
    setPage('asistencia')
  }

  const volverDashboard = () => {
    setCursoActivo(null)
    setPage('dashboard')
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <div style={{width:40,height:40,border:'3px solid #1e3a6e',borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user) return <Login onLogin={handleLogin} />

  if (page === 'asistencia' && cursoActivo)
    return <Asistencia curso={cursoActivo} user={user} onVolver={volverDashboard} />

  return <Dashboard user={user} onLogout={handleLogout} onIrAsistencia={irAAsistencia} />
}

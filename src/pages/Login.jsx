import { useState } from 'react'
import { supabase } from '../lib/supabase'

const hashSHA256 = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase()
}

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const hash = await hashSHA256(password)
      const expectedHash = `LEGACY:${hash}`

      const { data, error: dbErr } = await supabase
        .from('usuarios')
        .select('*, roles(nombre_rol)')
        .eq('usuario', usuario.trim())
        .eq('activo', true)
        .single()

      if (dbErr || !data) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      // Verificar hash — soporta LEGACY y también comparación directa
      const storedHash = data.password_hash || ''
      const valid = storedHash === expectedHash ||
                    storedHash === hash ||
                    storedHash.toUpperCase() === expectedHash.toUpperCase()

      if (!valid) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      // Solo catedráticos y admins pueden entrar al portal web
      const rol = data.roles?.nombre_rol || ''
      if (!['Administrador','Catedratico'].includes(rol)) {
        setError('Solo catedráticos y administradores tienen acceso al portal web')
        setLoading(false)
        return
      }

      onLogin(data)
    } catch (err) {
      setError('Error de conexión. Verifica tu internet.')
    }
    setLoading(false)
  }

  return (
    <div style={styles.root}>
      {/* fondo decorativo */}
      <div style={styles.bg} />
      <div style={styles.grid} />

      <div style={styles.card} className="fade-up">
        {/* Logo / Header */}
        <div style={styles.header}>
          <div style={styles.logoWrap}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="#1e3a6e"/>
              <path d="M18 8L28 13V23L18 28L8 23V13L18 8Z" stroke="#c8a84b" strokeWidth="1.5" fill="none"/>
              <circle cx="18" cy="18" r="4" fill="#3b82f6"/>
              <circle cx="18" cy="18" r="2" fill="#60a5fa"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.title}>BiometricUMG</h1>
            <p style={styles.subtitle}>Portal Docente — UMG La Florida</p>
          </div>
        </div>

        <div style={styles.divider} />

        <p style={styles.label}>Ingresa tus credenciales del sistema</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldWrap}>
            <label style={styles.fieldLabel}>Usuario</label>
            <input
              style={styles.input}
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              placeholder="tu.usuario"
              autoComplete="username"
              required
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.fieldLabel}>Contraseña</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              <span style={{marginRight:8}}>⚠</span>{error}
            </div>
          )}

          <button style={{...styles.btn, ...(loading ? styles.btnDisabled : {})}} type="submit" disabled={loading}>
            {loading
              ? <><span style={styles.spinner}/> Verificando...</>
              : 'Iniciar sesión →'
            }
          </button>
        </form>

        <p style={styles.footer}>
          Universidad Mariano Gálvez · Sede La Florida · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    background: '#080c14',
    padding: '20px',
  },
  bg: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(30,58,110,0.5) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: `linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)`,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    background: 'rgba(13,20,34,0.95)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '40px 36px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(20px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  logoWrap: {
    flexShrink: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 12,
    color: '#c8a84b',
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.07)',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 20,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '12px 14px',
    color: '#f1f5f9',
    fontSize: 14,
    fontFamily: "'Space Grotesk', sans-serif",
    outline: 'none',
    transition: 'border-color .2s',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: '#fca5a5',
    display: 'flex',
    alignItems: 'center',
  },
  btn: {
    background: 'linear-gradient(135deg, #1e3a6e, #3b82f6)',
    border: 'none',
    borderRadius: 10,
    padding: '14px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Space Grotesk', sans-serif",
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    transition: 'opacity .2s, transform .1s',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  spinner: {
    width: 16, height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  footer: {
    marginTop: 28,
    fontSize: 11,
    color: '#334155',
    textAlign: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
}

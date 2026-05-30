import { useState } from 'react'
import { supabase } from '../lib/supabase'

const hashSHA256 = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase()
}

const hashSHA256_UTF16LE = async (str) => {
  const utf16 = new Uint8Array(str.length * 2)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    utf16[i * 2]     = code & 0xFF
    utf16[i * 2 + 1] = (code >> 8) & 0xFF
  }
  const buf = await crypto.subtle.digest('SHA-256', utf16)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase()
}

const verifyPassword = async (plain, stored) => {
  if (!stored) return false
  const s = stored.trim()

  if (s.startsWith('LEGACY2:')) {
    const h = await hashSHA256(plain)
    return s.substring(8).toUpperCase() === h
  }
  if (s.startsWith('LEGACY:')) {
    const h = await hashSHA256_UTF16LE(plain)
    return s.substring(7).toUpperCase() === h
  }
  if (s.includes(':')) {
    try {
      const parts = s.split(':', 2)
      const saltBytes  = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0))
      const storedHash = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0))
      const passBytes  = new TextEncoder().encode(plain)
      const combined   = new Uint8Array(saltBytes.length + passBytes.length)
      combined.set(saltBytes, 0)
      combined.set(passBytes, saltBytes.length)
      const computed = new Uint8Array(await crypto.subtle.digest('SHA-256', combined))
      if (computed.length !== storedHash.length) return false
      let diff = 0
      for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ storedHash[i]
      return diff === 0
    } catch { return false }
  }
  return false
}

export default function Login({ onLogin, errorInicial = '' }) {
  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(errorInicial)
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: dbErr } = await supabase
        .from('usuarios')
        .select('*, roles!left(nombre_rol)')
        .eq('usuario', usuario.trim())
        .eq('activo', true)
        .single()

      if (dbErr || !data) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      const valid = await verifyPassword(password, data.password_hash || '')
      if (!valid) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      await supabase.from('intentos_login').insert({
        usuario: data.usuario || data.correo,
        exitoso: true,
        metodo: 'PASSWORD_WEB'
      })

      onLogin(data)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div style={S.root}>
      <div style={S.bg} />
      <div style={{...S.hex, top:'10%', left:'5%', opacity:.04}} />
      <div style={{...S.hex, bottom:'15%', right:'8%', opacity:.03, width:300, height:300}} />

      <div style={S.card} className="fade-up">
        {/* Header */}
        <div style={S.header}>
          <div style={S.logoBox}>
            <img src="/logo_umg.png" alt="UMG"
              style={{width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(200,168,75,0.5)'}}
              onError={e => { e.target.style.display='none' }}
            />
          </div>
          <div>
            <h1 style={S.title}>BiometricUMG</h1>
            <p style={S.sub}>Portal Académico · UMG La Florida</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={S.form}>
          <div style={S.field}>
            <label style={S.lbl}>Usuario</label>
            <input
              style={S.inp}
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              placeholder="tu.usuario"
              autoComplete="username"
              required
            />
          </div>
          <div style={S.field}>
            <label style={S.lbl}>Contraseña</label>
            <input
              style={S.inp}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div style={S.err}>⚠ {error}</div>}

          <button
            style={{...S.btn, opacity: loading ? .6 : 1}}
            type="submit"
            disabled={loading}
          >
            {loading
              ? <><span style={S.spin} /> Verificando...</>
              : 'Iniciar sesión →'
            }
          </button>
        </form>

        <p style={S.footer}>Universidad Mariano Gálvez · Sede La Florida · {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}

const S = {
  root: {
    minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
    position:'relative', overflow:'hidden', background:'var(--bg)', padding:20,
  },
  bg: {
    position:'absolute', inset:0,
    background:'radial-gradient(ellipse 70% 60% at 50% -10%, rgba(30,58,110,0.45) 0%, transparent 70%)',
    pointerEvents:'none',
  },
  hex: {
    position:'absolute', width:200, height:200,
    background:'linear-gradient(135deg, #1e3a6e, #2563eb)',
    clipPath:'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    pointerEvents:'none',
  },
  card: {
    position:'relative', width:'100%', maxWidth:420,
    background:'rgba(11,17,32,0.96)',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:20, padding:'36px 32px',
    boxShadow:'0 32px 100px rgba(0,0,0,0.7)',
    backdropFilter:'blur(24px)',
  },
  header: { display:'flex', alignItems:'center', gap:12, marginBottom:28 },
  logoBox: {
    width:48, height:48, borderRadius:12,
    background:'linear-gradient(135deg,#0d1829,#1e2d47)',
    border:'1px solid rgba(37,99,235,0.3)',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
  },
  title: { fontSize:20, fontWeight:700, color:'var(--text)', letterSpacing:'-0.5px', fontFamily:'Syne,sans-serif' },
  sub:   { fontSize:11, color:'#c8a84b', fontFamily:"'DM Mono',monospace", marginTop:2 },
  form:  { display:'flex', flexDirection:'column', gap:16 },
  field: { display:'flex', flexDirection:'column', gap:6 },
  lbl: {
    fontSize:11, fontWeight:600, color:'var(--text2)',
    textTransform:'uppercase', letterSpacing:'.06em',
  },
  inp: {
    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:14,
    outline:'none', transition:'border-color .2s',
    fontFamily:'inherit',
  },
  err: {
    background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.3)',
    borderRadius:10, padding:'10px 14px', fontSize:13, color:'#fca5a5',
  },
  btn: {
    background:'linear-gradient(135deg,#1e3a6e,#2563eb)',
    border:'none', borderRadius:10, padding:'13px',
    color:'#fff', fontSize:14, fontWeight:600,
    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    marginTop:4, cursor:'pointer', transition:'opacity .2s',
    fontFamily:'inherit',
  },
  spin: {
    width:15, height:15,
    border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff',
    borderRadius:'50%', display:'inline-block', animation:'spin 1s linear infinite',
  },
  footer: { marginTop:28, fontSize:11, color:'var(--text3)', textAlign:'center', fontFamily:"'DM Mono',monospace" },
}
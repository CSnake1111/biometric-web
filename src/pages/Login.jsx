import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// SHA-256 con UTF-8 (para LEGACY2 y formato nuevo)
const hashSHA256 = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase()
}

// SHA-256 con UTF-16LE (para LEGACY: que viene de SQL Server / Java app)
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

// Verifica la contraseña contra cualquier formato de hash guardado en DB
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

  // Formato SALTED nuevo generado por el Java: "base64salt:base64hash"
  // SHA-256(salt_bytes + password_utf8_bytes)
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

// ─── Facial recognition via face-api.js (loaded from CDN) ───
let faceApiLoaded = false
const loadFaceApi = () => new Promise((resolve) => {
  if (faceApiLoaded || window.faceapi) { faceApiLoaded = true; resolve(); return; }
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js'
  script.onload = async () => {
    try {
      await Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
        window.faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
        window.faceapi.nets.faceLandmark68TinyNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      ])
      faceApiLoaded = true
    } catch(e) { console.error('face-api load error:', e) }
    resolve()
  }
  script.onerror = () => resolve()
  document.head.appendChild(script)
})

export default function Login({ onLogin, errorInicial = '' }) {
  const [mode, setMode]       = useState('password') // 'password' | 'facial'
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(errorInicial)
  const [loading, setLoading] = useState(false)
  const [camStatus, setCamStatus] = useState('idle') // 'idle'|'loading'|'scanning'|'found'|'error'
  const [scanMsg, setScanMsg] = useState('')
  const [faceApiReady, setFaceApiReady] = useState(false)

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const scannerRef  = useRef(null)
  const descriptorsRef = useRef([]) // [{id_usuario, descriptor}]

  // Load face-api when facial mode selected
  useEffect(() => {
    if (mode === 'facial' && !faceApiLoaded) {
      loadFaceApi().then(() => setFaceApiReady(!!window.faceapi))
    } else if (mode === 'facial') {
      setFaceApiReady(true)
    }
    return () => stopCamera()
  }, [mode])

  useEffect(() => {
    if (mode === 'facial' && faceApiReady) startFacial()
    else if (mode !== 'facial') stopCamera()
  }, [faceApiReady, mode])

  const stopCamera = () => {
    clearInterval(scannerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCamStatus('idle')
  }

  const startFacial = async () => {
    setCamStatus('loading')
    setScanMsg('Cargando modelos de reconocimiento...')
    setError('')
    descriptorsRef.current = []

    // ── 1. Obtener fotos de perfil de Supabase Storage para calcular descriptores ──
    try {
      // Traer usuarios que tienen muestras faciales
      const { data: muestras } = await supabase
        .from('muestras_faciales')
        .select('id_usuario, nombre_archivo')

      if (!muestras || muestras.length === 0) {
        setScanMsg('No hay datos biométricos registrados en la nube')
        setCamStatus('error')
        return
      }

      // Agrupar por usuario y tomar máximo 5 muestras cada uno
      const byUser = {}
      muestras.forEach(m => {
        if (!byUser[m.id_usuario]) byUser[m.id_usuario] = []
        if (byUser[m.id_usuario].length < 5) byUser[m.id_usuario].push(m.nombre_archivo)
      })

      const uniqueIds = Object.keys(byUser).map(Number)

      // Traer datos del usuario
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id_usuario, nombre, apellido, usuario, correo, foto, id_rol, roles(nombre_rol)')
        .in('id_usuario', uniqueIds)
        .eq('activo', true)

      if (!usuarios || usuarios.length === 0) {
        setScanMsg('No se encontraron usuarios activos con biometría')
        setCamStatus('error')
        return
      }

      setScanMsg(`Procesando ${usuarios.length} perfiles biométricos...`)

      // ── 2. Calcular descriptores desde las fotos de perfil en Storage ──
      // Usamos foto de perfil (bucket "fotos") que ya está en la nube.
      // face-api.js calcula el descriptor de 128 dimensiones directamente desde la imagen.
      const descriptoresCargados = []

      for (const usr of usuarios) {
        if (!usr.foto) continue
        try {
          // La foto puede ser una URL de Supabase Storage o URL externa
          const img = await cargarImagenCORS(usr.foto)
          if (!img) continue

          const det = await window.faceapi
            .detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
            .withFaceLandmarks(true)
            .withFaceDescriptor()

          if (det) {
            descriptoresCargados.push({
              id_usuario:  usr.id_usuario,
              nombre:      usr.nombre,
              apellido:    usr.apellido,
              usuario:     usr.usuario,
              correo:      usr.correo,
              id_rol:      usr.id_rol,
              nombre_rol:  usr.roles?.nombre_rol || '',
              descriptor:  det.descriptor,
            })
          }
        } catch(e) {
          console.warn('No se pudo procesar foto de', usr.nombre, e.message)
        }
      }

      // Si con foto de perfil no alcanza, intentar con muestras del bucket "rostros"
      for (const usr of usuarios) {
        const yaRegistrado = descriptoresCargados.find(d => d.id_usuario === usr.id_usuario)
        if (yaRegistrado) continue

        const archivos = byUser[usr.id_usuario] || []
        for (const archivo of archivos) {
          try {
            const { data: urlData } = supabase.storage
              .from('rostros')
              .getPublicUrl(`${usr.id_usuario}/${archivo}`)
            const img = await cargarImagenCORS(urlData?.publicUrl)
            if (!img) continue

            const det = await window.faceapi
              .detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
              .withFaceLandmarks(true)
              .withFaceDescriptor()

            if (det) {
              descriptoresCargados.push({
                id_usuario: usr.id_usuario,
                nombre:     usr.nombre,
                apellido:   usr.apellido,
                usuario:    usr.usuario,
                correo:     usr.correo,
                id_rol:     usr.id_rol,
                nombre_rol: usr.roles?.nombre_rol || '',
                descriptor: det.descriptor,
              })
              break // con una muestra válida alcanza para este usuario
            }
          } catch(e) {
            console.warn('Muestra rostros fallo:', archivo, e.message)
          }
        }
      }

      descriptorsRef.current = descriptoresCargados
      console.log(`✅ Descriptores cargados: ${descriptoresCargados.length}/${usuarios.length} usuarios`)

      if (descriptoresCargados.length === 0) {
        setScanMsg('No se pudieron procesar los datos biométricos. Verifica las fotos de perfil.')
        setCamStatus('error')
        return
      }

      setScanMsg(`${descriptoresCargados.length} perfiles listos. Iniciando cámara...`)
    } catch(e) {
      console.error('Error cargando descriptores:', e)
      setScanMsg('Error al cargar datos biométricos')
      setCamStatus('error')
      return
    }

    // ── 3. Iniciar cámara ──
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamStatus('scanning')
      setScanMsg('Mira a la cámara...')
      startScanning()
    } catch(e) {
      setCamStatus('error')
      setScanMsg('No se pudo acceder a la cámara')
      setError('Permite el acceso a la cámara en tu navegador')
    }
  }

  // Carga una imagen desde URL respetando CORS (usa crossOrigin anonymous)
  const cargarImagenCORS = (url) => new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    // Agregar cache-buster para evitar problemas CORS con caché
    img.src = url.includes('?') ? url : url + '?t=' + Date.now()
    setTimeout(() => resolve(null), 8000) // timeout 8s
  })

  const startScanning = () => {
    if (!window.faceapi) return
    let attempts = 0
    const MAX_ATTEMPTS = 80 // ~40 segundos a 500ms

    scannerRef.current = setInterval(async () => {
      if (!videoRef.current || !modoFacialActivoRef.current) return

      attempts++
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(scannerRef.current)
        setScanMsg('No se detectó ningún rostro. Intenta de nuevo.')
        setCamStatus('error')
        return
      }

      try {
        const detection = await window.faceapi
          .detectSingleFace(
            videoRef.current,
            new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.45, inputSize: 320 })
          )
          .withFaceLandmarks(true)
          .withFaceDescriptor()

        if (!detection) {
          if (attempts % 4 === 0)
            setScanMsg(`Buscando rostro... (${Math.round(attempts * 0.5)}s)`)
          return
        }

        // ── Rostro detectado — hacer matching ──
        clearInterval(scannerRef.current)
        setScanMsg('Rostro detectado — verificando identidad...')
        await matchFace(detection.descriptor)

      } catch(e) {
        console.error('scan error', e)
      }
    }, 500)
  }

  // Ref para saber si el modo facial sigue activo (evita setState en componente desmontado)
  const modoFacialActivoRef = useRef(false)
  useEffect(() => {
    modoFacialActivoRef.current = (camStatus === 'scanning')
  }, [camStatus])

  const matchFace = async (queryDescriptor) => {
    const db = descriptorsRef.current
    if (!db || db.length === 0) {
      setError('No hay datos biométricos cargados. Recarga e intenta de nuevo.')
      setCamStatus('error')
      return
    }

    // ── Distancia euclidiana estándar de face-api.js ──
    // Umbral recomendado: < 0.6 = misma persona
    const UMBRAL = 0.55

    let mejorDist  = Infinity
    let mejorUser  = null
    let segundaDist = Infinity

    for (const entry of db) {
      // face-api.js euclideana manual
      let suma = 0
      for (let i = 0; i < queryDescriptor.length; i++) {
        const d = queryDescriptor[i] - entry.descriptor[i]
        suma += d * d
      }
      const dist = Math.sqrt(suma)

      if (dist < mejorDist) {
        segundaDist = mejorDist
        mejorDist   = dist
        mejorUser   = entry
      } else if (dist < segundaDist) {
        segundaDist = dist
      }
    }

    console.log(`🔍 Mejor dist: ${mejorDist.toFixed(3)} | Segundo: ${segundaDist.toFixed(3)} | Umbral: ${UMBRAL}`)

    if (!mejorUser || mejorDist > UMBRAL) {
      setError(`Rostro no reconocido (dist=${mejorDist.toFixed(2)}). Verifica la iluminación o regístrate en la app.`)
      setCamStatus('error')
      setTimeout(() => {
        if (descriptorsRef.current.length > 0) {
          setCamStatus('scanning')
          setScanMsg('Mira a la cámara...')
          startScanning()
        }
      }, 3500)
      return
    }

    // ── Match encontrado ──
    setCamStatus('found')
    setScanMsg(`✓ Bienvenido, ${mejorUser.nombre}!`)
    stopCamera()

    // Traer datos completos del usuario desde Supabase
    const { data: userFull } = await supabase
      .from('usuarios')
      .select('*, roles(nombre_rol)')
      .eq('id_usuario', mejorUser.id_usuario)
      .single()

    await supabase.from('intentos_login').insert({
      usuario: mejorUser.usuario || mejorUser.correo,
      exitoso: true,
      metodo:  'FACIAL_WEB'
    })

    setTimeout(() => onLogin(userFull || mejorUser), 800)
  }

  // ─── Password login ───
  const handlePasswordLogin = async (e) => {
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

      const storedHash = data.password_hash || ''
      const valid = await verifyPassword(password, storedHash)

      if (!valid) {
        setError('Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      // El rol se detecta automáticamente desde la DB — sin restricción por pestaña
      const userRol = data.roles?.nombre_rol || data.tipo_persona || ''
      if (!userRol) {
        // Sin rol asignado: igual puede entrar, el dashboard decidirá qué mostrar
        console.warn('Usuario sin rol definido:', data.usuario)
      }

      await supabase.from('intentos_login').insert({
        usuario: data.usuario || data.correo,
        exitoso: true,
        metodo: 'PASSWORD_WEB'
      })

      onLogin(data)
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }

  const statusColor = {
    idle: '#3d4f6e', loading: '#d97706', scanning: '#2563eb', found: '#059669', error: '#dc2626'
  }

  return (
    <div style={S.root}>
      <div style={S.bg} />
      {/* Decorative hexagons */}
      <div style={{...S.hex, top:'10%', left:'5%', opacity:.04}} />
      <div style={{...S.hex, bottom:'15%', right:'8%', opacity:.03, width:300,height:300}} />

      <div style={S.card} className="fade-up">
        {/* Header */}
        <div style={S.header}>
          <div style={S.logoBox}>
            <img
              src="/logo_umg.png"
              alt="UMG"
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(200,168,75,0.5)' }}
              onError={e => { e.target.style.display='none' }}
            />
          </div>
          <div>
            <h1 style={S.title}>BiometricUMG</h1>
            <p style={S.sub}>Portal Académico · UMG La Florida</p>
          </div>
        </div>

        {/* Mode selector */}
        <div style={S.modeTabs}>
          {[['password','🔑 Contraseña'],['facial','👁 Facial']].map(([m,label]) => (
            <button key={m} style={{...S.modeTab, ...(mode===m ? S.modeTabActive : {})}}
              onClick={() => { setMode(m); setError(''); }}>
              {label}
            </button>
          ))}
        </div>

        {/* Password form */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} style={S.form} className="fade-up">
            <div style={S.field}>
              <label style={S.lbl}>Usuario</label>
              <input style={S.inp} type="text" value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="tu.usuario" autoComplete="username" required />
            </div>
            <div style={S.field}>
              <label style={S.lbl}>Contraseña</label>
              <input style={S.inp} type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" required />
            </div>
            {error && <div style={S.err}>⚠ {error}</div>}
            <button style={{...S.btn, opacity: loading ? .6 : 1}} type="submit" disabled={loading}>
              {loading ? <><span style={S.spin}/>Verificando...</> : 'Iniciar sesión →'}
            </button>
          </form>
        )}

        {/* Facial mode */}
        {mode === 'facial' && (
          <div style={S.facialWrap} className="fade-up">
            <div style={{...S.camBox, borderColor: statusColor[camStatus]}}>
              {camStatus === 'idle' && (
                <div style={S.camPlaceholder}>
                  <span style={{fontSize:48}}>👁</span>
                  <p style={{color:'var(--text2)', fontSize:13, marginTop:8}}>Iniciando cámara...</p>
                </div>
              )}
              {camStatus === 'loading' && (
                <div style={S.camPlaceholder}>
                  <span style={S.spin}/>
                  <p style={{color:'var(--yellow)', fontSize:13, marginTop:12}}>Cargando modelos...</p>
                </div>
              )}
              <video ref={videoRef} style={{...S.video, display: ['scanning','found'].includes(camStatus) ? 'block' : 'none'}}
                playsInline muted autoPlay />
              <canvas ref={canvasRef} style={{display:'none'}} />
              {camStatus === 'scanning' && <div style={S.scanLine}/>}
              {camStatus === 'error' && (
                <div style={S.camPlaceholder}>
                  <span style={{fontSize:48}}>❌</span>
                  <p style={{color:'var(--red2)', fontSize:12, marginTop:8, textAlign:'center', padding:'0 16px'}}>{scanMsg}</p>
                </div>
              )}
              {camStatus === 'found' && (
                <div style={S.foundOverlay}>
                  <div style={S.foundCheck}>✓</div>
                </div>
              )}
              {/* Status indicator */}
              <div style={{...S.statusDot, background: statusColor[camStatus]}}/>
            </div>

            {scanMsg && !['error'].includes(camStatus) && (
              <p style={{...S.scanMsg, color: statusColor[camStatus]}}>{scanMsg}</p>
            )}
            {error && <div style={S.err}>⚠ {error}</div>}

            {['error'].includes(camStatus) && (
              <button style={S.retryBtn} onClick={startFacial}>↻ Intentar de nuevo</button>
            )}

            <p style={S.hint}>Asegúrate de tener buena iluminación y mira directo a la cámara</p>
          </div>
        )}

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
    position:'relative', width:'100%', maxWidth:440,
    background:'rgba(11,17,32,0.96)',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:20, padding:'36px 32px',
    boxShadow:'0 32px 100px rgba(0,0,0,0.7)',
    backdropFilter:'blur(24px)',
  },
  header: { display:'flex', alignItems:'center', gap:12, marginBottom:24 },
  logoBox: {
    width:44, height:44, borderRadius:12,
    background:'linear-gradient(135deg,#0d1829,#1e2d47)',
    border:'1px solid rgba(37,99,235,0.3)',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
  },
  title: { fontSize:20, fontWeight:700, color:'var(--text)', letterSpacing:'-0.5px', fontFamily:'Syne,sans-serif' },
  sub:   { fontSize:11, color:'var(--gold)', fontFamily:"'DM Mono',monospace", marginTop:2 },
  modeTabs: { display:'flex', gap:6, marginBottom:24, background:'rgba(255,255,255,0.04)', borderRadius:10, padding:4 },
  modeTab: {
    flex:1, padding:'8px 0', borderRadius:8, border:'none',
    background:'transparent', color:'var(--text2)', fontSize:13, fontWeight:500,
    transition:'all .2s',
  },
  modeTabActive: {
    background:'rgba(255,255,255,0.08)', color:'var(--text)', fontWeight:600,
    boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
  },
  form: { display:'flex', flexDirection:'column', gap:14 },
  field: { display:'flex', flexDirection:'column', gap:6 },
  lbl: { fontSize:11, fontWeight:600, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em' },
  inp: {
    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:10, padding:'11px 14px', color:'var(--text)', fontSize:14,
    transition:'border-color .2s',
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
    marginTop:4, transition:'opacity .2s',
    animation:'glowPulse 3s ease-in-out infinite',
  },
  spin: {
    width:15, height:15,
    border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff',
    borderRadius:'50%', display:'inline-block', animation:'spin 1s linear infinite',
  },
  facialWrap: { display:'flex', flexDirection:'column', gap:12, alignItems:'center' },
  camBox: {
    width:'100%', maxWidth:360, aspectRatio:'4/3',
    borderRadius:16, overflow:'hidden', position:'relative',
    border:'2px solid', transition:'border-color .4s',
    background:'#06090f',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  video: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  camPlaceholder: {
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    width:'100%', height:'100%',
  },
  scanLine: {
    position:'absolute', left:0, right:0, height:2,
    background:'linear-gradient(90deg, transparent, #2563eb, transparent)',
    animation:'scanLine 2s ease-in-out infinite',
    boxShadow:'0 0 8px #2563eb',
  },
  foundOverlay: {
    position:'absolute', inset:0, background:'rgba(5,150,105,0.3)',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  foundCheck: {
    width:80, height:80, borderRadius:'50%',
    background:'rgba(5,150,105,0.8)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:40, color:'#fff', fontWeight:700,
    boxShadow:'0 0 40px rgba(5,150,105,0.6)',
  },
  statusDot: {
    position:'absolute', top:10, right:10,
    width:10, height:10, borderRadius:'50%',
    animation:'pulse 2s ease-in-out infinite',
  },
  scanMsg: { fontSize:13, fontWeight:500, textAlign:'center' },
  hint: { fontSize:11, color:'var(--text3)', textAlign:'center' },
  retryBtn: {
    background:'rgba(37,99,235,0.15)', border:'1px solid rgba(37,99,235,0.4)',
    borderRadius:10, padding:'10px 24px', color:'var(--accent3)',
    fontSize:13, fontWeight:600,
  },
  footer: { marginTop:28, fontSize:11, color:'var(--text3)', textAlign:'center', fontFamily:"'DM Mono',monospace" },
}
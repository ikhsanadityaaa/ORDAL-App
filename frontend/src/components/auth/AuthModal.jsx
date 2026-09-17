import { useState, useRef, useEffect } from 'react'
import { Mail, Eye, EyeOff, Loader2, Zap, X } from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useI18n from '../../stores/i18nStore'
import api from '../../api'
import { GoogleGlyph } from '../brand'

// ─────────────────────────────────────────────────────────────────────────────
// AuthModal — popup login saat app dibuka (replika auth-modal ORDAL-Web):
// header charcoal + strip oranye, tombol Google, divider "atau",
// form email+password, toggle login/daftar.
// ─────────────────────────────────────────────────────────────────────────────

export default function AuthModal() {
  const { t } = useI18n()
  const {
    showAuthModal, googleConfigured,
    login, register, setDeviceLimit,
  } = useAuthStore()

  const [mode, setMode] = useState('login') // login | register
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleWaiting, setGoogleWaiting] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  if (!showAuthModal) return null

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError(t('auth.err_fill'))
      return
    }
    if (mode === 'register' && !name.trim()) {
      setError(t('auth.err_name'))
      return
    }
    if (password.length < 6) {
      setError(t('auth.err_pass_len'))
      return
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(name.trim(), email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
      // sukses → store handle (token set / verify screen)
    } catch (err) {
      const msg = err.response?.data?.detail
      if (typeof msg === 'object' && msg?.code === 'DEVICE_LIMIT') {
        setDeviceLimit(msg)
      } else {
        setError(typeof msg === 'string' ? msg : t('auth.err_generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  const startGoogle = async () => {
    setError('')
    // Cek konfigurasi (cache dari /auth/me; kalau belum ada, cek langsung)
    let configured = googleConfigured
    if (configured === undefined || configured === null) {
      try {
        const res = await api.get('/auth/google/config')
        configured = res.data?.configured
      } catch (e) {
        configured = false
      }
    }
    if (!configured) {
      setError(t('auth.google_soon'))
      return
    }
    setGoogleWaiting(true)
    try {
      const res = await api.post('/auth/google/start', {})
      const state = res.data?.state
      // backend sudah buka browser sistem — poll sampai selesai
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.post('/auth/google/poll', { state })
          const d = r.data
          if (d.status === 'completed') {
            stopPolling()
            setGoogleWaiting(false)
            useAuthStore.getState().setAuth(d.token, d.user, d)
          } else if (d.status === 'device_limit') {
            stopPolling()
            setGoogleWaiting(false)
            if (d.devices?.length) {
              setDeviceLimit({ code: 'DEVICE_LIMIT', message: t('device.limit_msg'), devices: d.devices })
              return
            }
            try {
              const dl = await api.get('/auth/devices')
              setDeviceLimit({ code: 'DEVICE_LIMIT', message: t('device.limit_msg'), devices: dl.data.devices })
            } catch (e) {
              setDeviceLimit({ code: 'DEVICE_LIMIT', message: t('device.limit_msg'), devices: [] })
            }
          } else if (d.status === 'error' || d.status === 'expired') {
            stopPolling()
            setGoogleWaiting(false)
            setError(t('auth.google_failed'))
          }
        } catch (e) { /* keep polling */ }
      }, 1500)
    } catch (err) {
      setGoogleWaiting(false)
      const msg = err.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('auth.google_failed'))
    }
  }

  return (
    <div className="sticker-overlay">
      <div className="sticker-modal" role="dialog" aria-modal="true">

        {/* Header charcoal + strip oranye (khas web) */}
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <span className="deco-glyph" style={{ bottom: 12, right: 64, color: 'rgba(244,242,236,0.22)', fontSize: 26 }}>✳</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 38, height: 38, background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.04em',
            }}>O</div>
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>ORDAL</div>
          </div>
          <h2>{mode === 'login' ? t('auth.login_title') : t('auth.register_title')}</h2>
          <p>{mode === 'login' ? t('auth.login_sub') : t('auth.register_sub')}</p>
        </div>

        {/* Body */}
        <div className="sticker-modal-body">
          {googleWaiting ? (
            <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
              <Loader2 size={40} strokeWidth={2.5} color="#F2661A" className="animate-spin" style={{ margin: '0 auto 14px' }} />
              <div style={{ fontWeight: 800, fontSize: 16, color: '#33363F', marginBottom: 6 }}>
                {t('auth.google_waiting')}
              </div>
              <p style={{ fontSize: 13, color: '#6B6E76', margin: '0 0 18px', lineHeight: 1.55 }}>
                {t('auth.google_waiting_sub')}
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => { stopPolling(); setGoogleWaiting(false) }}>
                <X size={14} /> {t('common.cancel')}
              </button>
            </div>
          ) : (
            <>
              {/* Tombol Google */}
              <button
                className="btn btn-block"
                onClick={startGoogle}
                style={{ height: 48, fontSize: 14.5, boxShadow: '3px 3px 0 #33363F' }}
              >
                <GoogleGlyph size={20} />
                {t('auth.google_btn')}
              </button>

              <div className="divider-or">{t('auth.or')}</div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {mode === 'register' && (
                  <div>
                    <label className="input-label">{t('auth.name')}</label>
                    <input
                      className="input"
                      style={{ height: 44 }}
                      placeholder={t('auth.name_ph')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                )}
                <div>
                  <label className="input-label">{t('auth.email')}</label>
                  <input
                    className="input"
                    style={{ height: 44 }}
                    type="email"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="input-label">{t('auth.password')}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      style={{ height: 44, paddingRight: 44 }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: '#9CA3AF', display: 'flex', padding: 4,
                      }}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="notice notice-error animate-shake" style={{ margin: 0 }}>
                    <span style={{ fontSize: 13 }}>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  style={{ height: 48, fontSize: 15, fontWeight: 800 }}
                  disabled={loading}
                >
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <Mail size={17} />}
                  {mode === 'login' ? t('auth.login_btn') : t('auth.register_btn')}
                </button>
              </form>

              {mode === 'register' && (
                <div className="notice notice-info" style={{ marginTop: 14, marginBottom: 0 }}>
                  <Zap size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5 }}>{t('auth.verif_note')}</span>
                </div>
              )}

              {/* Toggle mode */}
              <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'rgba(51,54,63,0.6)' }}>
                {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#F2661A', fontWeight: 700, fontSize: 13,
                  }}
                  className="link-sweep"
                >
                  {mode === 'login' ? t('auth.register_link') : t('auth.login_link')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

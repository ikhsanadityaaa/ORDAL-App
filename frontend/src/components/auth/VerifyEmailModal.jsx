import { useState, useEffect, useRef } from 'react'
import { Loader2, RefreshCw, ShieldCheck, AlertCircle, Terminal } from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useI18n from '../../stores/i18nStore'

// ─────────────────────────────────────────────────────────────────────────────
// VerifyEmailModal — kode verifikasi 6 digit (wajib sebelum lanjut).
// Kedaluwarsa 15 menit · kirim ulang setelah 60 detik.
// ─────────────────────────────────────────────────────────────────────────────

export default function VerifyEmailModal() {
  const { t } = useI18n()
  const { pendingVerify, verify, resend, setDeviceLimit } = useAuthStore()

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(60)
  const [minutesLeft, setMinutesLeft] = useState(15)
  const inputsRef = useRef([])

  useEffect(() => {
    if (!pendingVerify) return
    setDigits(['', '', '', '', '', ''])
    setError('')
    setCooldown(60)
    setMinutesLeft(15)
    setTimeout(() => inputsRef.current[0]?.focus(), 80)
  }, [pendingVerify?.email])

  useEffect(() => {
    if (!pendingVerify) return
    const iv = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0))
      setMinutesLeft((m) => (m > 0 ? m - 1 : 0))
    }, 1000)
    return () => clearInterval(iv)
  }, [pendingVerify])

  if (!pendingVerify) return null
  const email = pendingVerify.email

  const setDigit = (idx, val) => {
    const clean = val.replace(/\D/g, '')
    if (!clean && val !== '') return
    if (clean.length > 1) {
      // paste 6 digit sekaligus
      const chars = clean.slice(0, 6).split('')
      const next = [...digits]
      chars.forEach((c, i) => { next[idx + i] = c })
      setDigits(next)
      const focusIdx = Math.min(idx + chars.length, 5)
      inputsRef.current[focusIdx]?.focus()
      if (next.every((d) => d)) setTimeout(() => submitCode(next.join('')), 60)
      return
    }
    const next = [...digits]
    next[idx] = clean
    setDigits(next)
    if (clean && idx < 5) inputsRef.current[idx + 1]?.focus()
    if (next.every((d) => d)) setTimeout(() => submitCode(next.join('')), 60)
  }

  const onKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    }
  }

  const submitCode = async (code) => {
    if (code.length < 6 || loading) return
    setLoading(true)
    setError('')
    try {
      await verify(email, code)
      // sukses → store set token + tutup popup
    } catch (err) {
      const msg = err.response?.data?.detail
      if (typeof msg === 'object' && msg?.code === 'DEVICE_LIMIT') {
        setDeviceLimit(msg)
      } else {
        setError(typeof msg === 'string' ? msg : t('verify.err_wrong'))
        setDigits(['', '', '', '', '', ''])
        inputsRef.current[0]?.focus()
      }
    } finally {
      setLoading(false)
    }
  }

  const doResend = async () => {
    if (cooldown > 0 || resending) return
    setResending(true)
    setError('')
    try {
      await resend(email)
      setCooldown(60)
      setMinutesLeft(15)
    } catch (err) {
      const msg = err.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('verify.err_resend'))
    } finally {
      setResending(false)
    }
  }

  const code = digits.join('')

  return (
    <div className="sticker-overlay">
      <div className="sticker-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 38, height: 38, background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.04em',
            }}>O</div>
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>ORDAL</div>
          </div>
          <h2>{t('verify.title')}</h2>
          <p>
            {t('verify.sub')} <b style={{ color: 'rgba(244,242,236,0.85)' }}>{email}</b>
          </p>
        </div>

        <div className="sticker-modal-body">
          {/* 6 input digit */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el }}
                className={error ? 'animate-shake' : ''}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                inputMode="numeric"
                maxLength={6}
                style={{
                  width: 46,
                  height: 56,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: '#33363F',
                  background: '#FFFFFF',
                  border: '2px solid ' + (d ? '#F2661A' : 'rgba(51,54,63,0.16)'),
                  borderRadius: 12,
                  outline: 'none',
                  transition: 'border-color 0.15s ease, transform 0.15s ease',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#F2661A' }}
                onBlur={(e) => { if (!digits[i]) e.target.style.borderColor = 'rgba(51,54,63,0.16)' }}
              />
            ))}
          </div>

          {/* Info kedaluwarsa */}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#6B6E76', marginBottom: 14 }}>
            {t('verify.expires_in')}{' '}
            <b className="font-mono" style={{ color: '#F2661A' }}>
              {String(Math.floor(minutesLeft / 60)).padStart(2, '0')}:{String(minutesLeft % 60).padStart(2, '0')}
            </b>
          </div>

          {/* Mode pengembangan — SMTP belum dikonfigurasi */}
          {pendingVerify.dev_code && (
            <div className="notice notice-muted" style={{ marginBottom: 14 }}>
              <Terminal size={15} style={{ flexShrink: 0, marginTop: 1, color: '#173E76' }} />
              <span style={{ fontSize: 12.5 }}>
                <b>{t('verify.dev_mode')}</b> — {t('verify.dev_code')}{' '}
                <code className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: '#F2661A', letterSpacing: 3 }}>
                  {pendingVerify.dev_code}
                </code>
                <br />
                <span style={{ color: '#6B6E76' }}>{t('verify.dev_hint')}</span>
              </span>
            </div>
          )}

          {error && (
            <div className="notice notice-error" style={{ marginBottom: 14 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13 }}>{error}</span>
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            style={{ height: 48, fontSize: 15, fontWeight: 800 }}
            disabled={loading || code.length < 6}
            onClick={() => submitCode(code)}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={17} />}
            {t('verify.btn')}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#6B6E76' }}>
            {t('verify.not_received')}{' '}
            <button
              onClick={doResend}
              disabled={cooldown > 0 || resending}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: cooldown > 0 ? '#9CA3AF' : '#F2661A',
                fontWeight: 700, fontSize: 13,
              }}
              className="link-sweep"
            >
              {resending ? t('verify.sending') : t('verify.resend')}
              {cooldown > 0 && !resending ? ` (${cooldown}s)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  Loader2, Copy, Check, ArrowLeft, RefreshCw, BadgeCheck, QrCode,
  ExternalLink, Zap, Clock, ShieldCheck, KeyRound, PartyPopper,
} from 'lucide-react'
import api from '../../api'
import useI18n from '../../stores/i18nStore'
import useLicenseStore from '../../stores/licenseStore'
import { BCALogo, PayPalLogo, QRISMark, OrdalRingLogo } from '../brand'

// ─────────────────────────────────────────────────────────────────────────────
// PaymentModal v3.1 — pop-up pembayaran setelah trial 3 hari habis.
//
// Langkah:
//   choose  → pilih metode: QRIS (Bank BCA) atau PayPal — atau masukkan kode
//   qris    → QR dinamis Midtrans / instruksi transfer BCA + nominal unik
//   paypal  → bayar via PayPal (Orders API) / link fallback
//   code    → masukkan activation code (dikirim ke email setelah bayar)
//   success → ORDAL PRO aktif
//
// Verifikasi instan: app polling /payments/{id}/check tiap 3 detik — begitu
// pembayaran terdeteksi valid (webhook Midtrans / PayPal capture / verifikasi
// admin), status berubah VERIFIED dan kode aktivasi langsung muncul.
// ─────────────────────────────────────────────────────────────────────────────

export function formatRemaining(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}j ${m}m`
  if (m > 0) return `${m}m ${sec}d`
  return `${sec}d`
}

function useInvoiceCountdown(expiresAt) {
  const [left, setLeft] = useState(null)
  useEffect(() => {
    if (!expiresAt) { setLeft(null); return }
    const target = new Date(expiresAt).getTime()
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])
  return left
}

export default function PaymentModal() {
  const { t } = useI18n()
  const {
    showPaymentModal: open, paymentModalStep: initialStep, forced,
    closePaymentModal, onActivated, status,
  } = useLicenseStore()

  const [step, setStep] = useState('choose')
  const [method, setMethod] = useState(null)
  const [payment, setPayment] = useState(null)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [resendMsg, setResendMsg] = useState(null)
  const [resendCd, setResendCd] = useState(0)
  const [actInfo, setActInfo] = useState(null)
  const pollRef = useRef(null)

  const pricing = status?.pricing || {}
  const simulated = status?.payments_simulated || false
  const countdown = useInvoiceCountdown(payment?.expires_at)

  // Reset saat modal dibuka
  useEffect(() => {
    if (!open) return
    setStep(initialStep || 'choose')
    setMethod(null)
    setPayment(null)
    setError('')
    setCode('')
    setResendMsg(null)
    setResendCd(0)
    setActInfo(null)
    if (initialStep === 'code') {
      api.get('/activation/info').then((r) => setActInfo(r.data)).catch(() => {})
    }
    // Pastikan info lengkap (pricing / payments_simulated) tersedia —
    // status dari /auth/me tidak menyertakan field /trial/status.
    if (status?.pricing == null) {
      useLicenseStore.getState().refresh()
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [open, initialStep])

  // Cooldown resend countdown
  useEffect(() => {
    if (resendCd <= 0) return
    const iv = setInterval(() => setResendCd((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(iv)
  }, [resendCd])

  // ── Aksi ──────────────────────────────────────────────────────────────

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = (pid) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.post(`/payments/${pid}/check`)
        const p = res.data
        setPayment(p)
        if (p.status === 'verified') {
          stopPolling()
          setStep('code')
        }
      } catch { /* sementara gagal — coba lagi tick berikutnya */ }
    }, 3000)
  }

  const createPayment = async (m) => {
    setCreating(true)
    setError('')
    try {
      const res = await api.post('/payments/create', { method: m })
      setPayment(res.data)
      setMethod(m)
      setStep(m === 'qris_bca' ? 'qris' : 'paypal')
      startPolling(res.data.id)
    } catch (err) {
      setError(err.response?.data?.detail || t('lic.create_failed'))
    } finally {
      setCreating(false)
    }
  }

  const confirmPaid = async () => {
    setError('')
    try {
      const res = await api.post(`/payments/${payment.id}/confirm`)
      setPayment(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('lic.confirm_failed'))
    }
  }

  const simulate = async () => {
    setError('')
    try {
      const res = await api.post(`/payments/${payment.id}/simulate`)
      setPayment(res.data)
      stopPolling()
      setStep('code')
    } catch (err) {
      setError(err.response?.data?.detail || t('lic.simulate_failed'))
    }
  }

  const activate = async () => {
    if (!code.trim()) return
    setActivating(true)
    setError('')
    try {
      await api.post('/activation/activate', { code: code.trim() })
      await onActivated()
    } catch (err) {
      setError(err.response?.data?.detail || t('lic.code_invalid'))
    } finally {
      setActivating(false)
    }
  }

  const resend = async () => {
    setError('')
    setResendMsg(null)
    try {
      const res = await api.post('/activation/resend')
      setResendMsg(res.data)
      setResendCd(60)
    } catch (err) {
      setError(err.response?.data?.detail || t('lic.resend_failed'))
    }
  }

  const copyCode = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard tidak tersedia */ }
  }

  if (!open) return null

  // ── Judul per langkah ─────────────────────────────────────────────────
  const titles = {
    choose: [t('lic.title'), t('lic.sub_choose')],
    qris: [t('lic.pay_qris'), t('lic.sub_pay')],
    paypal: [t('lic.pay_paypal'), t('lic.sub_pay')],
    code: [t('lic.enter_code'), t('lic.sub_code')],
    success: [t('lic.activated'), t('lic.sub_activated')],
  }
  const [title, subtitle] = titles[step] || titles.choose
  const expiredBanner = forced && (step === 'choose')
  const trialNotEligible = status?.access?.reason === 'trial_not_eligible'

  return (
    <div
      className="sticker-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !forced) closePaymentModal() }}
    >
      <div className="sticker-modal wide" role="dialog" aria-modal="true" style={{ maxWidth: 620 }}>
        {/* ── Header charcoal + strip oranye ── */}
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <OrdalRingLogo size={34} />
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>ORDAL PRO</div>
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="sticker-modal-body">
          {/* ── Banner trial habis (mode forced) ── */}
          {expiredBanner && (
            <div className="notice notice-warn" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
              <Clock size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {trialNotEligible ? t('lic.ineligible_banner') : t('lic.expired_banner')}
              </span>
            </div>
          )}

          {error && (
            <div className="notice notice-error" style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 12.5 }}>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
            </div>
          )}

          {/* ════════ STEP: CHOOSE ════════ */}
          {step === 'choose' && (
            <>
              {/* Benefit */}
              <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Zap size={14} color="#F2661A" fill="#F2661A" /> {t('lic.benefits_title')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 12.5, color: '#494C54' }}>
                  {[t('lic.b1'), t('lic.b2'), t('lic.b3'), t('lic.b4')].map((x, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BadgeCheck size={13} color="#1E9E5A" style={{ flexShrink: 0 }} /> {x}
                    </div>
                  ))}
                </div>
              </div>

              {/* Kartu metode */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <button
                  onClick={() => createPayment('qris_bca')}
                  disabled={creating}
                  className="pay-method-card"
                >
                  <QRISMark size={34} />
                  <div className="pay-method-name">{t('lic.method_qris')}</div>
                  <div className="pay-method-desc">{t('lic.method_qris_desc')}</div>
                  <div className="pay-method-price">{pricing.display_idr || 'Rp 179.000'}</div>
                </button>
                <button
                  onClick={() => createPayment('paypal')}
                  disabled={creating}
                  className="pay-method-card"
                >
                  <PayPalLogo size={26} withWordmark={false} />
                  <div className="pay-method-name">PayPal</div>
                  <div className="pay-method-desc">{t('lic.method_paypal_desc')}</div>
                  <div className="pay-method-price">{pricing.display_usd || 'US$ 12.00'}</div>
                </button>
              </div>
              {creating && (
                <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 12.5, color: '#6B6E76', display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
                  <Loader2 size={14} className="animate-spin" color="#F2661A" /> {t('lic.creating_invoice')}
                </div>
              )}

              {/* Sudah punya kode */}
              <button
                onClick={() => {
                  setStep('code')
                  api.get('/activation/info').then((r) => setActInfo(r.data)).catch(() => {})
                }}
                className="btn-have-code"
              >
                <KeyRound size={14} /> {t('lic.have_code')}
              </button>
            </>
          )}

          {/* ════════ STEP: QRIS BCA ════════ */}
          {step === 'qris' && payment && (
            <QrisStep
              payment={payment} countdown={countdown} t={t}
              simulated={simulated}
              onBack={() => { stopPolling(); setStep('choose') }}
              onConfirm={confirmPaid} onSimulate={simulate}
            />
          )}

          {/* ════════ STEP: PAYPAL ════════ */}
          {step === 'paypal' && payment && (
            <PaypalStep
              payment={payment} countdown={countdown} t={t}
              simulated={simulated}
              onBack={() => { stopPolling(); setStep('choose') }}
              onConfirm={confirmPaid} onSimulate={simulate}
            />
          )}

          {/* ════════ STEP: MASUK KODE ════════ */}
          {step === 'code' && (
            <CodeStep
              payment={payment} t={t} code={code} setCode={setCode}
              activating={activating} onActivate={activate} actInfo={actInfo}
              resendMsg={resendMsg} resendCd={resendCd} onResend={resend}
              copied={copied} onCopy={copyCode}
            />
          )}

          {/* ════════ STEP: SUCCESS ════════ */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{
                width: 84, height: 84, margin: '0 auto 18px', background: '#1E9E5A',
                border: '2.5px solid #33363F', borderRadius: 22, boxShadow: '5px 5px 0 #33363F',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}>
                <PartyPopper size={40} strokeWidth={2.2} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>
                {t('lic.success_title')}
              </div>
              <p style={{ fontSize: 13, color: '#6B6E76', lineHeight: 1.6, margin: '0 0 20px' }}>
                {t('lic.success_desc')}
              </p>
              <button className="btn btn-primary" onClick={() => closePaymentModal()} style={{ padding: '12px 28px', fontSize: 14 }}>
                <Zap size={15} fill="white" /> {t('lic.start_using')}
              </button>
            </div>
          )}
        </div>

        {/* Footer kecil: lisensi berlaku lintas device & anti-hilang */}
        {step !== 'success' && (
          <div style={{
            borderTop: '1px solid #E5E1D2', padding: '12px 26px', fontSize: 11.5,
            color: '#8A8D94', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <ShieldCheck size={13} color="#1E9E5A" style={{ flexShrink: 0 }} />
            {t('lic.footer_note')}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════ SUB-COMPONENTS ═══════════════

function PollStatusPill({ status, t }) {
  const map = {
    pending: { color: '#B8860B', bg: '#FFF7E0', label: t('lic.st_pending'), spin: true },
    verifying: { color: '#B8860B', bg: '#FFF7E0', label: t('lic.st_verifying'), spin: true },
    verified: { color: '#1E9E5A', bg: '#E3F6EC', label: t('lic.st_verified') },
    failed: { color: '#C03434', bg: '#FDE7E7', label: t('lic.st_failed') },
    expired: { color: '#8A8D94', bg: '#F0EEE6', label: t('lic.st_expired_inv') },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: s.bg, color: s.color, border: `1.5px solid ${s.color}`,
      borderRadius: 999, padding: '4px 12px', fontSize: 11.5, fontWeight: 800,
    }}>
      {s.spin ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />}
      {s.label}
    </span>
  )
}

function QrisStep({ payment, countdown, t, simulated, onBack, onConfirm, onSimulate }) {
  const inst = payment.instructions || {}
  const qrImg = payment.qr_url || inst.static_qris_url
  const isDynamic = payment.gateway === 'midtrans'
  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* QR image */}
        <div className="card-flat" style={{
          padding: 12, textAlign: 'center', minWidth: 172, flexShrink: 0, margin: '0 auto',
        }}>
          {qrImg ? (
            <img
              src={qrImg} alt="QRIS" style={{ width: 148, height: 148, borderRadius: 8, display: 'block' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div style={{
              width: 148, height: 148, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '2px dashed rgba(51,54,63,0.25)', borderRadius: 10, color: '#8A8D94',
            }}>
              <QrCode size={34} />
              <div style={{ fontSize: 10.5, lineHeight: 1.4, padding: '0 8px' }}>{t('lic.qr_static_hint')}</div>
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <QRISMark size={26} />
            <BCALogo size={22} withWordmark={false} />
          </div>
        </div>

        {/* Instruksi */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
              <BCALogo size={22} withWordmark={false} /> {t('lic.qris_channel')}
            </div>
            <PollStatusPill status={payment.status} t={t} />
          </div>

          <div className="pay-amount-box">
            <div className="pay-amount-label">{t('lic.exact_amount')}</div>
            <div className="pay-amount-val">{payment.amount_display}</div>
            {payment.unique_suffix > 0 && (
              <div className="pay-amount-note">{t('lic.unique_note')}</div>
            )}
          </div>

          <ol className="pay-steps">
            {(inst.steps || []).map((s, i) => <li key={i}>{s}</li>)}
          </ol>

          {payment.reference && (
            <div className="pay-ref-row">
              <span>{t('lic.reference')}</span>
              <code>{payment.reference}</code>
            </div>
          )}

          {countdown !== null && payment.status !== 'verified' && (
            <div style={{ fontSize: 11.5, color: '#8A8D94', display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
              <Clock size={12} /> {t('lic.invoice_expires')} {formatRemaining(countdown)}
            </div>
          )}
        </div>
      </div>

      {/* Aksi */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ padding: '10px 16px', fontSize: 13 }}>
          <ArrowLeft size={14} /> {t('lic.back')}
        </button>
        {!isDynamic && payment.status === 'pending' && (
          <button className="btn btn-primary" onClick={onConfirm} style={{ padding: '10px 18px', fontSize: 13 }}>
            <BadgeCheck size={14} /> {t('lic.i_paid')}
          </button>
        )}
        {isDynamic && payment.status === 'pending' && (
          <div style={{ fontSize: 12, color: '#6B6E76', alignSelf: 'center', display: 'flex', gap: 7, alignItems: 'center' }}>
            <Loader2 size={13} className="animate-spin" color="#F2661A" />
            {t('lic.waiting_payment')}
          </div>
        )}
        {simulated && payment.status !== 'verified' && (
          <button className="btn btn-simulate" onClick={onSimulate} style={{ padding: '10px 18px', fontSize: 13 }}>
            <Zap size={14} fill="currentColor" /> {t('lic.simulate')}
          </button>
        )}
      </div>

      {payment.status === 'verifying' && (
        <div className="notice notice-info" style={{ marginTop: 14 }}>
          <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5 }}>{t('lic.verifying_note')}</span>
        </div>
      )}
    </>
  )
}

function PaypalStep({ payment, countdown, t, simulated, onBack, onConfirm, onSimulate }) {
  const inst = payment.instructions || {}
  const useApi = payment.gateway === 'paypal'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 14 }}>
          <PayPalLogo size={24} withWordmark={false} /> PayPal
        </div>
        <PollStatusPill status={payment.status} t={t} />
      </div>

      <div className="pay-amount-box">
        <div className="pay-amount-label">{t('lic.total')}</div>
        <div className="pay-amount-val">{inst.amount_display || payment.amount_display}</div>
      </div>

      <ol className="pay-steps">
        {(inst.steps || []).map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      {payment.reference && (
        <div className="pay-ref-row">
          <span>{t('lic.reference')}</span>
          <code>{payment.reference}</code>
        </div>
      )}

      {countdown !== null && payment.status !== 'verified' && (
        <div style={{ fontSize: 11.5, color: '#8A8D94', display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Clock size={12} /> {t('lic.invoice_expires')} {formatRemaining(countdown)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ padding: '10px 16px', fontSize: 13 }}>
          <ArrowLeft size={14} /> {t('lic.back')}
        </button>
        {useApi && payment.approve_url && (
          <button
            className="btn btn-paypal" onClick={() => window.open(payment.approve_url, '_blank')}
            style={{ padding: '10px 18px', fontSize: 13 }}
          >
            <ExternalLink size={14} /> {t('lic.pay_with_paypal')}
          </button>
        )}
        {!useApi && payment.status === 'pending' && (
          <>
            {payment.approve_url && (
              <button
                className="btn btn-paypal" onClick={() => window.open(payment.approve_url, '_blank')}
                style={{ padding: '10px 18px', fontSize: 13 }}
              >
                <ExternalLink size={14} /> {t('lic.open_paypal_me')}
              </button>
            )}
            <button className="btn btn-primary" onClick={onConfirm} style={{ padding: '10px 18px', fontSize: 13 }}>
              <BadgeCheck size={14} /> {t('lic.i_paid')}
            </button>
          </>
        )}
        {useApi && payment.status === 'pending' && (
          <div style={{ fontSize: 12, color: '#6B6E76', alignSelf: 'center', display: 'flex', gap: 7, alignItems: 'center' }}>
            <Loader2 size={13} className="animate-spin" color="#F2661A" />
            {t('lic.waiting_payment')}
          </div>
        )}
        {simulated && payment.status !== 'verified' && (
          <button className="btn btn-simulate" onClick={onSimulate} style={{ padding: '10px 18px', fontSize: 13 }}>
            <Zap size={14} fill="currentColor" /> {t('lic.simulate')}
          </button>
        )}
      </div>

      {payment.status === 'verifying' && (
        <div className="notice notice-info" style={{ marginTop: 14 }}>
          <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5 }}>{t('lic.verifying_note')}</span>
        </div>
      )}
    </>
  )
}

function CodeStep({
  payment, t, code, setCode, activating, onActivate, actInfo,
  resendMsg, resendCd, onResend, copied, onCopy,
}) {
  const shownCode = payment?.activation?.code
  const devCode = resendMsg?.dev_code

  // Auto-fill: begitu kode terungkap setelah pembayaran verified, isi input
  // otomatis — user tinggal klik "Aktivasi Sekarang".
  useEffect(() => {
    if (shownCode) setCode(shownCode)
  }, [shownCode])

  return (
    <>
      {/* Kode ditampilkan setelah pembayaran verified */}
      {shownCode && (
        <div className="code-reveal-box">
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1E9E5A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <BadgeCheck size={14} /> {t('lic.payment_verified')}
          </div>
          <div style={{
            textAlign: 'center', fontFamily: 'ui-monospace, "Courier New", monospace',
            fontSize: 24, fontWeight: 800, letterSpacing: '0.06em', color: '#33363F',
            background: '#F4F2EC', border: '2px solid #33363F', borderRadius: 12,
            padding: '12px 10px', marginBottom: 10,
          }}>
            {shownCode}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => onCopy(shownCode)} style={{ padding: '7px 14px', fontSize: 12 }}>
              {copied ? <><Check size={13} /> {t('lic.copied')}</> : <><Copy size={13} /> {t('lic.copy')}</>}
            </button>
            <span style={{ fontSize: 11.5, color: '#8A8D94' }}>{t('lic.code_emailed')}</span>
          </div>
        </div>
      )}

      {/* Input kode */}
      <div style={{ marginTop: shownCode ? 18 : 4 }}>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>
          {t('lic.code_label')}
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') onActivate() }}
          placeholder="ORD-XXXX-XXXX-XXXX"
          className="code-input"
          style={{ fontFamily: 'ui-monospace, "Courier New", monospace', letterSpacing: '0.08em' }}
          autoFocus
        />

        {/* Info kode milik akun (untuk yang lupa kode) */}
        {actInfo?.has_code && !shownCode && (
          <div style={{ fontSize: 12, color: '#6B6E76', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <KeyRound size={12} />
            {t('lic.your_code_info')} <code style={{ fontWeight: 700 }}>{actInfo.code_masked}</code>
            <span>· {actInfo.email}</span>
          </div>
        )}

        {/* Hasil resend */}
        {resendMsg && (
          <div className="notice notice-info" style={{ marginTop: 10 }}>
            <RefreshCw size={13} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12 }}>
              {resendMsg.sent
                ? t('lic.resent_ok')
                : t('lic.dev_code_note')}
              {devCode && <code style={{ fontWeight: 800, marginLeft: 6 }}>{devCode}</code>}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-primary" onClick={onActivate}
            disabled={activating || !code.trim()}
            style={{ padding: '11px 22px', fontSize: 13.5 }}
          >
            {activating ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
            {t('lic.activate_btn')}
          </button>
          {actInfo?.has_code && (
            <button
              className="btn-have-code" onClick={onResend} disabled={resendCd > 0}
              style={{ flexShrink: 0 }}
            >
              <RefreshCw size={13} /> {resendCd > 0 ? `${t('lic.resend_in')} ${resendCd}s` : t('lic.resend_code')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

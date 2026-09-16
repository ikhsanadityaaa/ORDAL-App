import { useEffect, useState } from 'react'
import { Clock, BadgeCheck, Sparkles } from 'lucide-react'
import useLicenseStore from '../../stores/licenseStore'
import useI18n from '../../stores/i18nStore'
import { formatRemaining } from './PaymentModal'

// ─────────────────────────────────────────────────────────────────────────────
// TrialBadge — pill status lisensi (sidebar + panel Cari Kerja):
//   - PRO (hijau)   : sudah aktivasi — akses penuh selamanya
//   - Trial XXj XXm (oranye, countdown live) : trial berjalan
//   - Belum mulai (abu) : trial dimulai saat klik "Cari Kerja" pertama
// ─────────────────────────────────────────────────────────────────────────────

export default function TrialBadge({ variant = 'sidebar', onClick }) {
  const { t } = useI18n()
  const status = useLicenseStore((s) => s.status)
  const openPaymentModal = useLicenseStore((s) => s.openPaymentModal)
  const [remaining, setRemaining] = useState(null)

  // Countdown live (tick tiap detik)
  useEffect(() => {
    const trial = status?.trial
    if (!trial || !trial.started || trial.status !== 'active') { setRemaining(null); return }
    const expiresAt = new Date(trial.expires_at).getTime()
    const tick = () => setRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [status?.trial?.started, status?.trial?.status, status?.trial?.expires_at])

  if (!status) return null

  const activated = status.activated
  const trial = status.trial || {}
  const expired = trial.status === 'expired' && !activated

  const handleClick = () => {
    if (onClick) onClick()
    else if (!activated) openPaymentModal('choose')
  }

  const small = variant === 'inline'

  // ── PRO ──
  if (activated) {
    return (
      <button
        onClick={handleClick}
        title={status.license?.method === 'admin' ? t('lic.pro_admin') : t('lic.pro')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#1E9E5A', color: '#FFFFFF',
          border: `2px solid ${small ? '#33363F' : 'rgba(244,242,236,0.4)'}`,
          borderRadius: 999, padding: small ? '3px 10px' : '5px 12px',
          fontSize: small ? 10.5 : 11, fontWeight: 800, letterSpacing: '0.02em',
          boxShadow: small ? '2px 2px 0 #33363F' : 'none', cursor: 'pointer',
        }}
      >
        <BadgeCheck size={small ? 11 : 12} /> ORDAL PRO
      </button>
    )
  }

  // ── Trial habis ──
  if (expired) {
    return (
      <button
        onClick={handleClick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#C03434', color: '#FFFFFF',
          border: `2px solid ${small ? '#33363F' : 'rgba(244,242,236,0.4)'}`,
          borderRadius: 999, padding: small ? '3px 10px' : '5px 12px',
          fontSize: small ? 10.5 : 11, fontWeight: 800,
          boxShadow: small ? '2px 2px 0 #33363F' : 'none', cursor: 'pointer',
        }}
      >
        <Clock size={small ? 11 : 12} /> {t('lic.badge_expired')}
      </button>
    )
  }

  // ── Trial berjalan ──
  if (trial.started && remaining !== null) {
    return (
      <button
        onClick={handleClick}
        title={t('lic.badge_trial_title')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#F2661A', color: '#FFFFFF',
          border: `2px solid ${small ? '#33363F' : 'rgba(244,242,236,0.4)'}`,
          borderRadius: 999, padding: small ? '3px 10px' : '5px 12px',
          fontSize: small ? 10.5 : 11, fontWeight: 800,
          boxShadow: small ? '2px 2px 0 #33363F' : 'none', cursor: 'pointer',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Clock size={small ? 11 : 12} /> {t('lic.badge_trial')} {formatRemaining(remaining)}
      </button>
    )
  }

  // ── Trial belum dimulai ──
  return (
    <button
      onClick={handleClick}
      title={t('lic.badge_not_started_title')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(244,242,236,0.14)', color: '#F4F2EC',
        border: '2px dashed rgba(244,242,236,0.45)',
        borderRadius: 999, padding: small ? '3px 10px' : '5px 12px',
        fontSize: small ? 10.5 : 11, fontWeight: 800, cursor: 'pointer',
      }}
    >
      <Sparkles size={small ? 11 : 12} /> {t('lic.badge_not_started')}
    </button>
  )
}

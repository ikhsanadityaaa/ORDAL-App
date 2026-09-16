import { useEffect } from 'react'
import { PartyPopper, X } from 'lucide-react'
import useLicenseStore from '../../stores/licenseStore'
import useI18n from '../../stores/i18nStore'
import { formatRemaining } from './PaymentModal'

// ─────────────────────────────────────────────────────────────────────────────
// TrialToast — toast "Trial 3 hari dimulai!" saat user klik "Cari Kerja"
// pertama kali. Auto-hilang setelah 6 detik.
// ─────────────────────────────────────────────────────────────────────────────

export default function TrialToast() {
  const { t } = useI18n()
  const toast = useLicenseStore((s) => s.trialStartedToast)
  const clearTrialToast = useLicenseStore((s) => s.clearTrialToast)

  useEffect(() => {
    if (!toast) return
    const tm = setTimeout(() => clearTrialToast(), 6000)
    return () => clearTimeout(tm)
  }, [toast])

  if (!toast) return null

  return (
    <div className="trial-toast" role="status">
      <div className="tt-icon"><PartyPopper size={16} color="#fff" /></div>
      <div style={{ lineHeight: 1.45 }}>
        {t('lic.toast_started')}
        {toast.remaining_seconds != null && (
          <span style={{ color: '#F2661A', fontWeight: 800 }}>
            {' '}{formatRemaining(toast.remaining_seconds)}
          </span>
        )}
        <div style={{ fontSize: 10.5, color: 'rgba(244,242,236,0.6)', fontWeight: 600 }}>
          {t('lic.toast_started_sub')}
        </div>
      </div>
      <button
        onClick={clearTrialToast}
        style={{ background: 'none', border: 'none', color: 'rgba(244,242,236,0.55)', cursor: 'pointer', padding: 4 }}
        aria-label="Tutup"
      >
        <X size={14} />
      </button>
    </div>
  )
}

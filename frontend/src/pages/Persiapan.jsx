import { useEffect, useState } from 'react'
import { FileText, Briefcase, Send, Calendar, AlertCircle, Loader } from 'lucide-react'
import CVManager from './CVManager'
import Settings from './Settings'
import {
  SecretCard,
  TelegramLinkCard,
  AutoApplyScheduleCard,
} from './AppConfig'
import api from '../api'
import useI18n from '../stores/i18nStore'

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'cv',        label: 'CV',        icon: FileText,   desc: 'Upload & kelola CV PDF' },
  { id: 'apply',     label: 'Apply',     icon: Briefcase,  desc: 'Login LinkedIn/JobStreet & Email SMTP' },
  { id: 'telegram',  label: 'Telegram',  icon: Send,       desc: 'Bot token & link akun' },
  { id: 'jadwal',    label: 'Jadwal',    icon: Calendar,   desc: 'Auto-apply schedule' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Hook: load secrets + prefs (shared across tabs)
// ─────────────────────────────────────────────────────────────────────────────
function useConfig() {
  const [secrets, setSecrets] = useState([])
  const [prefs, setPrefs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = async (retryCount = 0) => {
    setLoading(true); setError(null)
    try {
      // Pakai allSettled supaya kalau salah satu gagal, yang lain tetap load
      const results = await Promise.allSettled([
        api.get('/app_config'),
        api.get('/preferences'),
      ])

      const secResult = results[0]
      const prefResult = results[1]

      // Handle app_config result
      if (secResult.status === 'fulfilled') {
        const filtered = (secResult.value.data.secrets || []).filter(s => s.key !== 'GEMINI_API_KEY')
        setSecrets(filtered)
      } else {
        // app_config gagal — gunakan fallback
        setSecrets([{
          key: 'TELEGRAM_BOT_TOKEN',
          label: 'Telegram Bot Token',
          description: 'Untuk kontrol via Telegram & notifikasi auto-apply. Dapat dari @BotFather.',
          link: 'https://t.me/BotFather',
          configured: false,
          masked: '',
          test_endpoint: '/api/app_config/test/telegram',
        }])
      }

      // Handle preferences result
      if (prefResult.status === 'fulfilled') {
        setPrefs(prefResult.value.data || {})
      } else {
        setPrefs({})
      }

      // Kalau keduanya gagal, set error
      if (secResult.status === 'rejected' && prefResult.status === 'rejected') {
        const e = secResult.reason
        const status = e.response?.status
        const is404 = status === 404
        const isNetwork = !status || e.message?.includes('Network Error')
        if (retryCount < 3 && (is404 || isNetwork)) {
          setTimeout(() => refresh(retryCount + 1), 1000)
          return
        }
        setError(e.message || `HTTP ${status || '?'}`)
      }
    } catch (e) {
      setError(e.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])
  return { secrets, prefs, loading, error, refresh }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content components
// ─────────────────────────────────────────────────────────────────────────────
function TabCV() {
  return <CVManager embedded />
}

function TabApply() {
  return <Settings embedded />
}

function TabTelegram({ secrets, onSaved }) {
  const { t } = useI18n()
  const telegramSecret = secrets.find(secret => secret.key === 'TELEGRAM_BOT_TOKEN')
  return (
    <div className="grid-cards">
      {telegramSecret && <SecretCard secret={telegramSecret} onSaved={onSaved} />}
      <TelegramLinkCard telegramConfigured={Boolean(telegramSecret?.configured)} onSaved={onSaved} />
    </div>
  )
}

function TabJadwal({ prefs, onSaved }) {
  return (
    <div className="grid-cards">
      <AutoApplyScheduleCard prefs={prefs} onSaved={onSaved} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function Persiapan() {
  const [activeTab, setActiveTab] = useState('cv')
  const { secrets, prefs, loading, error, refresh } = useConfig()
  const { t, lang } = useI18n()

  // Tab labels translated at render time (TABS is constant, but label depends on lang)
  const TABS_LOCAL = [
    { id: 'cv',        label: t('page.persiapan.tab_cv'),       icon: FileText,   desc: t('persiapan.tab.cv.desc') },
    { id: 'apply',     label: t('page.persiapan.tab_apply'),    icon: Briefcase,  desc: t('persiapan.tab.apply.desc') },
    { id: 'telegram',  label: t('page.persiapan.tab_telegram'), icon: Send,       desc: t('persiapan.tab.telegram.desc') },
    { id: 'jadwal',    label: t('page.persiapan.tab_jadwal'),   icon: Calendar,   desc: t('persiapan.tab.jadwal.desc') },
  ]

  return (
    <div className="main-scroll">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>{t('page.persiapan.title')}</h1>
        <p>{lang === 'id'
          ? 'Siapkan CV, login platform, bot Telegram, dan jadwal auto-apply sebelum ORDAL jalan.'
          : 'Prepare CV, platform login, Telegram bot, and auto-apply schedule before running ORDAL.'}</p>
      </div>

      {/* Inline error (tidak block UI) */}
      {error && (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            {lang === 'id' ? `Gagal memuat konfigurasi: ${error}. Pastikan backend sudah jalan.` : `Failed to load configuration: ${error}. Make sure the backend is running.`}
            <button onClick={() => refresh()} className="btn btn-secondary" style={{ marginLeft: 10, padding: '4px 10px' }}>
              {lang === 'id' ? 'Coba lagi' : 'Retry'}
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{ marginBottom: 16, padding: 10, background: 'var(--gray-50)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--gray-500)' }}>
          <Loader size={14} className="animate-spin" />
          Memuat konfigurasi...
        </div>
      )}

      {/* Tab navigation */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--gray-200)',
        marginBottom: 24,
        overflowX: 'auto',
      }}>
        {TABS_LOCAL.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--orange)' : 'var(--gray-500)',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--orange)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--gray-700)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--gray-500)'
              }}
            >
              <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: '100%' }}>
        {activeTab === 'cv' && <TabCV />}
        {activeTab === 'apply' && <TabApply />}
        {activeTab === 'telegram' && <TabTelegram secrets={secrets} onSaved={refresh} />}
        {activeTab === 'jadwal' && <TabJadwal prefs={prefs} onSaved={refresh} />}
      </div>
    </div>
  )
}

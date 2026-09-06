import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  ClipboardList, HelpCircle, Settings, Zap, Cpu,
  FileText, Languages,
} from 'lucide-react'
import useI18n from '../stores/i18nStore'
import api from '../api'

// Logo URL — Vite serves /public/* at root, so just reference by absolute path
const LOGO_URL = '/ordal-icon.png'

// App mode (single-user, tanpa JWT, tanpa logout)
const APP_MODE = import.meta.env.VITE_APP_MODE === '1'

// App version from package.json
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.1'

// Nav items — label via i18n keys (di-translate di render time)
const navItems = [
  { to: '/kerja',                  icon: Zap,           labelKey: 'nav.cari_kerja' },
  { to: '/ai',                     icon: Cpu,           labelKey: 'nav.ai' },
  { to: '/riwayat-lamaran',        icon: ClipboardList, labelKey: 'nav.riwayat_lamaran' },
  { to: '/kumpulan-pertanyaan',    icon: HelpCircle,    labelKey: 'nav.kumpulan_pertanyaan' },
  { to: '/persiapan',              icon: Settings,      labelKey: 'nav.persiapan' },
]

// Custom lightning bolt SVG — perfectly centered (Lucide Zap agak ke kanan)
function LightningBolt({ size = 22, color = 'white' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Lightning bolt — centered polygon. Highest point at x=12 (center). */}
      <path d="M 12 2 L 5 13 L 11 13 L 10 22 L 19 9 L 13 9 L 14 2 Z" />
    </svg>
  )
}

function Logo() {
  // Use the new uploaded logo PNG (rounded corners baked in).
  // Sized to 40px to match sidebar width; aspect ratio preserved.
  return (
    <img
      src={LOGO_URL}
      alt="ORDAL logo"
      width={40}
      height={40}
      style={{
        width: 40,
        height: 40,
        borderRadius: 9,
        objectFit: 'cover',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
        flexShrink: 0,
        display: 'block',
      }}
    />
  )
}

export default function Layout() {
  const { t, lang, toggleLang } = useI18n()

  // Sync window title with current language
  useEffect(() => {
    document.title = t('app.title')
  }, [lang, t])

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--cream)',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        background: 'var(--black)',
        color: 'var(--gray-400)',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--black-3)',
      }}>
        {/* Brand */}
        <div style={{
          padding: '20px 18px',
          borderBottom: '1px solid var(--black-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Logo />
          <div style={{ minWidth: 0 }}>
            <div className="font-display" style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'white',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>ORDAL</div>
            <div style={{
              fontSize: 11,
              color: 'var(--gray-500)',
              marginTop: 5,
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}>{lang === 'id' ? 'Auto-Apply Kerja' : 'Job Auto-Apply'}</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ to, icon: Icon, labelKey }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'white' : 'var(--gray-400)',
                  background: isActive ? 'var(--orange)' : 'transparent',
                  boxShadow: isActive ? '0 4px 14px rgba(255, 107, 26, 0.32)' : 'none',
                  transition: 'all 0.12s ease',
                }}>
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{t(labelKey)}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer bottom: Language switcher + Cek Log button + version */}
        <div style={{
          padding: '10px 10px',
          borderTop: '1px solid var(--black-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {/* Language switcher — toggle ID/EN */}
          <button
            onClick={toggleLang}
            title={t('lang.toggle_to_en')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--gray-300)',
              background: 'transparent',
              border: '1px solid var(--black-3)',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--black-3)'
              e.currentTarget.style.color = 'white'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--gray-300)'
            }}
          >
            <Languages size={16} strokeWidth={2} />
            <span style={{ flex: 1, textAlign: 'left' }}>{t('lang.label')}</span>
            {/* Toggle pill: ID | EN */}
            <span style={{
              display: 'inline-flex',
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid var(--gray-500)',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              <span style={{
                padding: '2px 6px',
                background: lang === 'id' ? 'var(--orange)' : 'transparent',
                color: lang === 'id' ? 'white' : 'var(--gray-500)',
              }}>ID</span>
              <span style={{
                padding: '2px 6px',
                background: lang === 'en' ? 'var(--orange)' : 'transparent',
                color: lang === 'en' ? 'white' : 'var(--gray-500)',
              }}>EN</span>
            </span>
          </button>

          {/* Cek Log — buka file log backend di Finder/Explorer */}
          <CekLogButton t={t} />

          {/* Version info */}
          <div style={{ paddingTop: 6, paddingBottom: 4, paddingLeft: 4 }}>
            {APP_MODE ? (
              <>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--gray-500)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}>{t('sidebar.mode')}</div>
                <div style={{ color: 'var(--gray-300)', fontWeight: 500, fontSize: 12 }}>
                  {t('sidebar.local_app')}
                </div>
                <div style={{ color: 'var(--gray-500)', fontSize: 10, marginTop: 2 }}>
                  {t('sidebar.single_user')}
                </div>
                <div style={{
                  color: 'var(--orange)',
                  fontSize: 11,
                  fontWeight: 700,
                  marginTop: 6,
                  fontFamily: 'var(--font-mono)',
                }}>
                  v{APP_VERSION}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--gray-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                v{APP_VERSION}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        background: 'var(--cream)',
      }}>
        <Outlet />
      </main>
    </div>
  )
}

// ── Cek Log Button ─────────────────────────────────────────────────────────
// Tombol di sidebar bawah yang langsung buka folder log di Finder/Explorer
// native. Lebih cepat daripada harus ke halaman Settings → buka card Log →
// klik "Buka Folder".
function CekLogButton({ t }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleClick = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post('/debug/log/open')
      if (res.data.ok) {
        setMsg({ type: 'success' })
      } else {
        setMsg({ type: 'error', text: res.data.error || t('settings.log.gagal_buka') })
      }
    } catch (err) {
      setMsg({
        type: 'error',
        text: err.response?.data?.detail || t('settings.log.gagal_buka_folder'),
      })
    } finally {
      setLoading(false)
      // Clear msg setelah 2 detik
      setTimeout(() => setMsg(null), 2000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={msg?.text || t('settings.log.buka_finder')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 500,
        color: msg?.type === 'success' ? '#27ae60' : (msg?.type === 'error' ? '#e74c3c' : 'var(--gray-300)'),
        background: msg?.type === 'success' ? 'rgba(39, 174, 96, 0.1)' : (msg?.type === 'error' ? 'rgba(231, 76, 60, 0.1)' : 'transparent'),
        border: '1px solid var(--black-3)',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.12s ease',
        width: '100%',
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading && !msg) {
          e.currentTarget.style.background = 'var(--black-3)'
          e.currentTarget.style.color = 'white'
        }
      }}
      onMouseLeave={(e) => {
        if (!loading && !msg) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--gray-300)'
        }
      }}
    >
      <FileText size={16} strokeWidth={2} />
      <span style={{ flex: 1, textAlign: 'left' }}>{t('sidebar.cek_log')}</span>
      {loading && <span style={{ fontSize: 10, color: 'var(--gray-500)' }}>...</span>}
      {msg?.type === 'success' && <span style={{ fontSize: 14 }}>✓</span>}
      {msg?.type === 'error' && <span style={{ fontSize: 14 }}>✗</span>}
    </button>
  )
}

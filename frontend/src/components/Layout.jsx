import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  ClipboardList, HelpCircle, Settings, Zap, Cpu,
  FileText, Languages, LogOut, MonitorSmartphone, ChevronUp,
} from 'lucide-react'
import useI18n from '../stores/i18nStore'
import useAuthStore from '../stores/authStore'
import useLicenseStore from '../stores/licenseStore'
import api from '../api'
import DeviceManagerModal from './DeviceManagerModal'
import TrialBadge from './license/TrialBadge'

// App version from package.json
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '3.0.0'

// Nav items — label via i18n keys
const navItems = [
  { to: '/kerja',                  icon: Zap,           labelKey: 'nav.cari_kerja' },
  { to: '/ai',                     icon: Cpu,           labelKey: 'nav.ai' },
  { to: '/riwayat-lamaran',        icon: ClipboardList, labelKey: 'nav.riwayat_lamaran' },
  { to: '/kumpulan-pertanyaan',    icon: HelpCircle,    labelKey: 'nav.kumpulan_pertanyaan' },
  { to: '/persiapan',              icon: Settings,      labelKey: 'nav.persiapan' },
]

// Logo ORDAL — kotak oranye + "O" putih + wordmark (sama dengan web)
function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div
        style={{
          width: 38, height: 38, background: '#F2661A',
          border: '2px solid rgba(244,242,236,0.35)',
          borderRadius: 10,
          boxShadow: '2.5px 2.5px 0 rgba(244,242,236,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.04em',
          flexShrink: 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(-8deg) scale(1.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'rotate(0deg) scale(1)' }}
      >
        O
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 22, fontWeight: 800, color: '#F4F2EC',
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>ORDAL</div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { t, lang, toggleLang } = useI18n()
  const { user, logout } = useAuthStore()
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Sync window title with current language
  useEffect(() => {
    document.title = t('app.title')
  }, [lang, t])

  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--cream)' }}>
      {/* Sidebar — charcoal (sidebar token web) */}
      <aside style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        background: '#33363F',
        color: 'rgba(244,242,236,0.55)',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '2px solid #454853',
      }}>
        {/* Brand */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '2px solid #454853' }}>
          <Logo />
          <div style={{ marginTop: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(244,242,236,0.35)' }}>
            {lang === 'id' ? 'Auto-Apply Kerja' : 'Job Auto-Apply'}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {navItems.map(({ to, icon: Icon, labelKey }) => (
            <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 13px',
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? '#FFFFFF' : 'rgba(244,242,236,0.55)',
                  background: isActive ? '#F2661A' : 'transparent',
                  border: isActive ? '2px solid #2A2D34' : '2px solid transparent',
                  boxShadow: isActive ? '3px 3px 0 rgba(0,0,0,0.35)' : 'none',
                  transition: 'all 0.16s cubic-bezier(0.34,1.56,0.64,1)',
                }}>
                  <Icon size={16} strokeWidth={isActive ? 2.6 : 2} style={{ flexShrink: 0 }} />
                  <span>{t(labelKey)}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer: user card + bahasa + cek log */}
        <div style={{
          padding: '10px 12px 12px',
          borderTop: '2px solid #454853',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* v3.1: badge status lisensi (PRO / countdown trial / trial habis) */}
          <TrialBadge variant="sidebar" />

          {/* User card + menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 11px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(244,242,236,0.06)',
                border: '2px solid rgba(244,242,236,0.14)',
                color: '#F4F2EC', textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#F2661A', border: '2px solid rgba(244,242,236,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0,
              }}>{initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 700, color: '#F4F2EC',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{user?.name || '-'}</div>
                <div style={{
                  fontSize: 10.5, color: 'rgba(244,242,236,0.45)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{user?.email || ''}</div>
              </div>
              <ChevronUp size={14} color="rgba(244,242,236,0.5)" style={{
                transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0,
              }} />
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
                background: '#F4F2EC', border: '2px solid #33363F', borderRadius: 12,
                boxShadow: '4px 4px 0 rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 50,
              }}>
                <button
                  onClick={() => { setUserMenuOpen(false); setDeviceOpen(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '10px 13px', background: 'none', border: 'none',
                    color: '#33363F', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF0E7')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <MonitorSmartphone size={15} color="#F2661A" />
                  <span style={{ flex: 1, textAlign: 'left' }}>{t('sidebar.devices')}</span>
                  <span className="badge badge-dark" style={{ fontSize: 9.5, padding: '1px 7px' }}>MAX 2</span>
                </button>
                <LicenseMenuItem onCloseMenu={() => setUserMenuOpen(false)} />
                <div style={{ height: 2, background: '#DDD9CC' }} />
                <button
                  onClick={() => { setUserMenuOpen(false); logout() }}
                  title={t('sidebar.logout_hint')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '10px 13px', background: 'none', border: 'none',
                    color: '#E5484D', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#FDEDEE')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <LogOut size={15} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{t('sidebar.logout')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Language switcher — toggle ID/EN */}
          <button
            onClick={toggleLang}
            title={t('lang.toggle_to_en')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 600,
              color: 'rgba(244,242,236,0.7)',
              background: 'transparent',
              border: '2px solid rgba(244,242,236,0.16)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(244,242,236,0.1)'
              e.currentTarget.style.color = '#F4F2EC'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'rgba(244,242,236,0.7)'
            }}
          >
            <Languages size={15} strokeWidth={2} />
            <span style={{ flex: 1, textAlign: 'left' }}>{t('lang.label')}</span>
            <span style={{
              display: 'inline-flex',
              borderRadius: 999,
              overflow: 'hidden',
              border: '1.5px solid rgba(244,242,236,0.35)',
              fontSize: 9.5,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
            }}>
              <span style={{
                padding: '2px 7px',
                background: lang === 'id' ? '#F2661A' : 'transparent',
                color: lang === 'id' ? '#fff' : 'rgba(244,242,236,0.5)',
              }}>ID</span>
              <span style={{
                padding: '2px 7px',
                background: lang === 'en' ? '#F2661A' : 'transparent',
                color: lang === 'en' ? '#fff' : 'rgba(244,242,236,0.5)',
              }}>EN</span>
            </span>
          </button>

          {/* Cek Log */}
          <CekLogButton t={t} />

          {/* Version */}
          <div style={{ paddingLeft: 4, paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#F2661A', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              v{APP_VERSION}
            </span>
            <span style={{ color: 'rgba(244,242,236,0.3)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}>
              {t('sidebar.multi_account')}
            </span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--cream)' }}>
        <Outlet />
      </main>

      {/* Dashboard device */}
      <DeviceManagerModal open={deviceOpen} onClose={() => setDeviceOpen(false)} />
    </div>
  )
}

// ── Cek Log Button ─────────────────────────────────────────────────────────
function CekLogButton({ t }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleClick = async () => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.post('/debug/log/open')
      setMsg({ type: res.data?.ok ? 'success' : 'error' })
    } catch (err) {
      setMsg({ type: 'error' })
    } finally {
      setLoading(false)
      setTimeout(() => setMsg(null), 2000)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={t('settings.log.buka_finder')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 600,
        color: msg?.type === 'success' ? '#5CC98A' : (msg?.type === 'error' ? '#FF8A8A' : 'rgba(244,242,236,0.7)'),
        background: 'transparent',
        border: '2px solid rgba(244,242,236,0.16)',
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.15s ease',
        width: '100%',
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading && !msg) {
          e.currentTarget.style.background = 'rgba(244,242,236,0.1)'
          e.currentTarget.style.color = '#F4F2EC'
        }
      }}
      onMouseLeave={(e) => {
        if (!loading && !msg) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(244,242,236,0.7)'
        }
      }}
    >
      <FileText size={15} strokeWidth={2} />
      <span style={{ flex: 1, textAlign: 'left' }}>{t('sidebar.cek_log')}</span>
      {loading && <span style={{ fontSize: 10, color: 'rgba(244,242,236,0.4)' }}>...</span>}
      {msg?.type === 'success' && <span style={{ fontSize: 13, color: '#5CC98A' }}>✓</span>}
      {msg?.type === 'error' && <span style={{ fontSize: 13, color: '#FF8A8A' }}>✗</span>}
    </button>
  )
}

// v3.1 — Menu item lisensi di dropdown user:
// - Belum aktivasi → "Upgrade ke PRO" (buka pop-up pembayaran)
// - Sudah aktivasi → tidak tampil
function LicenseMenuItem({ onCloseMenu }) {
  const { t } = useI18n()
  const status = useLicenseStore((s) => s.status)
  const openPaymentModal = useLicenseStore((s) => s.openPaymentModal)
  if (!status || status.activated) return null
  return (
    <button
      onClick={() => { onCloseMenu(); openPaymentModal('choose') }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '10px 13px', background: 'none', border: 'none',
        color: '#33363F', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#FEF0E7')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      <Zap size={15} color="#F2661A" fill="#F2661A" />
      <span style={{ flex: 1, textAlign: 'left' }}>{t('sidebar.upgrade_pro')}</span>
      <span className="badge" style={{ fontSize: 9.5, padding: '1px 7px', background: '#F2661A', color: '#fff', border: '1.5px solid #33363F' }}>PRO</span>
    </button>
  )
}

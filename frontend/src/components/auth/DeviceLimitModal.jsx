import { useState } from 'react'
import { MonitorSmartphone, Trash2, Loader2, LogIn, Smartphone, Laptop, Monitor, CheckCircle2 } from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useI18n from '../../stores/i18nStore'
import api from '../../api'

// ─────────────────────────────────────────────────────────────────────────────
// DeviceLimitModal — batas 2 device tercapai (konsep WhatsApp).
// User harus keluarkan salah satu device lain untuk melanjutkan login.
// Setelah mengeluarkan → otomatis coba login ulang.
// ─────────────────────────────────────────────────────────────────────────────

function DeviceIcon({ os }) {
  const o = (os || '').toLowerCase()
  if (o.includes('mac') || o.includes('darwin')) return <Laptop size={18} />
  if (o.includes('window')) return <Monitor size={18} />
  return <Smartphone size={18} />
}

export function DeviceRow({ device, t, onRemove, removing }) {
  const last = device.last_login_at ? new Date(device.last_login_at) : null
  const lastLabel = last
    ? last.toLocaleDateString() + ' ' + last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '-'
  return (
    <div className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: device.is_current ? '#FEF0E7' : '#FFFFFF' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: device.is_current ? '#F2661A' : '#F4F2EC',
        border: '2px solid #33363F', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: device.is_current ? '#fff' : '#33363F', flexShrink: 0,
      }}>
        <DeviceIcon os={device.os} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#33363F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.device_name || 'Device'}
          </span>
          {device.is_current && <span className="badge badge-orange">{t('device.this_device')}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#6B6E76', marginTop: 2 }}>
          {t('device.last_login')}: {lastLabel}
        </div>
      </div>
      {!device.is_current && (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => onRemove(device)}
          disabled={removing}
          title={t('device.remove')}
        >
          {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {t('device.remove_btn')}
        </button>
      )}
    </div>
  )
}

export default function DeviceLimitModal() {
  const { t } = useI18n()
  const { deviceLimitInfo, clearDeviceLimit, login, pendingCreds } = useAuthStore()
  const [devices, setDevices] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)

  const list = devices || deviceLimitInfo?.devices || []

  const removeDevice = async (device) => {
    setRemovingId(device.device_id)
    setError('')
    try {
      const res = await api.post('/auth/devices/limit-remove', {
        email: pendingCreds?.email || deviceLimitInfo?.email,
        password: pendingCreds?.password || '',
        device_id: device.device_id,
      })
      setDevices(res.data.devices)
    } catch (err) {
      const msg = err.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('device.remove_failed'))
    } finally {
      setRemovingId(null)
    }
  }

  const retryLogin = async () => {
    setRetrying(true)
    setError('')
    try {
      await login(pendingCreds.email, pendingCreds.password)
      // sukses → store set token & tutup semua modal
    } catch (err) {
      const msg = err.response?.data?.detail
      if (typeof msg === 'object' && msg?.code === 'DEVICE_LIMIT') {
        setDevices(msg.devices)
        setError(t('device.still_full'))
      } else {
        setError(typeof msg === 'string' ? msg : t('auth.err_generic'))
      }
    } finally {
      setRetrying(false)
    }
  }

  if (!deviceLimitInfo) return null

  const remaining = list.length < 2

  return (
    <div className="sticker-overlay">
      <div className="sticker-modal wide" role="dialog" aria-modal="true">
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 38, height: 38, background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
            }}>
              <MonitorSmartphone size={19} strokeWidth={2.2} />
            </div>
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>ORDAL</div>
          </div>
          <h2>{t('device.limit_title')}</h2>
          <p>{deviceLimitInfo?.message || t('device.limit_msg')}</p>
        </div>

        <div className="sticker-modal-body">
          <div className="notice notice-info" style={{ marginBottom: 16 }}>
            <MonitorSmartphone size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5 }}>{t('device.limit_explain')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((d) => (
              <DeviceRow key={d.device_id} device={d} t={t} onRemove={removeDevice} removing={removingId === d.device_id} />
            ))}
          </div>

          {error && (
            <div className="notice notice-error" style={{ marginTop: 14 }}>
              <span style={{ fontSize: 13 }}>{error}</span>
            </div>
          )}

          {remaining && (
            <div className="notice notice-success" style={{ marginTop: 14 }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13 }}>{t('device.slot_available')}</span>
            </div>
          )}
        </div>

        <div className="sticker-modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => { clearDeviceLimit(); useAuthStore.setState({ showAuthModal: true }) }}
          >
            <LogIn size={15} /> {t('device.back_login')}
          </button>
          {remaining && pendingCreds && (
            <button className="btn btn-primary" onClick={retryLogin} disabled={retrying}>
              {retrying ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              {t('device.retry_login')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { MonitorSmartphone, Loader2, LogOut } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useI18n from '../stores/i18nStore'
import api from '../api'
import { DeviceRow } from './auth/DeviceLimitModal'

// ─────────────────────────────────────────────────────────────────────────────
// DeviceManagerModal — dashboard device (dari menu user di sidebar).
// Menampilkan daftar device aktif (max 2) + tombol keluarkan.
// ─────────────────────────────────────────────────────────────────────────────

export default function DeviceManagerModal({ open, onClose }) {
  const { t } = useI18n()
  const { setDevices, logout } = useAuthStore()
  const [devices, setLocalDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/auth/devices')
      .then((res) => {
        setLocalDevices(res.data.devices || [])
        setDevices(res.data.devices || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const remove = async (device) => {
    setRemovingId(device.device_id)
    try {
      const res = await api.delete(`/auth/devices/${device.device_id}`)
      setLocalDevices(res.data.devices || [])
      setDevices(res.data.devices || [])
      if (device.is_current) {
        // mengeluarkan device sendiri → logout
        onClose()
        logout()
      }
    } catch (e) { /* ignore */ } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="sticker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sticker-modal wide" role="dialog" aria-modal="true">
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 36, height: 36, background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <MonitorSmartphone size={18} strokeWidth={2.2} />
            </div>
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>ORDAL</div>
          </div>
          <h2>{t('device.manager_title')}</h2>
          <p>{t('device.manager_sub')}</p>
        </div>

        <div className="sticker-modal-body">
          <div className="notice notice-info" style={{ marginBottom: 16 }}>
            <MonitorSmartphone size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5 }}>{t('device.limit_explain')}</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Loader2 size={28} className="animate-spin" color="#F2661A" style={{ margin: '0 auto 10px' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {devices.map((d) => (
                <DeviceRow key={d.device_id} device={d} t={t} onRemove={remove} removing={removingId === d.device_id} />
              ))}
              {devices.length < 2 && (
                <div className="card-flat" style={{
                  padding: '12px 14px', borderStyle: 'dashed',
                  borderColor: 'rgba(51,54,63,0.3)', background: 'rgba(255,255,255,0.5)',
                  textAlign: 'center', fontSize: 12.5, color: '#6B6E76',
                }}>
                  + {t('device.slot_free')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticker-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => { onClose(); logout() }}
            title={t('sidebar.logout_hint')}
          >
            <LogOut size={15} /> {t('sidebar.logout')}
          </button>
        </div>
      </div>
    </div>
  )
}

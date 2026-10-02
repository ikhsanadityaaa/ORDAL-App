import { useEffect, useState } from 'react'
import { CheckCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import useI18n from '../stores/i18nStore'

export default function Notifications() {
  const { lang } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], unread: 0 })
  const id = lang === 'id'
  const load = () => api.get('/notifications').then((res) => setData(res.data))
  useEffect(() => { load() }, [])

  const read = async (item) => {
    if (!item.read_at) await api.post(`/notifications/${item.id}/read`)
    if (item.action_url) navigate(item.action_url)
    else load()
  }
  const dismiss = async (event, itemId) => {
    event.stopPropagation()
    await api.delete(`/notifications/${itemId}`)
    load()
  }

  return (
    <div style={{ padding: '34px clamp(24px, 5vw, 70px)', maxWidth: 940, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        <div><p className="font-pixel" style={{ fontSize: 9, color: 'var(--orange)', marginBottom: 8 }}>NOTIFICATION CENTER</p><h1 style={{ fontSize: 30, fontWeight: 900 }}>{id ? 'Notifikasi' : 'Notifications'}</h1></div>
        {data.unread > 0 && <button className="btn btn-secondary" onClick={async () => { await api.post('/notifications/read-all'); load() }}><CheckCheck size={16} />{id ? 'Tandai dibaca' : 'Mark all read'}</button>}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {data.items.length === 0 && <div className="card-pixel" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>{id ? 'Belum ada notifikasi.' : 'No notifications yet.'}</div>}
        {data.items.map((item) => (
          <button key={item.id} onClick={() => read(item)} className="card-pixel" style={{ padding: 16, textAlign: 'left', cursor: 'pointer', background: item.read_at ? '#fff' : '#FEF0E7', display: 'flex', gap: 12, width: '100%' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 6, flexShrink: 0, background: item.read_at ? '#CCC7B8' : 'var(--orange)' }} />
            <span style={{ flex: 1 }}><strong>{item.title}</strong><span style={{ display: 'block', color: 'var(--muted)', marginTop: 4 }}>{item.message}</span><small style={{ display: 'block', marginTop: 7, color: '#8A877E' }}>{new Date(item.created_at).toLocaleString()}</small></span>
            <span onClick={(event) => dismiss(event, item.id)} style={{ padding: 5 }}><X size={16} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

const MODES = [
  ['find_only', 'Cari saja', 'Find only'],
  ['review_queue', 'Tinjau sebelum melamar', 'Review before applying'],
  ['auto_apply', 'Lamar otomatis', 'Auto apply'],
]
const PLATFORMS = [
  ['linkedin', 'LinkedIn Jobs'], ['linkedin_posts', 'LinkedIn Post'],
  ['jobstreet', 'JobStreet'], ['glints', 'Glints'], ['indeed', 'Indeed'],
]

export default function ApplicationQueue() {
  const { lang } = useI18n()
  const [items, setItems] = useState([])
  const [mode, setMode] = useState('auto_apply')
  const [loading, setLoading] = useState(true)
  const [scheduling, setScheduling] = useState({ search_strategy: 'round_robin', platform_priority: PLATFORMS.map(([value]) => value), sound_enabled: true })
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const id = lang === 'id'

  const load = async () => {
    setLoading(true)
    try {
      const [queue, currentMode, currentScheduling] = await Promise.all([
        api.get('/application_queue'),
        api.get('/application_queue/mode/current'),
        api.get('/application_queue/settings/current'),
      ])
      setItems(queue.data)
      setAnswers(Object.fromEntries(queue.data.map((item) => [item.id, item.answer_data || {}])))
      setMode(currentMode.data.mode)
      setScheduling({
        search_strategy: currentScheduling.data.search_strategy || 'round_robin',
        platform_priority: currentScheduling.data.platform_priority?.length ? currentScheduling.data.platform_priority : PLATFORMS.map(([value]) => value),
        sound_enabled: currentScheduling.data.sound_enabled !== false,
      })
    } finally {
      setLoading(false)
    }
  }

  const saveScheduling = async (next) => {
    setScheduling(next)
    await api.put('/application_queue/settings/current', next)
  }

  const movePlatform = (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= scheduling.platform_priority.length) return
    const priority = [...scheduling.platform_priority]
    ;[priority[index], priority[nextIndex]] = [priority[nextIndex], priority[index]]
    saveScheduling({ ...scheduling, platform_priority: priority })
  }

  useEffect(() => { load() }, [])

  const changeMode = async (next) => {
    setMode(next)
    await api.put('/application_queue/mode/current', { mode: next })
  }

  const action = async (itemId, kind) => {
    setError('')
    try {
      if (kind === 'approve') {
        const item = items.find((entry) => entry.id === itemId)
        if (item?.missing_fields?.length) await api.put(`/application_queue/${itemId}/answers`, { answers: answers[itemId] || {} })
        await api.post(`/application_queue/${itemId}/approve`)
      } else await api.delete(`/application_queue/${itemId}`)
      await load()
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      setError(detail?.message || (typeof detail === 'string' ? detail : (id ? 'Tindakan gagal.' : 'Action failed.')))
    }
  }

  return (
    <div style={{ padding: '34px clamp(24px, 5vw, 70px)', maxWidth: 1160, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 22 }}>
        <div>
          <p className="font-pixel" style={{ fontSize: 9, color: 'var(--orange)', marginBottom: 8 }}>APPLICATION QUEUE</p>
          <h1 style={{ fontSize: 30, fontWeight: 900 }}>{id ? 'Antrean Lamaran' : 'Application Queue'}</h1>
          <p style={{ color: 'var(--muted)', marginTop: 6 }}>{id ? 'Cek kecocokan dan data yang kurang sebelum ORDAL melamar.' : 'Review matches and missing data before ORDAL applies.'}</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> {id ? 'Muat ulang' : 'Refresh'}</button>
      </div>
      {error && <div style={{ color: '#B42318', marginBottom: 14, fontWeight: 700 }}>{error}</div>}

      <div className="card-pixel" style={{ padding: 18, marginBottom: 18 }}>
        <strong>{id ? 'Cara ORDAL bekerja' : 'How ORDAL works'}</strong>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {MODES.map(([value, labelId, labelEn]) => (
            <button key={value} onClick={() => changeMode(value)} className={mode === value ? 'btn btn-primary' : 'btn btn-secondary'}>
              {mode === value && <Check size={15} />}{id ? labelId : labelEn}
            </button>
          ))}
        </div>
        <div style={{ borderTop: '2px solid var(--cream-2)', marginTop: 16, paddingTop: 16 }}>
          <strong>{id ? 'Urutan pencarian platform' : 'Platform search order'}</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <select className="input" value={scheduling.search_strategy} onChange={(event) => saveScheduling({ ...scheduling, search_strategy: event.target.value })}>
              <option value="round_robin">Round Robin</option>
              <option value="priority_focus">Priority Focus</option>
            </select>
            {scheduling.platform_priority.map((value, index) => (
              <span key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '6px 8px', borderRadius: 12, border: '2px solid var(--black)', background: '#fff', fontWeight: 700, fontSize: 12 }}>
                {index + 1}. {PLATFORMS.find(([key]) => key === value)?.[1] || value}
                <button aria-label="Move up" onClick={() => movePlatform(index, -1)} disabled={index === 0} style={{ border: 0, background: 'transparent', padding: 1 }}><ChevronUp size={14} /></button>
                <button aria-label="Move down" onClick={() => movePlatform(index, 1)} disabled={index === scheduling.platform_priority.length - 1} style={{ border: 0, background: 'transparent', padding: 1 }}><ChevronDown size={14} /></button>
              </span>
            ))}
          </div>
          <small style={{ color: 'var(--muted)', display: 'block', marginTop: 8 }}>{id ? 'Round Robin menjalankan platform bergantian secara paralel. Priority Focus menyelesaikan platform pertama sebelum lanjut.' : 'Round Robin interleaves platforms in parallel. Priority Focus finishes the first platform before continuing.'}</small>
          <label style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 12, fontWeight: 700 }}>
            <input type="checkbox" checked={scheduling.sound_enabled} onChange={(event) => saveScheduling({ ...scheduling, sound_enabled: event.target.checked })} />
            {id ? 'Bunyikan notifikasi hasil pencarian' : 'Play search result notifications'}
          </label>
        </div>
      </div>

      {loading ? <p>{id ? 'Memuat...' : 'Loading...'}</p> : items.length === 0 ? (
        <div className="card-pixel" style={{ padding: 28, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{id ? 'Antrean masih kosong' : 'Queue is empty'}</h2>
          <p style={{ color: 'var(--muted)', marginTop: 7 }}>{id ? 'Lowongan yang ditemukan akan muncul di sini.' : 'Discovered jobs will appear here.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.filter((item) => item.status !== 'removed').map((item) => (
            <article key={item.id} className="card-pixel" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <span className="badge" style={{ background: item.status === 'needs_review' ? '#FFF2CC' : '#E7F7EC', color: '#33363F' }}>{item.status.replace('_', ' ')}</span>
                  <h2 style={{ fontSize: 18, fontWeight: 850, marginTop: 9 }}>{item.job_title}</h2>
                  <p style={{ color: 'var(--muted)' }}>{item.company || '-'}{item.location ? ` · ${item.location}` : ''}</p>
                </div>
                <div style={{ minWidth: 86, textAlign: 'center', padding: 10, borderRadius: 14, background: '#FEF0E7', border: '2px solid var(--black)' }}>
                  <strong style={{ fontSize: 24, color: 'var(--orange)' }}>{item.match_score}</strong><div style={{ fontSize: 10 }}>/ 100</div>
                </div>
              </div>
              {item.match_explanation?.hard_filters?.length > 0 && <p style={{ color: '#B42318', marginTop: 12 }}>{item.match_explanation.hard_filters.join(' · ')}</p>}
              {item.missing_fields?.length > 0 && <p style={{ color: '#8A5B00', marginTop: 10 }}>{id ? 'Perlu dijawab: ' : 'Needs answers: '}{item.missing_fields.join(', ')}</p>}
              {item.missing_fields?.length > 0 && (
                <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                  {item.missing_fields.map((field) => (
                    <label key={field} style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 }}>
                      {field}
                      {item.question_metadata?.[field]?.options?.length ? (
                        <select className="input" value={answers[item.id]?.[field] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))}>
                          <option value="">{id ? 'Pilih jawaban' : 'Choose an answer'}</option>
                          {item.question_metadata[field].options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : ['yes_no', 'checkbox'].includes(item.question_metadata?.[field]?.field_type) ? (
                        <select className="input" value={answers[item.id]?.[field] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))}>
                          <option value="">{id ? 'Pilih jawaban' : 'Choose an answer'}</option><option value="Yes">Yes</option><option value="No">No</option>
                        </select>
                      ) : item.question_metadata?.[field]?.field_type === 'textarea' ? (
                        <textarea className="input" rows={3} value={answers[item.id]?.[field] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))} />
                      ) : (
                        <input className="input" type={item.question_metadata?.[field]?.field_type === 'number' ? 'number' : 'text'} value={answers[item.id]?.[field] || ''} onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), [field]: event.target.value } }))} />
                      )}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                {item.status !== 'approved' && item.status !== 'applied' && <button className="btn btn-primary" onClick={() => action(item.id, 'approve')}><Check size={15} />{id ? 'Setujui' : 'Approve'}</button>}
                <button className="btn btn-secondary" onClick={() => action(item.id, 'remove')}><Trash2 size={15} />{id ? 'Hapus' : 'Remove'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

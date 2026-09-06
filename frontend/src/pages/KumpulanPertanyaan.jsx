import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Search, Trash2, HelpCircle } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

const PLATFORM_LABELS = {
  '': 'Semua',
  linkedin: 'LinkedIn Jobs',
  jobstreet: 'JobStreet',
  linkedin_posts: 'LinkedIn Posts',
}

export default function KumpulanPertanyaan() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ question: '', answer: '', platform: '', field_type: 'text' })
  const { t } = useI18n()

  const load = () => {
    setLoading(true)
    api.get('/questions/')
      .then(res => setRows(res.data))
      .catch(err => setError(err.response?.data?.detail || t('pertanyaan.gagal_memuat')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => [r.question, r.answer, r.platform].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [rows, query])

  const create = async () => {
    if (!form.question.trim() || !form.answer.trim()) { setError(t('pertanyaan.qa_wajib')); return }
    setSaving(true); setError('')
    try {
      await api.post('/questions/', form)
      setForm({ question: '', answer: '', platform: '', field_type: 'text' })
      load()
    } catch (err) { setError(err.response?.data?.detail || t('pertanyaan.gagal_menyimpan')) }
    finally { setSaving(false) }
  }

  const update = async row => {
    setSaving(true); setError('')
    try {
      await api.put(`/questions/${row.id}`, row)
      load()
    } catch (err) { setError(err.response?.data?.detail || t('pertanyaan.gagal_update')) }
    finally { setSaving(false) }
  }

  const remove = async id => {
    await api.delete(`/questions/${id}`)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="main-scroll">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1>{t('page.pertanyaan.title')}</h1>
          <p>{t('page.pertanyaan.desc')}</p>
        </div>
        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('page.pertanyaan.search')}
            className="input"
            style={{ paddingLeft: 34, minWidth: 260 }}
          />
        </div>
      </div>

      {error && <div className="notice notice-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">{t('page.pertanyaan.add_manual')}</div>
        </div>
        <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 10, alignItems: 'start' }}>
            <textarea
              rows={2}
              value={form.question}
              onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              placeholder="Pertanyaan"
              className="textarea"
              style={{ resize: 'vertical' }}
            />
            <textarea
              rows={2}
              value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
              placeholder="Jawaban"
              className="textarea"
              style={{ resize: 'vertical' }}
            />
            <button onClick={create} disabled={saving} className="btn btn-primary" style={{ height: 60 }}>
              {saving ? null : <Plus size={13} />} Tambah
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="eyebrow">Total {filtered.length} pertanyaan</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--gray-500)' }}>Memuat...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <HelpCircle size={32} style={{ color: 'var(--gray-300)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>Belum ada pertanyaan</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              Pertanyaan yang dijawab bot akan tersimpan otomatis di sini.
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(row => (
              <QuestionRow key={row.id} row={row} setRows={setRows} update={update} remove={remove} saving={saving} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuestionRow({ row, setRows, update, remove, saving }) {
  const patch = changes => setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...changes } : r))
  const answerRows = Math.min(5, Math.max(1, Math.ceil(((row.answer || '').length || 1) / 80)))

  // ── Parse question: pisahkan "question text" dari "Options: ..." ────────
  // Untuk pertanyaan dropdown, backend nyimpan: "Question text?\nOptions: A; B; C"
  // User request v10: kalau pertanyaan TIDAK terbaca (cuma "Dropdown question"),
  // tampilkan label jelas. Kalau opsi banyak, buat 3-4 kolom atau maks 5 baris
  // supaya tidak terlalu panjang.
  const { questionText, optionsList } = (() => {
    const raw = (row.question || '').trim()
    if (!raw) return { questionText: '(tidak ada pertanyaan)', optionsList: [] }

    // Pattern: "Question?\nOptions: A; B; C" atau "Question? Options: A; B; C"
    const match = raw.match(/^(.*?)\s*(?:\n|\s)+Options?\s*:\s*(.+)$/is)
    if (match) {
      let q = match[1].trim()
      const opts = match[2]
        .split(/[;,]\s*/)
        .map(o => o.trim())
        .filter(Boolean)
      // Kalau question text kosong/generik, tampilkan label fallback yang jelas
      if (!q || q.toLowerCase() === 'dropdown question') {
        q = '(Pertanyaan dropdown — label tidak terbaca dari halaman JobStreet)'
      }
      return { questionText: q, optionsList: opts }
    }

    // Tidak ada "Options:" — cek apakah row punya field_type=dropdown
    // tapi question text generik
    if (raw.toLowerCase() === 'dropdown question') {
      return {
        questionText: '(Pertanyaan dropdown — label tidak terbaca dari halaman JobStreet)',
        optionsList: [],
      }
    }
    return { questionText: raw, optionsList: [] }
  })()

  // ── Layout opsi: 3 kolom kalau opsi banyak, maks 5 baris ──────────────
  // Strategi:
  // - Opsi <= 6 → 1 kolom (vertikal list dengan dot)
  // - Opsi 7-15 → 2 kolom
  // - Opsi 16+ → 3 kolom
  // - Maksimal tampilkan 15 opsi (sisanya "+ N lainnya")
  // supaya card tidak terlalu panjang.
  const maxShow = 15
  const shownOptions = optionsList.slice(0, maxShow)
  const hiddenCount = optionsList.length - shownOptions.length
  const colCount = shownOptions.length <= 6 ? 1 : (shownOptions.length <= 15 ? 2 : 3)

  return (
    <div style={{
      border: '1px solid var(--gray-200)',
      borderRadius: 6,
      padding: 12,
      background: 'var(--cream)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr auto auto', gap: 8, alignItems: 'start' }}>
        <div style={{ minHeight: 34, padding: '4px 0' }}>
          {/* Question text — bold, prominent */}
          <div style={{
            lineHeight: 1.55, color: 'var(--gray-900)',
            fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere',
          }}>
            {questionText}
          </div>
          {/* Dropdown options — multi-column grid dengan dot bullet */}
          {shownOptions.length > 0 && (
            <div style={{
              marginTop: 8,
              display: 'grid',
              gridTemplateColumns: `repeat(${colCount}, 1fr)`,
              gap: '2px 12px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--gray-600)',
            }}>
              {shownOptions.map((opt, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 4,
                  overflowWrap: 'anywhere',
                  // Maks 5 baris per opsi (kalau opsi panjang, dipotong dengan ellipsis)
                  // Tapi tetap show full text via title tooltip.
                }}>
                  <span style={{
                    color: 'var(--orange)',
                    fontWeight: 700,
                    flexShrink: 0,
                    fontSize: 11,
                    lineHeight: '1.6',
                  }}>•</span>
                  <span title={opt}>{opt}</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <div style={{
                  gridColumn: `1 / -1`,
                  marginTop: 4,
                  fontSize: 11,
                  color: 'var(--gray-500)',
                  fontStyle: 'italic',
                }}>
                  + {hiddenCount} opsi lainnya
                </div>
              )}
            </div>
          )}
          {/* Badge field_type (kalau dropdown) */}
          {optionsList.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span className="badge badge-muted" style={{ fontSize: 10 }}>
                dropdown · {optionsList.length} opsi
              </span>
            </div>
          )}
        </div>
        <textarea
          rows={Math.max(answerRows, optionsList.length > 0 ? 3 : 1)}
          value={row.answer || ''}
          onChange={e => patch({ answer: e.target.value })}
          className="textarea"
          style={{ resize: 'none', overflow: 'hidden', fontSize: 13 }}
        />
        <button onClick={() => update(row)} disabled={saving} className="btn btn-secondary" style={{ height: 36 }}>
          <Save size={13} /> Simpan
        </button>
        <button onClick={() => remove(row.id)} className="btn btn-danger" style={{ height: 36, padding: '8px 10px' }} aria-label="Hapus">
          <Trash2 size={13} />
        </button>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--gray-500)' }}>
        <span className="badge badge-muted">{PLATFORM_LABELS[row.platform || ''] || row.platform || 'Semua'}</span>
        <span>dipakai {row.use_count || 0}x</span>
      </div>
    </div>
  )
}

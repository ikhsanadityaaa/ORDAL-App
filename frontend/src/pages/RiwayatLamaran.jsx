import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Download, ExternalLink, Search } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

function fmtDate(value, lang = 'id') {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

function platformLabel(value) {
  return {
    linkedin: 'LinkedIn Jobs',
    linkedin_posts: 'LinkedIn Posts',
    jobstreet: 'JobStreet',
  }[value] || value || '-'
}

function parseAnswers(value) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(a => `${a.question || 'Q'}: ${a.answer || '-'}`).join(' | ')
    if (typeof parsed === 'object') return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(' | ')
  } catch {}
  return value
}

export default function RiwayatLamaran() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const { t, lang } = useI18n()

  useEffect(() => {
    api.get('/sessions/applications')
      .then(res => setRows(res.data))
      .catch(err => setError(err.response?.data?.detail || (lang === 'id' ? 'Gagal memuat riwayat lamaran' : 'Failed to load application history')))
      .finally(() => setLoading(false))
  }, [lang])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row => [
      row.job_title, row.company, row.job_location, row.location, row.position,
      row.salary, row.platform, row.status,
    ].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [rows, query])

  const downloadExcel = () => {
    if (filteredRows.length === 0) return
    const headers = lang === 'id'
      ? ['No', 'Tanggal', 'Posisi', 'Perusahaan', 'Lokasi', 'Gaji', 'Platform', 'Link', 'Jawaban']
      : ['No', 'Date', 'Position', 'Company', 'Location', 'Salary', 'Platform', 'Link', 'Answers']
    const escapeCSV = (value) => {
      const s = String(value ?? '-')
      // RFC 4180: kalau ada koma, quote, atau newline → bungkus dengan quote
      // dan escape quote dobel.
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    const bodyRows = filteredRows.map((row, idx) => [
      idx + 1,
      fmtDate(row.applied_at, lang),
      row.job_title || row.position || '-',
      row.company || '-',
      row.job_location || row.location || '-',
      row.salary || '-',
      platformLabel(row.platform),
      row.job_url || '-',
      parseAnswers(row.question_answers) || '-',
    ])
    const csv = [
      headers.map(escapeCSV).join(','),
      ...bodyRows.map(r => r.map(escapeCSV).join(',')),
    ].join('\r\n')
    // BOM utf-8 supaya Excel buka karakter non-ASCII (Indonesia) dengan benar
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `riwayat-lamaran-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke setelah delay supaya pywebview/EdgeChromium sempat download
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div className="main-scroll">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1>{t('page.riwayat.title')}</h1>
          <p>{t('page.riwayat.desc')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={downloadExcel} disabled={filteredRows.length === 0} className="btn btn-secondary">
            <Download size={13} /> {t('page.riwayat.excel')}
          </button>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('page.riwayat.search')}
              className="input"
              style={{ paddingLeft: 34, minWidth: 260 }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow">{t('page.riwayat.total')} {filteredRows.length} {t('page.riwayat.lamaran')}</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--gray-500)' }}>{t('page.riwayat.memuat')}</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <BriefcaseBusiness size={32} style={{ color: 'var(--gray-300)', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>{t('page.riwayat.belum_ada')}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              {t('page.riwayat.empty_desc')}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 125 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 165 }} />
                <col style={{ width: 135 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {[
                    t('riwayat.col.no'), t('riwayat.col.waktu'), t('riwayat.col.posisi'),
                    t('riwayat.col.perusahaan'), t('riwayat.col.lokasi'), t('riwayat.col.gaji'),
                    t('riwayat.col.platform'), t('riwayat.col.detail'),
                  ].map(label => (
                    <th key={label} style={{
                      textAlign: 'left', padding: '10px 12px',
                      borderBottom: '1px solid var(--gray-200)',
                      fontSize: 11, fontWeight: 600, color: 'var(--gray-700)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const answers = parseAnswers(row.question_answers)
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '12px', fontSize: 12, color: 'var(--gray-500)', verticalAlign: 'top', lineHeight: 1.5 }}>{idx + 1}</td>
                      <td style={{ padding: '12px', fontSize: 12, color: 'var(--gray-500)', verticalAlign: 'top', lineHeight: 1.5 }}>{fmtDate(row.applied_at, lang)}</td>
                      <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: 'var(--gray-900)', verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: 1.45 }}>{row.job_title || row.position || '-'}</td>
                      <td style={{ padding: '12px', fontSize: 13, color: 'var(--gray-700)', verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: 1.45 }}>{row.company || '-'}</td>
                      <td style={{ padding: '12px', fontSize: 12, color: 'var(--gray-700)', verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: 1.5 }}>{row.job_location || row.location || '-'}</td>
                      <td style={{ padding: '12px', fontSize: 12, color: row.salary ? 'var(--gray-900)' : 'var(--gray-400)', verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: 1.5 }}>{row.salary || '-'}</td>
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <span className="badge badge-orange">{platformLabel(row.platform)}</span>
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, verticalAlign: 'top', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                        {row.job_url ? (
                          <a href={row.job_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                            {t('page.riwayat.buka')} <ExternalLink size={11} />
                          </a>
                        ) : '-'}
                        {answers && <div style={{ marginTop: 6, color: 'var(--gray-500)', maxWidth: 260, fontSize: 11, lineHeight: 1.5 }}>{answers}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

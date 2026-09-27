import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Target, Zap, Square, FileText, ChevronDown, ChevronUp, Save, HelpCircle, Pencil, Loader, Check, Sparkles, ArrowUpRight, PartyPopper } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'
import useLicenseStore from '../stores/licenseStore'
import TrialBadge from '../components/license/TrialBadge'
import { PlatformLogo } from '../components/brand'
import { buildCvTargetGroups } from '../targetGroups'

// ── Platform options ─────────────────────────────────────────────────────────
const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'linkedin', label: 'LinkedIn Jobs' },
  { value: 'linkedin_posts', label: 'LinkedIn Posts' },
  { value: 'jobstreet', label: 'JobStreet' },
]
const PLATFORM_LABELS = {
  all: 'Semua',
  linkedin: 'LinkedIn Jobs',
  linkedin_posts: 'LinkedIn Posts',
  jobstreet: 'JobStreet',
  both: 'LinkedIn Jobs + JobStreet',
}
function platformLabel(val) { return PLATFORM_LABELS[val] ?? val }

const EMPLOYMENT_OPTIONS = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
]
const EMPLOYMENT_LABELS = {
  full_time: 'Full Time',
  contract: 'Contract',
  intern: 'Intern',
}
function employmentLabel(val) { return EMPLOYMENT_LABELS[val] ?? 'Full Time' }

function PixelSwitch({ checked, onChange, disabled }) {
  // v3: toggle sticker — border 2px charcoal, hard shadow, handle oranye saat ON
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '52px', height: '30px', padding: '3px', flexShrink: 0,
        background: checked ? '#F2661A' : '#E5E2D8',
        border: '2px solid #33363F',
        borderRadius: '999px',
        boxShadow: '2px 2px 0 #33363F',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'flex', alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background 0.2s ease',
      }}
    >
      <span style={{
        width: '20px', height: '20px',
        background: '#FFFFFF',
        border: '2px solid #33363F',
        borderRadius: '50%',
        display: 'block',
        transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </button>
  )
}

// ── Step config ───────────────────────────────────────────────────────────────
const STEPS = ['analisis', 'kesesuaian', 'duplikat', 'apply']
const STEP_LABELS = { analisis: 'Analisis', kesesuaian: 'Kesesuaian', duplikat: 'Duplikat', apply: 'Apply' }

function normalizeKeyPart(value) {
  return (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

function stableJobKey(event) {
  const title = normalizeKeyPart(event.job_title || event.position)
  const company = normalizeKeyPart(event.company)
  const location = normalizeKeyPart(event.job_location || event.location)
  // ── v43 FIX: ALWAYS use natural key [platform, title, company, location] ──
  // Sebelumnya, kalau company kosong, key fallback ke event.job_id atau
  // event.job_url. Tapi progress event kirim job_id (tanpa job_url), dan
  // applied event kirim job_url (tanpa job_id) — jadi key-nya berbeda untuk
  // job yang sama → muncul 2 entry di LOG PROSES panel.
  //
  // Sekarang: kalau title ada (selalu ada), pakai natural key meski company
  // kosong. Risiko collision (2 job beda di title+location sama) sangat rendah
  // karena praktiknya lowongan beda pasti beda title atau location.
  if (title) {
    return [event.platform, title, company, location].join('|')
  }
  // Fallback terakhir kalau title juga kosong (harusnya tidak terjadi)
  return event.job_id || event.job_url || [event.platform, title, company, location, Date.now()].join('|')
}

function promptKind(question) {
  const fieldType = (question?.answer_mode || question?.field_type || '').toLowerCase()
  if (promptOptions(question).length) return 'dropdown'
  if (['dropdown', 'select', 'choice', 'radio'].includes(fieldType)) return 'text'
  if (fieldType === 'number') return 'number'
  if (fieldType === 'yes_no' || fieldType === 'checkbox') return 'yes_no'
  if (fieldType === 'textarea') return 'textarea'
  if (['text', 'email', 'tel', 'url', 'search'].includes(fieldType)) return 'text'
  return (question?.question || '').length > 180 ? 'textarea' : 'text'
}

function promptOptions(question) {
  if (Array.isArray(question?.options) && question.options.length) return question.options
  const raw = question?.question || ''
  const match = raw.match(/options:\s*([\s\S]*)$/i)
  if (!match) return []
  const seen = new Set()
  return match[1]
    .split(/;|\n|,/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter(v => !/^(select an option|select|pilih|choose|-|--|none)$/i.test(v))
    .filter(v => {
      const key = v.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}

function promptQuestionText(question) {
  return (question?.question || '').replace(/\n?Options:\s*[\s\S]*$/i, '').trim() || question?.question || ''
}

function formatStatusMessage(message = '') {
  const text = String(message || '').trim()
  if (!text) return ''
  if (/^Halaman LinkedIn terbuka:/i.test(text)) return 'Halaman LinkedIn terbuka'
  if (/^Tidak ada halaman LinkedIn/i.test(text)) return text.split(';')[0]
  return text.replace(/https?:\/\/\S+/g, '[link]').slice(0, 140)
}

function StepDot({ status }) {
  const base = "w-4 h-4 flex items-center justify-center shrink-0 text-[9px]"
  if (status === 'ok')      return <span className={base} style={{ background: '#27ae60', border: '1.5px solid #1e8449', color: 'white', fontFamily: 'var(--font-sans)' }}>✓</span>
  if (status === 'fail')    return <span className={base} style={{ background: '#e74c3c', border: '1.5px solid #c0392b', color: 'white', fontFamily: 'var(--font-sans)' }}>✗</span>
  if (status === 'skip')    return <span className={base} style={{ background: '#f39c12', border: '1.5px solid #d68910', color: 'white', fontFamily: 'var(--font-sans)' }}>-</span>
  if (status === 'running') return <span className={base} style={{ background: 'var(--orange)', border: '1.5px solid var(--orange-2)', color: 'white', animation: 'blink 0.8s step-end infinite', fontFamily: 'var(--font-sans)' }}>▶</span>
  return <span className={base} style={{ background: 'var(--cream-2)', border: '1.5px solid var(--border)' }} />
}

// Grid 2-kolom di mana tinggi kolom KANAN mengikuti tinggi ASLI kolom KIRI
// (bukan sekadar CSS grid stretch, yang malah bikin baris grid melar
// ngikutin kolom yang lebih tinggi). Dipakai supaya LOG PROSES tingginya
// persis sama dengan batas bawah kartu Target Aktif, dan kalau job card-nya
// banyak, kolom kanan scroll sendiri alih-alih ikut memanjangkan halaman.
function LeftRightSyncedGrid({ left, right }) {
  const leftRef = useRef(null)
  const [leftHeight, setLeftHeight] = useState(null)

  useEffect(() => {
    const el = leftRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect?.height || entry.target.offsetHeight
        if (h) setLeftHeight(Math.round(h))
      }
    })
    observer.observe(el)
    setLeftHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 1.2fr)', gap: '16px', alignItems: 'start' }}>
      <div ref={leftRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
        {left}
      </div>
      <div
        className="card-pixel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: leftHeight ? `${leftHeight}px` : undefined,
          minHeight: leftHeight ? undefined : '360px',
        }}
      >
        {right}
      </div>
    </div>
  )
}

function JobCard({ job }) {
  const { t } = useI18n()
  const isFound    = job.resultType === 'found'
  const isApplied  = job.steps?.apply === 'ok' && !isFound
  const isSkipped  = job.steps?.kesesuaian === 'skip' || job.steps?.apply === 'fail'
  
  // Platform badge colors
  const platformColors = {
    linkedin: { bg: '#0077b5', border: '#005582' },
    linkedin_posts: { bg: '#0077b5', border: '#005582' },
    jobstreet: { bg: 'var(--orange)', border: 'var(--orange-2)' },
  }
  const platformLabels = {
    linkedin: 'LI',
    linkedin_posts: 'LI',
    jobstreet: 'JS',
  }

  return (
    <div className="animate-pixel-in" style={{
      background:  isApplied ? '#eafaf1' : isFound ? '#eef6fb' : isSkipped ? '#fafafa' : 'white',
      border:      `2px solid ${isApplied ? '#27ae60' : isFound ? '#2980b9' : isSkipped ? 'var(--border)' : 'var(--black)'}`,
      boxShadow:   isApplied ? '3px 3px 0 #27ae60' : isFound ? '3px 3px 0 #2980b9' : isSkipped ? 'none' : '3px 3px 0 var(--black)',
      padding:     '12px',
      marginBottom: '8px',
      opacity:     isSkipped ? 0.65 : 1,
    }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <p className="font-semibold truncate" style={{ fontSize: '14px', color: 'var(--black)' }}>{job.job_title}</p>
            {job.platform && (
              <span className="font-pixel shrink-0" style={{
                fontSize: '7px',
                padding: '2px 5px',
                background: platformColors[job.platform]?.bg || 'var(--muted)',
                color: 'white',
                border: `1.5px solid ${platformColors[job.platform]?.border || 'var(--border)'}`,
              }}>
                {platformLabels[job.platform] || job.platform.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>{job.company}</p>
          {job.location && <p style={{ fontSize: '13px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>{job.location}</p>}
          {job.salary && (
            <p style={{ fontSize: '13px', color: '#27ae60', fontWeight: 600, marginTop: '2px', overflowWrap: 'anywhere' }}>
              {job.salary}
            </p>
          )}
        </div>
        <span className="font-pixel shrink-0" style={{
          fontSize: '7px',
          padding: '3px 6px',
          background: isApplied ? '#27ae60' : isFound ? '#2980b9' : isSkipped ? 'var(--border)' : 'var(--orange)',
          color: isSkipped ? 'var(--muted)' : 'white',
          border: '1.5px solid var(--black)',
        }}>
          {isFound ? 'FOUND' : isApplied ? t('log.status_applied') : isSkipped ? t('log.status_skip') : t('log.status_proses')}
        </span>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((step, i) => {
          const status = job.steps?.[step] ?? 'pending'
          const msg    = job.messages?.[step]
          return (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && <span style={{ color: 'var(--border)', fontSize: '13px' }}>›</span>}
              <div className="flex items-center gap-1" title={msg || STEP_LABELS[step]}>
                <StepDot status={status} />
                <span style={{
                  fontSize: '14px',
                  color: status === 'running' ? 'var(--orange)' : status === 'ok' ? '#27ae60' : status === 'fail' ? '#e74c3c' : status === 'skip' ? '#f39c12' : 'var(--muted)',
                  fontWeight: status === 'running' ? 700 : 400,
                }}>
                  {STEP_LABELS[step]}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {(() => {
        const failMsg = STEPS.map(s => job.messages?.[s]).filter(Boolean).pop()
        return failMsg && isSkipped ? (
          <p style={{ fontSize: '14px', color: '#e74c3c', marginTop: '4px', fontStyle: 'italic' }}>↳ {failMsg}</p>
        ) : null
      })()}
      {(() => {
        // Tampilkan info posisi yang match (mis. "Match: HR Staff") bila ada.
        // Pesan ini dikirim backend di step 'kesesuaian' saat posisi cocok.
        const matchInfo = job.messages?.kesesuaian
        const matchedPos = job.matched_position
        if (!matchInfo && !matchedPos) return null
        // Hanya tampilkan kalau bukan alasan skip (sudah ditampilkan di failMsg)
        if (isSkipped) return null
        const hasMatchText = /^Match:/i.test(matchInfo || '') || /sesuai family/i.test(matchInfo || '')
        if (!hasMatchText && !matchedPos) return null
        return (
          <p style={{
            fontSize: '14px', color: '#27ae60', marginTop: '4px',
            fontStyle: 'italic', fontWeight: 500,
          }}>
            ✓ {matchedPos ? `Cocok dengan: ${matchedPos}` : matchInfo}
          </p>
        )
      })()}
      {job.notes && (
        <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '14px', color: 'var(--black-3)', background: 'white', border: '1.5px solid var(--border)', padding: '8px', maxHeight: '120px', overflow: 'auto' }}>
          {job.notes}
        </pre>
      )}
    </div>
  )
}

const CONFETTI = Array.from({ length: 36 }, (_, index) => ({
  left: `${(index * 29) % 100}%`,
  animationDelay: `${(index % 9) * 0.12}s`,
  animationDuration: `${2.4 + (index % 5) * 0.22}s`,
  backgroundColor: ['#F2661A', '#FFD166', '#27ae60', '#2980b9', '#ef476f'][index % 5],
}))

function FinishModal({ jobs, sessionId, status, lang, onClose, onHistory }) {
  const searched = jobs.length
  const matched = jobs.filter(j => j.steps?.kesesuaian === 'ok' || j.steps?.duplikat === 'ok' || j.steps?.apply === 'ok').length
  const applied = jobs.filter(j => j.steps?.apply === 'ok' && j.resultType !== 'found')
  const perPlatform = applied.reduce((acc, job) => {
    const key = job.platform || 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(job)
    return acc
  }, {})
  const platformOrder = ['linkedin', 'linkedin_posts', 'jobstreet']
  const platformName = key => ({ linkedin: 'LinkedIn Jobs', linkedin_posts: 'LinkedIn Posts', jobstreet: 'JobStreet' }[key] || key)
  const hasApplied = applied.length > 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.62)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      {hasApplied && (
        <div className="finish-confetti" aria-hidden="true">
          {CONFETTI.map((piece, index) => <i key={index} style={piece} />)}
        </div>
      )}
      <div className="card-pixel" style={{ width: 'min(680px, 100%)', background: '#F4F2EC', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'var(--black)', color: 'white', padding: '14px 18px', borderBottom: '4px solid var(--orange)' }}>
          <p className="font-title" style={{ fontSize: '32px', lineHeight: 1 }}>
            {hasApplied ? (lang === 'id' ? 'SELAMAT!' : 'CONGRATULATIONS!') : (lang === 'id' ? 'PENCARIAN SELESAI' : 'SEARCH COMPLETE')}
          </p>
          <p className="font-pixel" style={{ fontSize: '14px', color: 'var(--orange-3)', marginTop: '3px' }}>
            {lang === 'id' ? 'SESI' : 'SESSION'} {sessionId ? `#${sessionId}` : ''} {status === 'stopped' ? (lang === 'id' ? 'DIHENTIKAN' : 'STOPPED') : (lang === 'id' ? 'SELESAI' : 'COMPLETE')}
          </p>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className={hasApplied ? 'notice notice-success' : 'notice notice-info'}>
            {hasApplied ? <PartyPopper size={18} style={{ flexShrink: 0 }} /> : <Sparkles size={18} style={{ flexShrink: 0 }} />}
            <div>
              <strong>
                {hasApplied
                  ? (lang === 'id' ? `ORDAL berhasil mengirim ${applied.length} lamaran.` : `ORDAL submitted ${applied.length} application${applied.length === 1 ? '' : 's'}.`)
                  : (lang === 'id' ? 'Belum ada lamaran yang berhasil dikirim kali ini.' : 'No applications were submitted this time.')}
              </strong>
              <div style={{ marginTop: 4 }}>
                {hasApplied
                  ? (lang === 'id' ? 'Sekarang kamu bisa santai. ORDAL sudah mengerjakan bagiannya, kamu tinggal bersiap menerima kabar baik.' : 'Now you can relax. ORDAL has done its part, so you can get ready for good news.')
                  : (lang === 'id' ? 'Lowongan yang cocok dengan posisi, lokasi, dan platform pilihanmu mungkin sedang belum tersedia. Jangan menyerah. Coba lagi nanti atau perluas target pencarianmu.' : 'Matching jobs for your chosen role, location, and platforms may not be available right now. Keep going. Try again later or broaden your search targets.')}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            {[
              ['JOB DICEK', searched, 'var(--black)'],
              ['MATCH', matched, '#2980b9'],
              ['APPLIED', applied.length, '#27ae60'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ background: 'white', border: '3px solid var(--black)', boxShadow: '3px 3px 0 var(--black)', padding: '10px', textAlign: 'center' }}>
                <p className="font-pixel" style={{ fontSize: '22px', color }}>{value}</p>
                <p style={{ fontSize: '14px', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{label}</p>
              </div>
            ))}
          </div>

          <div style={{ background: 'white', border: '3px solid var(--black)', padding: '12px', maxHeight: '280px', overflow: 'auto' }}>
            <p className="font-pixel" style={{ fontSize: '13px', color: 'var(--black)', marginBottom: '10px' }}>LAMARAN TERKIRIM</p>
            {applied.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {lang === 'id' ? 'Belum ada lamaran terkirim pada sesi ini.' : 'No applications were submitted in this session.'}
              </p>
            ) : (
              platformOrder.filter(key => perPlatform[key]?.length).map(key => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <p className="font-pixel" style={{ fontSize: '14px', color: key === 'jobstreet' ? 'var(--orange)' : '#0077b5', marginBottom: '6px' }}>
                    {platformName(key)} · {perPlatform[key].length}
                  </p>
                  {perPlatform[key].map(job => (
                    <div key={job.job_id} style={{ border: '2px solid var(--border)', padding: '8px', marginBottom: '6px', background: '#F4F2EC' }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--black)', overflowWrap: 'anywhere' }}>{job.job_title || 'Lowongan'}</p>
                      <p style={{ fontSize: '13px', color: 'var(--muted)', overflowWrap: 'anywhere' }}>{job.company || '-'} · {job.location || '-'}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={onClose} className="btn-pixel-ghost">{lang === 'id' ? 'TUTUP' : 'CLOSE'}</button>
            <button onClick={onHistory} className="btn-pixel">{lang === 'id' ? 'CEK RIWAYAT LAMARAN' : 'VIEW APPLICATION HISTORY'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Target Panel ──────────────────────────────────────────────────────────────
function TargetPanel({ isRunning = false }) {
  const { t, tj, lang } = useI18n()
  const [targets, setTargets] = useState([])
  const [cvs, setCvs]         = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false)
  const [open, setOpen]       = useState(false)
  const [error, setError]     = useState('')
  const defaultPrefs = { expected_salary: '', available_join: '', headless_mode: false, testing_email_mode: false }
  const [prefs, setPrefs]     = useState(defaultPrefs)
  const [editingTarget, setEditingTarget] = useState(null)
  const [editingGroupIds, setEditingGroupIds] = useState([])
  const [form, setForm]       = useState({
    cv_id: '',
    positions: [''],
    locations: [''],
    platforms: ['all'],
    employment_type: 'full_time',
    expected_salary: '',
    available_join: '',
    available_join_custom: '',
    excluded_positions: [''],  // Posisi yang tidak ingin dilamar
    excluded_companies: [''],  // Perusahaan yang tidak ingin dilamar
    cover_letter: '',
    showCoverLetter: false,
  })

  useEffect(() => {
    Promise.all([api.get('/targets/'), api.get('/cvs/'), api.get('/preferences/')]).then(([tRes, cRes, pRes]) => {
      setTargets(Array.isArray(tRes.data) ? tRes.data : [])
      setCvs(Array.isArray(cRes.data) ? cRes.data : [])
      setPrefs({ ...defaultPrefs, ...(pRes.data || {}) })
      if (cRes.data?.length > 0) setForm(f => ({
        ...f,
        cv_id: cRes.data[0].id,
        positions: [cRes.data[0].position_label || ''],
        expected_salary: f.expected_salary || pRes.data?.expected_salary || '',
        available_join: f.available_join || pRes.data?.available_join || '',
      }))
    }).finally(() => setLoading(false))
  }, [])

  const cvPosition = cvId => cvs.find(cv => String(cv.id) === String(cvId))?.position_label || ''
  const cvText     = cvId => cvs.find(cv => String(cv.id) === String(cvId))?.cv_text || ''
  const setCv = cvId => setForm(f => ({
    ...f,
    cv_id: cvId,
    // Hanya set position_label kalau positions masih kosong
    positions: (f.positions && f.positions.some(p => p.trim())) ? f.positions : [cvPosition(cvId)],
  }))

  // ── AI: suggest posisi relevan dari CV ─────────────────────────────────────
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const suggestPositions = async () => {
    const cvTextContent = cvText(form.cv_id)
    if (!cvTextContent) {
      setSuggestError('CV text kosong. Upload ulang CV atau pilih CV lain.')
      return
    }
    setSuggesting(true)
    setSuggestError('')
    try {
      const res = await api.post('/ai_config/suggest_positions', {
        cv_text: cvTextContent,
        max_positions: 8,
      })
      if (res.data.ok && Array.isArray(res.data.positions) && res.data.positions.length) {
        // Merge dengan positions yang sudah ada (hindari duplikat)
        const existing = form.positions.filter(p => p.trim())
        const merged = [...existing]
        for (const p of res.data.positions) {
          const clean = p.trim()
          if (clean && !merged.some(m => m.toLowerCase() === clean.toLowerCase())) {
            merged.push(clean)
          }
        }
        setForm(f => ({ ...f, positions: merged.length ? merged : [''] }))
      } else {
        setSuggestError(res.data.error || 'AI tidak bisa menyarankan posisi. Cek API key AI.')
      }
    } catch (e) {
      setSuggestError(e.response?.data?.detail || e.message || 'Gagal memanggil AI')
    } finally {
      setSuggesting(false)
    }
  }

  const addTag = (k, value) => {
    if (!value.trim()) return
    setForm(f => {
      const arr = [...(f[k] || [])]
      const clean = value.trim()
      if (!arr.some(v => v.toLowerCase() === clean.toLowerCase())) {
        arr.push(clean)
      }
      return { ...f, [k]: arr }
    })
  }
  const removeTag = (k, i) => setForm(f => {
    const a = [...(f[k] || [])]
    a.splice(i, 1)
    return { ...f, [k]: a.length ? a : [''] }
  })
  const resetForm = () => {
    setEditingTarget(null)
    setEditingGroupIds([])
    setForm({
      cv_id: cvs[0]?.id || '',
      positions: [cvs[0]?.position_label || ''],
      locations: [''],
      platforms: ['all'],
      employment_type: 'full_time',
      expected_salary: prefs.expected_salary || '',
      available_join: prefs.available_join || '',
      available_join_custom: '',
      excluded_positions: [''],
      excluded_companies: [''],
      cover_letter: '',
      showCoverLetter: false,
    })
  }

  // v40: TAMBAH — form kosong, selalu create new (api.post)
  const openAdd = () => {
    if (open) {
      setOpen(false)
      setError('')
      return
    }
    setEditingTarget(null)
    setEditingGroupIds([])
    resetForm()
    setOpen(true)
  }

  const openEditAdd = () => {
    // v40: EDIT — prefill form dengan target pertama yang ada.
    if (open) {
      setOpen(false)
      setError('')
      return
    }
    const targetsArray = Array.isArray(targets) ? targets : []
    const primary = targetsArray[0]
    if (!primary) {
      resetForm()
      setOpen(true)
      return
    }
    const sameGroup = targetsArray.filter(t =>
      normalizeKeyPart(t.position) === normalizeKeyPart(primary.position) &&
      String(t.cv_id || '') === String(primary.cv_id || '') &&
      (t.employment_type || 'full_time') === (primary.employment_type || 'full_time') &&
      (t.expected_salary || '') === (primary.expected_salary || '') &&
      (t.available_join || '') === (primary.available_join || '')
    )
    const platforms = [...new Set(sameGroup.map(t => t.platform || 'all'))]
    const locations = [...new Set(sameGroup.flatMap(t => t.locations || [t.location]).filter(Boolean))]
    setEditingTarget(primary)
    setEditingGroupIds(sameGroup.flatMap(t => t.ids || [t.id]).filter(Boolean))
    setError('')
    setForm({
      cv_id: primary.cv_id || cvs[0]?.id || '',
      positions: parsePositionsToList(primary.position || ''),
      locations: locations.length ? locations : [primary.location || ''],
      platforms: platforms.includes('all') ? ['all'] : platforms.slice(0, 2),
      employment_type: primary.employment_type || 'full_time',
      expected_salary: primary.expected_salary || prefs.expected_salary || '',
      available_join: primary.available_join || prefs.available_join || '',
      excluded_positions: (() => {
        const parsed = primary.excluded_positions
          ? String(primary.excluded_positions).split(',').map(s => s.trim()).filter(Boolean)
          : []
        return parsed.length ? parsed : ['']
      })(),
      excluded_companies: (() => {
        const parsed = primary.excluded_companies
          ? String(primary.excluded_companies).split(',').map(s => s.trim()).filter(Boolean)
          : []
        return parsed.length ? parsed : ['']
      })(),
      cover_letter: primary.cover_letter || '',
      showCoverLetter: Boolean(primary.cover_letter),
    })
    setOpen(true)
  }
  const togglePlatform = value => {
    setError('')
    setForm(f => {
      if (value === 'all') return { ...f, platforms: ['all'] }
      // Multi-select: toggle in/out dari array
      let arr = f.platforms.filter(p => p !== 'all')
      if (arr.includes(value)) {
        arr = arr.filter(p => p !== value)
      } else {
        arr = [...arr, value]
      }
      // Batasi maksimal 2 platform
      if (arr.length > 2) {
        setError(t('cari_kerja.max_2_platform'))
        return f
      }
      // Kalau kosong, fallback ke 'all'
      if (arr.length === 0) arr = ['all']
      return { ...f, platforms: arr }
    })
  }

  const targetKey = t => [
    normalizeKeyPart(t.position),
    normalizeKeyPart(t.location),
    t.platform || 'all',
  ].join('|')

  const formPosition = () => {
    // Kembalikan semua posisi yang diisi user sebagai satu string comma-separated.
    // Ini yang dikirim ke backend sebagai `position` field di job_targets row.
    // Bot akan parse string ini untuk search per-posisi + matching multi-posisi.
    const positions = (form.positions || []).map(p => p.trim()).filter(Boolean)
    return positions.join(', ')
  }

  const formTargetKey = (location, platform) => [
    normalizeKeyPart(formPosition()),
    normalizeKeyPart(location),
    platform || 'all',
  ].join('|')

  const buildTargetPayload = (location, platform) => ({
    cv_id: Number(form.cv_id),
    position: formPosition(),
    location,
    platform: platform || 'all',
    employment_type: form.employment_type || 'full_time',
    expected_salary: form.expected_salary?.trim() || '',
    available_join: (form.available_join === '__custom__' ? form.available_join_custom : form.available_join)?.trim() || '',
    cover_letter: form.cover_letter.trim() || null,
    excluded_positions: form.excluded_positions.filter(p => p.trim()),
    excluded_companies: form.excluded_companies.filter(p => p.trim()),
  })

  const handleSubmit = async () => {
    const positions = form.positions.filter(p => p.trim())
    const locations = form.locations.filter(l => l.trim())
    if (!form.cv_id)       { setError(t('cari_kerja.pilih_cv')); return }
    if (!positions.length) { setError(t('cari_kerja.isi_posisi')); return }
    if (!locations.length) { setError(t('cari_kerja.isi_lokasi')); return }
    const platforms = form.platforms?.length ? form.platforms : ['all']
    setError(''); setSaving(true)
    try {
      // Gabungkan semua positions jadi SATU string comma-separated.
      // Backend akan simpan sebagai 1 row di job_targets dengan position =
      // "HR Staff, General Affair, Talent Acquisition". Bot parse multi-posisi
      // saat search, lalu lamar lowongan yang cocok dengan SALAH SATU posisi.
      const positionsStr = positions.join(', ')
      if (editingTarget) {
        // Safety check: pastikan targets adalah array sebelum digunakan
        const targetsArray = Array.isArray(targets) ? targets : []
        const groupTargets = targetsArray.filter(t => editingGroupIds.includes(t.id))
        const byKey = new Map(groupTargets.map(t => [targetKey(t), t]))
        const desired = locations.flatMap(location => platforms.map(platform => ({ location, platform, key: formTargetKey(location, platform) })))
        const desiredKeys = new Set(desired.map(item => item.key))
        const calls = []
        const usedTargetIds = new Set()

        desired.forEach(item => {
          const existing = byKey.get(item.key)
          if (existing) {
            usedTargetIds.add(existing.id)
            calls.push(api.put(`/targets/${existing.id}`, buildTargetPayload(item.location, item.platform)))
          } else {
            const reusable = groupTargets.find(t => !usedTargetIds.has(t.id))
            if (reusable) {
              usedTargetIds.add(reusable.id)
              calls.push(api.put(`/targets/${reusable.id}`, buildTargetPayload(item.location, item.platform)))
            } else {
              calls.push(api.post('/targets/', {
                cv_id: Number(form.cv_id),
                positions: [positionsStr],
                locations: [item.location],
                platforms: [item.platform],
                employment_type: form.employment_type || 'full_time',
                expected_salary: form.expected_salary?.trim() || '',
                available_join: (form.available_join === '__custom__' ? form.available_join_custom : form.available_join)?.trim() || '',
                cover_letter: form.cover_letter.trim() || null,
              }))
            }
          }
        })

        groupTargets.forEach(t => {
          if (!desiredKeys.has(targetKey(t)) && !usedTargetIds.has(t.id)) calls.push(api.delete(`/targets/${t.id}`))
        })

        await Promise.all(calls)
      } else {
        await api.post('/targets/', {
          cv_id: Number(form.cv_id),
          positions: [positionsStr],
          locations,
          platforms,
          employment_type: form.employment_type || 'full_time',
          expected_salary: form.expected_salary?.trim() || '',
          available_join: (form.available_join === '__custom__' ? form.available_join_custom : form.available_join)?.trim() || '',
          cover_letter: form.cover_letter.trim() || null,
          excluded_positions: form.excluded_positions.filter(p => p.trim()),
          excluded_companies: form.excluded_companies.filter(p => p.trim()),
        })
      }
      const res = await api.get('/targets/')
      setTargets(Array.isArray(res.data) ? res.data : [])
      resetForm()
      setOpen(false)
    } catch (err) { setError(err.response?.data?.detail || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleEdit = target => {
    if (!target) return
    // v43 FIX: set editingGroupIds ke semua target dengan posisi+cv+config yang sama,
    // supaya handleSubmit bisa diff & update group yang benar (bukan group sebelumnya).
    const targetsArray = Array.isArray(targets) ? targets : []
    const sameGroup = targetsArray.filter(t =>
      normalizeKeyPart(t.position) === normalizeKeyPart(target.position) &&
      String(t.cv_id || '') === String(target.cv_id || '') &&
      (t.employment_type || 'full_time') === (target.employment_type || 'full_time') &&
      (t.expected_salary || '') === (target.expected_salary || '') &&
      (t.available_join || '') === (target.available_join || '')
    )
    const platforms = [...new Set(sameGroup.map(t => t.platform || 'all'))]
    const locations = [...new Set(sameGroup.flatMap(t => t.locations || [t.location]).filter(Boolean))]
    setEditingTarget(target)
    setEditingGroupIds(sameGroup.flatMap(t => t.ids || [t.id]).filter(Boolean))
    setError('')
    setForm({
      cv_id: target.cv_id || cvs[0]?.id || '',
      // Parse target.position (yang mungkin "HR Staff, General Affair") jadi array
      positions: parsePositionsToList(target.position || ''),
      locations: locations.length ? locations : [target.location || ''],
      platforms: platforms.includes('all') ? ['all'] : platforms.slice(0, 2),
      employment_type: target.employment_type || 'full_time',
      expected_salary: target.expected_salary || prefs.expected_salary || '',
      available_join: target.available_join || prefs.available_join || '',
      available_join_custom: '',
      excluded_positions: (() => {
        const parsed = target.excluded_positions
          ? String(target.excluded_positions).split(',').map(s => s.trim()).filter(Boolean)
          : []
        return parsed.length ? parsed : ['']
      })(),
      excluded_companies: (() => {
        const parsed = target.excluded_companies
          ? String(target.excluded_companies).split(',').map(s => s.trim()).filter(Boolean)
          : []
        return parsed.length ? parsed : ['']
      })(),
      cover_letter: target.cover_letter || '',
      showCoverLetter: Boolean(target.cover_letter),
    })
    setOpen(true)
  }

  // Helper: parse string posisi (mis. "HR Staff, General Affair") jadi array.
  // Split by koma/slash/pipe/dan/atau — sama dengan parsing di backend.
  function parsePositionsToList(value) {
    if (!value) return ['']
    const parts = value.split(/[,/;|]+|\sdan\s|\sand\s|\satau\s|\sor\s/i)
    const out = []
    for (const p of parts) {
      const clean = p.trim()
      if (clean && !out.some(x => x.toLowerCase() === clean.toLowerCase())) out.push(clean)
    }
    return out.length ? out : ['']
  }

  const savePrefs = async (nextPrefs = prefs) => {
    setSavingPrefs(true)
    setError('')
    try {
      const res = await api.put('/preferences/', nextPrefs)
      setPrefs(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || t('cari_kerja.gagal_simpan_prefs'))
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleHeadlessChange = value => {
    const nextPrefs = { ...prefs, headless_mode: value }
    setPrefs(nextPrefs)
    savePrefs(nextPrefs)
  }

  const handleTestingEmailChange = value => {
    const nextPrefs = { ...prefs, testing_email_mode: value }
    setPrefs(nextPrefs)
    savePrefs(nextPrefs)
  }

  const generateCoverLetterFromCv = async () => {
    const positions = form.positions.map(position => position.trim()).filter(Boolean)
    if (!form.cv_id || positions.length === 0) {
      setError(lang === 'id' ? 'Pilih CV dan isi posisi yang diincar terlebih dahulu.' : 'Choose a CV and add at least one target position first.')
      return
    }
    setGeneratingCoverLetter(true)
    setError('')
    try {
      const res = await api.post(`/cvs/${form.cv_id}/generate-cover-letter-template`, { positions })
      if (!res.data?.ok || !res.data?.template) throw new Error(lang === 'id' ? 'AI tidak mengembalikan surat lamaran.' : 'AI did not return a cover letter.')
      setForm(current => ({ ...current, cover_letter: res.data.template }))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('cari_kerja.gagal_generate_cover_ai'))
    } finally {
      setGeneratingCoverLetter(false)
    }
  }

  const cvTargetGroups = buildCvTargetGroups(Array.isArray(targets) ? targets : [])

  const inputStyle = {
    border: '2px solid var(--black)',
    background: 'white',
    padding: '9px 12px',
    fontSize: '14px',
    width: '100%',
    minHeight: '44px',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    borderRadius: '14px',
  }
  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    paddingRight: '42px',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, #33363F 50%), linear-gradient(135deg, #33363F 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 18px) 18px, calc(100% - 12px) 18px',
    backgroundSize: '6px 6px, 6px 6px',
    backgroundRepeat: 'no-repeat',
  }

  return (
    <>
    <div className="card-pixel" style={{ overflow: 'hidden', marginBottom: '12px' }}>
      <div style={{
        padding: '12px 16px', background: '#F4F2EC',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="font-pixel" style={{ fontSize: '14px', color: 'var(--black)', marginBottom: '4px', fontWeight: 900 }}>HEADLESS MODE</p>
          <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.6 }}>
            {prefs.headless_mode ? t('cari_kerja.headless_on_desc') : t('cari_kerja.headless_off_desc')}
          </p>
        </div>
        <PixelSwitch
          checked={Boolean(prefs.headless_mode)}
          disabled={savingPrefs || isRunning}
          onChange={handleHeadlessChange}
        />
      </div>
    </div>

    <div className="card-pixel" style={{ overflow: 'hidden', marginBottom: '12px' }}>
      <div style={{
        padding: '12px 16px', background: '#F4F2EC',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="font-pixel" style={{ fontSize: '14px', color: 'var(--black)', marginBottom: '4px', fontWeight: 900 }}>{t('cari_kerja.testing_email')}</p>
          <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.6 }}>
            {prefs.testing_email_mode
              ? t('cari_kerja.testing_on')
              : t('cari_kerja.testing_off')}
          </p>
        </div>
        <PixelSwitch
          checked={Boolean(prefs.testing_email_mode)}
          disabled={savingPrefs || isRunning}
          onChange={handleTestingEmailChange}
        />
      </div>
    </div>

    <div className="card-pixel" style={{ overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '2px solid var(--black)', background: 'var(--cream)' }}>
        <span className="font-pixel" style={{ fontSize: '13px', letterSpacing: '0.02em', fontWeight: 900 }}>{t('cari_kerja.target_aktif')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* v40: Pisah tombol TAMBAH dan EDIT */}
          <button onClick={openAdd} className="btn-pixel-ghost btn-pixel-sm" style={{ width: '152px', minHeight: '40px', justifyContent: 'center' }}>
            <Plus size={12} /> TAMBAH
          </button>
          {targets.length > 0 && (
            <button onClick={openEditAdd} className="btn-pixel-ghost btn-pixel-sm" style={{ width: '152px', minHeight: '40px', justifyContent: 'center' }}>
              <Pencil size={12} /> EDIT
            </button>
          )}
          {open && cvs.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-pixel btn-pixel-sm"
              style={{ width: '152px', minHeight: '40px', justifyContent: 'center' }}
            >
              <Save size={12} /> {saving ? t('cari_kerja.menyimpan') : t('cari_kerja.save_close')}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-4" style={{ borderBottom: '2px solid var(--border)', background: '#F4F2EC' }}>
          <p className="font-pixel" style={{ fontSize: '13px', color: 'var(--black)', marginBottom: '10px' }}>
            {editingTarget ? 'EDIT TARGET TERSIMPAN' : 'TAMBAH TARGET BARU'}
          </p>
          {error && <p style={{ fontSize: '13px', color: '#e74c3c', marginBottom: '8px' }}>{error}</p>}
          {cvs.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('cari_kerja.upload_cv_dulu')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>CV</label>
                <select value={form.cv_id} onChange={e => setCv(e.target.value)} style={selectStyle}>
                  {cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.position_label}, {cv.file_name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, display: 'block' }}>POSISI (bisa lebih dari satu untuk posisi sejenis)</label>
                  <button
                    type="button"
                    onClick={suggestPositions}
                    disabled={suggesting || !form.cv_id}
                    style={{
                      fontSize: '12px', padding: '4px 10px',
                      background: 'var(--orange)', color: 'white',
                      border: '1.5px solid var(--black)',
                      cursor: suggesting || !form.cv_id ? 'not-allowed' : 'pointer',
                      opacity: suggesting || !form.cv_id ? 0.6 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontFamily: 'var(--font-sans)', fontWeight: 600,
                      boxShadow: '1px 1px 0 var(--black)',
                      borderRadius: '999px', minHeight: '38px',
                    }}
                    title="AI akan menganalisis CV dan menambahkan posisi relevan (mis. HR Staff, GA, Talent Acquisition, Training Staff)"
                  >
                    {suggesting ? '...' : '✦'} {t('cari_kerja.sarankan_cv')}
                  </button>
                </div>
                {suggestError && (
                  <p style={{ fontSize: '13px', color: '#e74c3c', marginBottom: '6px' }}>{suggestError}</p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {form.positions.filter(p => p.trim()).map((p, i) => {
                    const origIdx = form.positions.findIndex((v, idx) => v === p && idx <= i)
                    return (
                      <span key={`${p}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        background: 'white', border: '2px solid var(--black)', padding: '4px 8px',
                        fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
                        boxShadow: '2px 2px 0 var(--black)',
                        borderRadius: '999px',
                      }}>
                        {p}
                        <button onClick={() => removeTag('positions', origIdx)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--black)', padding: 0, lineHeight: 1, marginLeft: '4px',
                        }} aria-label="Hapus">×</button>
                      </span>
                    )
                  })}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Tambah posisi (tekan Enter)"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag('positions', e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                    style={{
                      ...inputStyle,
                      width: '100%',
                    }}
                  />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6, marginTop: '8px' }}>
                  Bot akan melamar lowongan untuk semua posisi di atas, plus posisi se-rumpun yang relevan.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>{t('cari_kerja.gaji_target')}</label>
                  <input
                    value={form.expected_salary || ''}
                    onChange={e => setForm(f => ({ ...f, expected_salary: e.target.value }))}
                    placeholder={t('cari_kerja.placeholder_gaji')}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>{t('cari_kerja.dapat_bergabung')}</label>
                  {form.available_join === '__custom__' ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        value={form.available_join_custom || ''}
                        onChange={e => setForm(f => ({ ...f, available_join_custom: e.target.value }))}
                        placeholder="Ketik sendiri..."
                        style={{ ...inputStyle, flex: 1 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, available_join: '', available_join_custom: '' }))}
                        style={{ width: '44px', minHeight: '44px', padding: 0, border: '2px solid var(--black)', background: 'var(--cream)', cursor: 'pointer', fontSize: 12, borderRadius: '14px' }}
                        title="Kembali ke dropdown"
                      >×</button>
                    </div>
                  ) : (
                    <select
                      value={form.available_join || ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '__custom__') {
                          setForm(f => ({ ...f, available_join: '__custom__', available_join_custom: '' }))
                        } else {
                          setForm(f => ({ ...f, available_join: val, available_join_custom: '' }))
                        }
                      }}
                      style={selectStyle}
                    >
                      <option value="">Pilih</option>
                      <option value="Secepatnya">Secepatnya</option>
                      <option value="1 minggu">1 minggu</option>
                      <option value="1 month notice">1 month notice</option>
                      <option value="__custom__">Isi sendiri...</option>
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>LOKASI</label>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {form.locations.filter(l => l.trim()).map((l, i) => {
                    const origIdx = form.locations.findIndex((v, idx) => v === l && idx <= i)
                    return (
                      <span key={`${l}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        background: 'white', border: '2px solid var(--black)', padding: '4px 8px',
                        fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
                        boxShadow: '2px 2px 0 var(--black)',
                        borderRadius: '999px',
                      }}>
                        {l}
                        <button onClick={() => removeTag('locations', origIdx)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--black)', padding: 0, lineHeight: 1, marginLeft: '4px',
                        }} aria-label="Hapus">×</button>
                      </span>
                    )
                  })}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Tambah lokasi (tekan Enter)"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag('locations', e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                    style={{
                      ...inputStyle,
                      width: '100%',
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>PLATFORM</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {PLATFORM_OPTIONS.map(({ value, label }) => {
                    const selected = (form.platforms || ['all']).includes(value)
                    return (
                    <button key={value} onClick={() => togglePlatform(value)} style={{
                      fontSize: '13px', padding: '5px 10px',
                      background: selected ? 'var(--black)' : 'white',
                      color: selected ? 'white' : 'var(--black)',
                      border: '2px solid var(--black)', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontWeight: 600,
                      borderRadius: '999px', width: '132px', minHeight: '42px',
                    }}>{label}</button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>TIPE KERJA</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {EMPLOYMENT_OPTIONS.map(({ value, label }) => {
                    const selected = (form.employment_type || 'full_time') === value
                    return (
                      <button key={value} onClick={() => setForm(f => ({ ...f, employment_type: value }))} style={{
                        fontSize: '13px', padding: '5px 10px',
                        background: selected ? 'var(--black)' : 'white',
                        color: selected ? 'white' : 'var(--black)',
                      border: '2px solid var(--black)', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontWeight: 600,
                      borderRadius: '999px', width: '120px', minHeight: '42px',
                      }}>{label}</button>
                    )
                  })}
                </div>
              </div>

              {/* POSISI YANG DIHINDARI */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>{t('cari_kerja.posisi_dihindari')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {form.excluded_positions.filter(p => p.trim()).map((p, i) => {
                    const origIdx = form.excluded_positions.findIndex((v, idx) => v === p && idx <= i)
                    return (
                      <span key={`${p}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        background: '#fff5f5', border: '2px solid #e74c3c', padding: '4px 8px',
                        fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
                        boxShadow: '2px 2px 0 var(--black)',
                        borderRadius: '999px',
                      }}>
                        {p}
                        <button onClick={() => removeTag('excluded_positions', origIdx)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#e74c3c', padding: 0, lineHeight: 1, marginLeft: '4px',
                        }} aria-label="Hapus">×</button>
                      </span>
                    )
                  })}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder={t('cari_kerja.tambah_posisi_dihindari')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag('excluded_positions', e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                    style={{
                      ...inputStyle,
                      width: '100%',
                    }}
                  />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6, marginTop: '8px' }}>
                  Bot akan melewatkan lowongan dengan posisi ini. Contoh: Admin, Sales, Internship.
                </p>
              </div>

              {/* PERUSAHAAN YANG DIHINDARI (v22) */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>{t('cari_kerja.perusahaan_dihindari')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {form.excluded_companies.filter(p => p.trim()).map((p, i) => {
                    const origIdx = form.excluded_companies.findIndex((v, idx) => v === p && idx <= i)
                    return (
                      <span key={`${p}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        background: '#fff5f5', border: '2px solid #e74c3c', padding: '4px 8px',
                        fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600,
                        boxShadow: '2px 2px 0 var(--black)',
                        borderRadius: '999px',
                      }}>
                        {p}
                        <button onClick={() => removeTag('excluded_companies', origIdx)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#e74c3c', padding: 0, lineHeight: 1, marginLeft: '4px',
                        }} aria-label="Hapus">×</button>
                      </span>
                    )
                  })}
                </div>
                <div>
                  <input
                    type="text"
                    placeholder={t('cari_kerja.tambah_perusahaan_dihindari')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag('excluded_companies', e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                    style={{
                      ...inputStyle,
                      width: '100%',
                    }}
                  />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6, marginTop: '8px' }}>
                  Bot akan melewatkan lowongan dari perusahaan ini. Contoh: PT ABC, Corp X.
                </p>
              </div>

              {/* Cover Letter di form tambah */}
              <div>
                <button
                  onClick={() => setForm(f => ({ ...f, showCoverLetter: !f.showCoverLetter }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: form.cover_letter ? 'var(--orange)' : 'white',
                    border: '2px solid var(--black)', cursor: 'pointer',
                    fontSize: '13px',
                    color: form.cover_letter ? 'white' : 'var(--black)',
                    fontFamily: 'var(--font-sans)', fontWeight: 700, padding: '6px 10px',
                    boxShadow: form.cover_letter ? '1px 1px 0 var(--black)' : '2px 2px 0 var(--black)',
                    borderRadius: '999px', minHeight: '42px',
                  }}
                >
                  <FileText size={12} />
                  {form.cover_letter ? `${t('cari_kerja.cover_letter')} ✓` : `TAMBAH ${t('cari_kerja.cover_letter')}`}
                </button>

                {form.showCoverLetter && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* v43: Tombol Buat Dengan AI di form tambah/edit target */}
                    <button
                      type="button"
                      onClick={generateCoverLetterFromCv}
                      disabled={!form.cv_id || generatingCoverLetter}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        background: (!form.cv_id || generatingCoverLetter) ? 'var(--gray-200)' : '#2980b9',
                        color: 'white', border: '2px solid var(--black)',
                        boxShadow: '2px 2px 0 var(--black)',
                        cursor: (!form.cv_id || generatingCoverLetter) ? 'not-allowed' : 'pointer',
                        opacity: (!form.cv_id || generatingCoverLetter) ? 0.6 : 1,
                        padding: '7px 10px', fontSize: '12px',
                        fontFamily: 'var(--font-sans)', fontWeight: 700,
                        borderRadius: '14px', minHeight: '44px',
                      }}
                    >
                      {generatingCoverLetter ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {generatingCoverLetter
                        ? (lang === 'id' ? 'MEMBUAT SURAT LAMARAN...' : 'CREATING COVER LETTER...')
                        : (lang === 'id' ? 'BUAT SURAT LAMARAN DARI CV (AI)' : 'CREATE COVER LETTER FROM CV (AI)')}
                    </button>
                    <div style={{
                      padding: '8px 10px',
                      background: '#fef9e7',
                      border: '1.5px solid #f39c12',
                      fontSize: '14px',
                      lineHeight: 1.7,
                      color: '#7d6608',
                      borderRadius: '14px',
                    }}>
                      {t('cari_kerja.info_cover')}
                    </div>
                    <textarea
                      value={form.cover_letter}
                      onChange={e => setForm(f => ({ ...f, cover_letter: e.target.value }))}
                      placeholder={lang === 'id' ? `Contoh:

Dear Hiring Manager at {company},

Saya tertarik melamar posisi {position} di {company}...` : `Example:

Dear Hiring Manager at {company},

I am interested in applying for the {position} role at {company}...`}
                      rows={8}
                      style={{
                        ...inputStyle,
                        fontSize: '14px',
                        fontFamily: 'var(--font-sans)',
                        lineHeight: 1.7,
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setOpen(false); setError(''); resetForm() }} className="btn-pixel-ghost">{t('cari_kerja.batal')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {loading ? <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('cari_kerja.memuat')}</p> :
         (Array.isArray(targets) ? targets : []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed var(--border)' }}>
            <Target size={24} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('cari_kerja.belum_target')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cvTargetGroups.map(group => {
              const positionTargets = [...group.positions.values()]
              const positionNames = positionTargets.flatMap(target => parsePositionsToList(target.position))
                .filter((position, index, all) => all.findIndex(item => normalizeKeyPart(item) === normalizeKeyPart(position)) === index)
              const readyCoverLetters = positionTargets.filter(target => Boolean(target.cover_letter?.trim())).length
              const coverLetterStatus = positionTargets.length > 0 && readyCoverLetters === positionTargets.length
                ? (lang === 'id' ? 'Semua surat lamaran siap' : 'All cover letters are ready')
                : readyCoverLetters > 0
                  ? (lang === 'id'
                      ? `${readyCoverLetters} dari ${positionTargets.length} surat lamaran siap`
                      : `${readyCoverLetters} of ${positionTargets.length} cover letters ready`)
                  : (lang === 'id' ? 'Surat lamaran belum dibuat' : 'Cover letters not created yet')

              return (
                <div key={group.cvId || group.cvName} className="card-pixel-sm" style={{ padding: '12px', background: 'var(--cream)' }}>
                  <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1.5px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', marginBottom: '7px' }}>
                          {lang === 'id' ? 'POSISI YANG DIINCAR' : 'TARGET POSITIONS'}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                          {positionNames.map(position => (
                            <span key={position} style={{
                              padding: '6px 10px', background: 'var(--orange)', color: 'white',
                              border: '2px solid var(--black)', borderRadius: '999px',
                              boxShadow: '2px 2px 0 var(--black)', fontSize: '14px', fontWeight: 900,
                            }}>
                              {position}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
                        {[...group.platforms].map(platform => (
                          <span key={platform} title={platformLabel(platform)} aria-label={platformLabel(platform)}>
                            <PlatformLogo platformId={platform} size={28} />
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px',
                      padding: '5px 9px', borderRadius: '999px', fontSize: '12px', fontWeight: 800,
                      color: readyCoverLetters ? '#176B3A' : 'var(--muted)',
                      background: readyCoverLetters ? '#E8F7EE' : '#EEEAE0',
                    }}>
                      {readyCoverLetters > 0 ? <Check size={13} strokeWidth={3} /> : <FileText size={13} />}
                      {coverLetterStatus}
                    </div>

                    <div style={{ display: 'grid', gap: '5px', marginTop: '9px', fontSize: '13px', color: 'var(--black-3)' }}>
                      <div><strong>CV:</strong> <span style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{group.cvName}</span></div>
                      <div><strong>{lang === 'id' ? 'Lokasi' : 'Locations'}:</strong> {[...group.locations].join(', ')}</div>
                      <div><strong>{lang === 'id' ? 'Tipe kerja' : 'Employment'}:</strong> {[...group.employmentTypes].map(employmentLabel).join(', ')}</div>
                      {(group.salaries.size > 0 || group.availableJoin.size > 0) && (
                        <div>
                          {group.salaries.size > 0 && <><strong>{t('cari_kerja.gaji')}:</strong> {[...group.salaries].join(', ')}</>}
                          {group.salaries.size > 0 && group.availableJoin.size > 0 && ' · '}
                          {group.availableJoin.size > 0 && <><strong>{t('cari_kerja.bergabung')}:</strong> {[...group.availableJoin].map(tj).join(', ')}</>}
                        </div>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {positionTargets.map(target => (
                        <button
                        type="button"
                        key={normalizeKeyPart(target.position)}
                        onClick={() => handleEdit(target)}
                        title={t('cari_kerja.klik_edit')}
                        style={{
                          padding: '7px 8px', background: 'white', border: '1px solid var(--border)', borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--black)', overflowWrap: 'anywhere' }}>
                          {target.position}
                        </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

// ── Persistent session state (survives tab switch) ────────────────────────────
const SESSION_KEY = 'ordal_session_state'

function loadSessionState() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
function saveSessionState(state) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch {}
}
function clearSessionState() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CariKerja() {
  const saved = loadSessionState()
  const navigate = useNavigate()
  const { t, lang } = useI18n()

  const [status,   setStatus]   = useState(saved?.status   ?? 'idle')
  const [counts,   setCounts]   = useState(saved?.counts   ?? { linkedin: 0, linkedin_posts: 0, jobstreet: 0 })
  const [jobMap,   setJobMap]   = useState(saved?.jobMap   ?? {})
  const [messages, setMessages] = useState(saved?.messages ?? [])
  const [sessionId, setSessionId] = useState(saved?.sessionId ?? null)
  const [error,    setError]    = useState('')
  const [pendingQuestion, setPendingQuestion] = useState(null)
  const answeredPromptIdsRef = useRef(new Set())
  const [promptAnswer, setPromptAnswer] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [showFinishModal, setShowFinishModal] = useState(false)

  const eventSourceRef = useRef(null)
  // (auto-scroll-to-bottom sudah dihapus per permintaan user, lihat komentar di bawah)

  // Persist state to sessionStorage whenever it changes
  useEffect(() => {
    saveSessionState({ status, counts, jobMap, messages, sessionId })
  }, [status, counts, jobMap, messages, sessionId])

  const total    = counts.linkedin + counts.linkedin_posts + counts.jobstreet
  const isRunning = status === 'running'

  // Sebelumnya ada auto-scroll ke bawah tiap jobMap berubah (tiap ada lowongan
  // baru), jadi posisi scroll user kepaksa balik ke bawah terus-terusan tiap
  // ada update. Dihapus — lowongan baru sekarang muncul di ATAS (lihat urutan
  // `jobs` di bawah), jadi user yang lagi baca di bawah nggak keganggu.

  // Re-attach SSE if bot was running when user switched tabs
  useEffect(() => {
    if (status === 'running' && !eventSourceRef.current) {
      startSSE()
    }
    return () => eventSourceRef.current?.close()
  }, [])

  const startSSE = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close()
    const isAppMode = import.meta.env.VITE_APP_MODE === '1'
    const token = localStorage.getItem('token')
    const liveUrl = isAppMode ? '/api/sessions/live' : `/api/sessions/live?token=${token}`
    const es = new EventSource(liveUrl)

    es.onmessage = e => {
      const event = JSON.parse(e.data)
      if (event.type === 'heartbeat') return

      if (event.type === 'applied' || event.type === 'found') {
        const jobId = stableJobKey(event)
        setJobMap(prev => {
          const existing = prev[jobId] || {
            job_id: jobId,
            job_title: event.job_title,
            company: event.company,
            location: event.job_location || event.location,
            salary: event.salary,
            platform: event.platform,
            steps: {},
            messages: {},
            firstSeen: Date.now(),
          }
          if (!existing.resultType) {
            setCounts(c => ({ ...c, [event.platform]: (c[event.platform] || 0) + 1 }))
          }
          return {
            ...prev,
            [jobId]: {
              ...existing,
              platform: event.platform,
              resultType: event.type,
              job_title: event.job_title || existing.job_title,
              company: event.company || existing.company,
              location: event.job_location || event.location || existing.location,
              salary: event.salary || existing.salary,
              notes: event.question_answers || event.skip_reason || existing.notes,
              steps: {
                ...existing.steps,
                analisis: 'ok',
                kesesuaian: 'ok',
                duplikat: 'ok',
                apply: 'ok',
              },
              messages: {
                ...existing.messages,
                apply: event.type === 'found' ? 'Prospek dari LinkedIn post ditemukan.' : 'Lamaran terkirim.',
              },
            },
          }
        })
      }

      if (event.type === 'skipped' || event.type === 'failed') {
        const jobId = stableJobKey(event)
        setJobMap(prev => {
          const existing = prev[jobId] || {
            job_id: jobId,
            job_title: event.job_title,
            company: event.company,
            location: event.job_location || event.location,
            salary: event.salary,
            platform: event.platform,
            steps: {},
            messages: {},
            firstSeen: Date.now(),
          }
          const reason = (event.skip_reason || '').toLowerCase()
          const duplicateSkip = event.type === 'skipped' && (reason.includes('duplikat') || reason.includes('sudah') || reason.includes('dilamar'))
          const applyStatus = event.type === 'failed' ? 'fail' : 'skip'
          return {
            ...prev,
            [jobId]: {
              ...existing,
              platform: event.platform,
              resultType: event.type,
              job_title: event.job_title || existing.job_title,
              company: event.company || existing.company,
              location: event.job_location || event.location || existing.location,
              salary: event.salary || existing.salary,
              steps: {
                ...existing.steps,
                analisis: 'ok',
                ...(duplicateSkip ? { duplikat: 'skip' } : { apply: applyStatus }),
              },
              messages: {
                ...existing.messages,
                ...(duplicateSkip
                  ? { duplikat: event.skip_reason || t('cari_kerja.sudah_dilamar') }
                  : { apply: event.skip_reason || (event.type === 'failed' ? t('log.gagal_apply') : t('log.dilewati')) }),
              },
            },
          }
        })
      }

      if (event.type === 'progress') {
        const { job_id, job_title, company, location, salary, step, status: stepStatus, message, platform, matched_position } = event
        const stableKey = stableJobKey(event)
        setJobMap(prev => {
          const ex = prev[stableKey] || (job_id && prev[job_id]) || { job_id: stableKey, job_title, company, location, salary, platform, steps: {}, messages: {} }
          const next = { ...prev }
          if (job_id && job_id !== stableKey) delete next[job_id]
          const inferredSteps = {}
          if (['kesesuaian', 'duplikat', 'apply'].includes(step)) inferredSteps.analisis = 'ok'
          if (['duplikat', 'apply'].includes(step)) inferredSteps.kesesuaian = ex.steps?.kesesuaian === 'skip' ? 'skip' : 'ok'
          if (step === 'apply') inferredSteps.duplikat = ex.steps?.duplikat === 'skip' ? 'skip' : 'ok'
          return { ...next, [stableKey]: {
            ...ex,
            job_id: stableKey,
            job_title: job_title || ex.job_title,
            company: company || ex.company,
            location: location || ex.location,
            salary: salary || ex.salary,
            platform: platform || ex.platform,
            steps:    { ...ex.steps, ...inferredSteps, [step]: stepStatus },
            messages: { ...ex.messages, [step]: message || '' },
            matched_position: matched_position || ex.matched_position,
          }}
        })
      }

      if (event.type === 'status') {
        setMessages(m => [...m, { text: formatStatusMessage(event.message), platform: event.platform, time: new Date().toLocaleTimeString('id-ID') }].slice(-15))
      }

      if (event.type === 'error') {
        setMessages(m => [...m, { text: event.message, platform: event.platform, isError: true, time: new Date().toLocaleTimeString('id-ID') }].slice(-15))
      }

      if (event.type === 'found_job') {
        // Lowongan ditemukan — tampilkan di log dengan detail lengkap
        // (perusahaan, posisi, lokasi, gaji). JobCard akan muncul di panel
        // proses dengan step "pending" sampai event progress datang.
        const jobId = stableJobKey(event)
        const salaryText = event.salary ? ` · Gaji: ${event.salary}` : ''
        setMessages(m => [...m, {
          text: `Ditemukan: ${event.job_title} @ ${event.company}${event.location ? ` · ${event.location}` : ''}${salaryText}`,
          platform: event.platform,
          time: new Date().toLocaleTimeString('id-ID'),
        }].slice(-30))
        // v43 FIX: cek dulu apakah job sudah ada di jobMap, untuk hindari
        // double-count di counter (sebelumnya setCounts selalu jalan meski
        // job sudah ada di map → counter jadi double/lebih).
        const jobAlreadyExists = jobMap[jobId] || !event.job_id
        if (!jobAlreadyExists) {
          setCounts(c => ({ ...c, [event.platform]: (c[event.platform] || 0) + 1 }))
        }
        // Tambahkan JobCard awal (pending) supaya user lihat lowongan masuk antrian
        setJobMap(prev => {
          if (prev[jobId]) return prev  // sudah ada, jangan overwrite
          if (!event.job_id) return prev
          return {
            ...prev,
            [jobId]: {
              job_id: jobId,
              job_title: event.job_title,
              company: event.company,
              location: event.location,
              firstSeen: Date.now(),
              salary: event.salary,
              platform: event.platform,
              steps: {},
              messages: {},
            },
          }
        })
      }

      if (event.type === 'question_prompt') {
        if (answeredPromptIdsRef.current.has(event.prompt_id)) {
          // Prompt ini sudah pernah dijawab sebelumnya (misal ke-replay ulang
          // gara-gara SSE reconnect) — jangan tampilkan popup lagi.
        } else {
          setPendingQuestion(event)
          setPromptAnswer('')
          setMessages(m => [...m, { text: `Butuh jawaban: ${event.question}`, platform: event.platform, time: new Date().toLocaleTimeString('id-ID') }].slice(-15))
        }
      }

      // ⚠️ Saat jawaban dikirim dari Telegram (klik inline keyboard bot),
      // backend emit event 'question_answered'. Frontend harus dismiss popup
      // yang sedang ditampilkan kalau prompt_id cocok — sebelumnya popup
      // tetap muncul selamanya walaupun jawaban sudah diproses bot dari sisi
      // Telegram, jadi user bingung kenapa "tidak ada feedback ke app".
      if (event.type === 'question_answered') {
        answeredPromptIdsRef.current.add(event.prompt_id)
        setPendingQuestion(prev => {
          if (prev && prev.prompt_id === event.prompt_id) {
            const viaText = event.source === 'telegram' ? ' (via Telegram)' : ''
            setMessages(m => [...m, { text: `✅ Jawaban diterima${viaText}: ${event.answer}`, platform: prev.platform, time: new Date().toLocaleTimeString('id-ID') }].slice(-15))
            return null
          }
          return prev
        })
        setPromptAnswer('')
      }

      if (event.type === 'done') {
        setStatus(event.reason === 'stopped' ? 'stopped' : 'done')
        setShowFinishModal(true)
        es.close()
        eventSourceRef.current = null
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      setStatus(s => s === 'running' ? 'done' : s)
    }

    eventSourceRef.current = es
  }, [])

  useEffect(() => {
    if (status !== 'running') return
    const timer = setInterval(async () => {
      try {
        const res = await api.get('/sessions/history')
        const sessions = Array.isArray(res.data) ? res.data : []
        const current = sessionId ? sessions.find(s => Number(s.id) === Number(sessionId)) : sessions[0]
        if (!current || current.status === 'running') return
        setStatus(current.status === 'stopped' ? 'stopped' : 'done')
        setShowFinishModal(true)
        eventSourceRef.current?.close()
        eventSourceRef.current = null
      } catch (_) {}
    }, 3000)
    return () => clearInterval(timer)
  }, [status, sessionId])

  const handleStart = async () => {
    setError('')
    setJobMap({})
    setMessages([])
    setCounts({ linkedin: 0, linkedin_posts: 0, jobstreet: 0 })
    setSessionId(null)
    setShowFinishModal(false)
    setStatus('running')
    clearSessionState()
    // v3.1 — guard lisensi: klik "Cari Kerja" pertama kali = mulai trial 3 hari.
    // Trial habis & belum aktivasi → pop-up pembayaran muncul, sesi tidak jalan.
    try {
      const allowed = await useLicenseStore.getState().startTrial()
      if (!allowed) {
        setStatus('idle')
        return
      }
    } catch {
      /* lanjut — backend tetap guard di /sessions/start */
    }
    try {
      const res = await api.post('/sessions/start')
      setSessionId(res.data.session_id)
      startSSE()
    } catch (err) {
      setStatus('idle')
      const detail = err.response?.data?.detail
      if (detail?.code === 'TRIAL_EXPIRED') return  // pop-up pembayaran sudah dibuka interceptor/store
      setError(typeof detail === 'string' ? detail : t('cari_kerja.gagal_memulai'))
    }
  }

  const handleStop = async () => {
    try { await api.post('/sessions/stop') } catch {}
    setStatus('stopped')
    setShowFinishModal(true)
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }

  const submitPromptAnswer = async () => {
    if (!pendingQuestion || !promptAnswer.trim()) return
    if (promptKind(pendingQuestion) === 'number' && !/^\d+(?:[.,]\d+)?$/.test(promptAnswer.trim())) {
      setError(t('cari_kerja.jawaban_harus_angka_msg'))
      return
    }
    setPromptSaving(true)
    setError('')
    try {
      await api.post(`/questions/prompts/${pendingQuestion.prompt_id}/answer`, { answer: promptAnswer.trim() })
      answeredPromptIdsRef.current.add(pendingQuestion.prompt_id)
      setMessages(m => [...m, { text: t('cari_kerja.jawaban_tersimpan_msg'), platform: pendingQuestion.platform, time: new Date().toLocaleTimeString('id-ID') }].slice(-15))
      setPendingQuestion(null)
      setPromptAnswer('')
    } catch (err) {
      setError(err.response?.data?.detail || t('cari_kerja.gagal_kirim_jawaban'))
    } finally {
      setPromptSaving(false)
    }
  }

  // ── Urutan log proses: NEWEST SELALU di ATAS (murni descending) ────────
  // User request v12: "harusnya urutan log process itu descending yang baru
  // akan muncul diatas bukan dibawah, jadi loker lama akan kegeser loker baru
  // yang muncul diatasnya lalu kegeser lagi loker yang lebih baru diatasnya
  // dan seterusnya"
  //
  // Sebelumnya (v9): grouping by status (inProgress → found → skipped → applied)
  // + sort by newest dalam tiap group. User bilang MASIH salah karena job yang
  // applied tetap "nempel" di grup applied, padahal user mau job baru SELALU
  // di atas walau statusnya applied/skip/found.
  //
  // Sekarang: sort MURNI by firstSeen DESCENDING. TANPA grouping by status.
  // Job yang baru ketemu SELALU di atas. Job lama kegeser ke bawah otomatis.
  // Status (APPLIED/PROSPEK/PROSES/SKIP) cuma jadi badge di card, bukan
  // penentu urutan.
  const jobs = Object.values(jobMap)
  const byNewest = (a, b) => (b.firstSeen || 0) - (a.firstSeen || 0)
  const renderOrder = [...jobs].sort(byNewest)

  // Hitung count per status untuk badge di header panel (tidak dipakai untuk
  // urutan render, hanya untuk counter).
  const applied    = jobs.filter(j => j.steps?.apply === 'ok' && j.resultType !== 'found')
  const found      = jobs.filter(j => j.resultType === 'found')
  const inProgress = jobs.filter(j => !j.steps?.apply && j.steps?.kesesuaian !== 'skip' && j.resultType !== 'found')
  const skipped    = jobs.filter(j => (j.steps?.kesesuaian === 'skip' || j.steps?.apply === 'fail') && j.resultType !== 'found')

  const statusLabel = {
    idle:    t('log.standby'),
    running: t('page.cari_kerja.running'),
    done:    lang === 'id' ? 'SELESAI' : 'DONE',
    stopped: lang === 'id' ? 'DIHENTIKAN' : 'STOPPED',
  }
  const statusColor = { idle: 'var(--muted)', running: 'var(--orange)', done: '#27ae60', stopped: '#e74c3c' }

  return (
    <div className="main-scroll">
      {/* Header dengan tombol Start + Stop berdampingan */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{t('page.cari_kerja.title')}</h1>
          <p>{t('page.cari_kerja.desc')}</p>
          {/* Running bar di header dihapus — cukup 1 progress bar di panel proses
              (sebelumnya ada 2 bar progress yang redundan, user lihat dobel). */}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Status pill "RUNNING" di header dihapus (v10) — cukup 1 di status bar
              panel kiri. Sebelumnya ada 2: pill orange di header + bar status di
              panel kiri, keduanya nunjukin "RUNNING" + total. User bilang dobel. */}
          {/* v3.1: badge trial countdown / PRO di header */}
          <TrialBadge variant="inline" />
          {/* Tombol Cari Kerja / Jalankan */}
          <button
            id="start-job-search-button"
            onClick={handleStart}
            disabled={isRunning}
            className={`btn btn-primary${status === 'idle' ? ' start-button-ready' : ''}`}
            style={{
              padding: '10px 18px', fontSize: 14,
              opacity: isRunning ? 0.5 : 1,
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
            title={isRunning ? t('page.cari_kerja.bot_running') : t('page.cari_kerja.start_tooltip')}
          >
            <Zap size={14} fill="white" /> {status === 'idle' ? t('page.cari_kerja.start') : t('page.cari_kerja.run_again')}
          </button>
          {/* Tombol Stop — selalu tampil, tapi disabled saat tidak running. Merah solid + pulse saat running. */}
          <button
            onClick={handleStop}
            disabled={!isRunning}
            className={`btn btn-danger${isRunning ? ' btn-danger-active' : ''}`}
            style={{
              padding: '10px 18px', fontSize: 14,
              opacity: !isRunning ? 0.5 : 1,
              cursor: !isRunning ? 'not-allowed' : 'pointer',
            }}
            title={isRunning ? t('page.cari_kerja.stop_tooltip') : t('page.cari_kerja.no_process')}
          >
            <Square size={14} fill="currentColor" /> {t('page.cari_kerja.stop')}
          </button>
        </div>
      </div>

      {status === 'idle' && (
        <div className="ready-to-search-card" role="status" aria-describedby="start-job-search-button">
          <div className="ready-to-search-icon"><Sparkles size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{lang === 'id' ? 'Selamat, persiapanmu sudah selesai!' : 'Congratulations, your setup is complete!'}</strong>
            <p>
              {lang === 'id'
                ? 'Klik tombol Cari Kerja berwarna oranye di kanan atas untuk memulai. Setelah itu, kamu tinggal santai dan biarkan ORDAL bekerja.'
                : 'Click the orange Find Jobs button at the top right to begin. Then relax and let ORDAL do the work.'}
            </p>
          </div>
          <div className="ready-to-search-pointer">
            <ArrowUpRight size={18} />
            <span>{lang === 'id' ? 'Mulai di sini' : 'Start here'}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {pendingQuestion && (
        (() => {
          const kind = promptKind(pendingQuestion)
          const options = promptOptions(pendingQuestion)
          const fieldStyle = {
            border: '2px solid var(--black)', background: 'white', padding: '9px 10px',
            fontSize: '14px', outline: 'none', fontFamily: 'var(--font-sans)',
            lineHeight: 1.4, marginBottom: '12px', width: kind === 'number' ? '220px' : '100%',
          }
          return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div className="card-pixel" style={{ width: 'min(560px, 100%)', background: '#F4F2EC', padding: '18px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <HelpCircle size={22} style={{ color: 'var(--orange)', flexShrink: 0 }} />
              <div>
                <p className="font-pixel" style={{ fontSize: '13px', color: 'var(--black)', marginBottom: '6px' }}>PERTANYAAN BUTUH JAWABAN</p>
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  {pendingQuestion.platform} · {pendingQuestion.job_title || 'Lamaran kerja'} · {pendingQuestion.field_type || 'text'}
                </p>
              </div>
            </div>
            <div style={{ padding: '12px', background: 'white', border: '2px solid var(--border)', marginBottom: '10px' }}>
              <p style={{ fontSize: '14px', color: 'var(--black)', lineHeight: 1.7 }}>{promptQuestionText(pendingQuestion)}</p>
            </div>
            {kind === 'yes_no' ? (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {['Yes', 'No'].map(v => (
                  <button key={v} onClick={() => setPromptAnswer(v)} className="btn-pixel" style={promptAnswer === v ? { background: '#27ae60', borderColor: '#1e8449' } : {}}>
                    {v}
                  </button>
                ))}
              </div>
            ) : kind === 'dropdown' ? (
              <select
                autoFocus
                value={promptAnswer}
                onChange={e => setPromptAnswer(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Pilih jawaban</option>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : kind === 'textarea' ? (
              <textarea
                autoFocus
                value={promptAnswer}
                onChange={e => setPromptAnswer(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitPromptAnswer()
                }}
                rows={5}
                placeholder="Tulis jawaban. Jawaban ini disimpan untuk pertanyaan serupa berikutnya."
                style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.7 }}
              />
            ) : (
              <input
                autoFocus
                type={kind === 'number' ? 'number' : 'text'}
                inputMode={kind === 'number' ? 'numeric' : 'text'}
                value={promptAnswer}
                onChange={e => setPromptAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitPromptAnswer()
                }}
                placeholder={kind === 'number' ? 'Angka saja' : 'Tulis jawaban'}
                style={fieldStyle}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={submitPromptAnswer} disabled={promptSaving || !promptAnswer.trim()} className="btn-pixel">
                <Save size={13} /> {promptSaving ? 'MENGIRIM...' : 'KIRIM JAWABAN'}
              </button>
            </div>
          </div>
        </div>
          )
        })()
      )}

      {showFinishModal && ['done', 'stopped'].includes(status) && (
        <FinishModal
          jobs={jobs}
          sessionId={sessionId}
          status={status}
          lang={lang}
          onClose={() => setShowFinishModal(false)}
          onHistory={() => navigate('/riwayat-lamaran')}
        />
      )}

      <LeftRightSyncedGrid
        left={
          <>
            {/* Status bar */}
            <div className="card-pixel" style={{ padding: '14px 16px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="font-pixel" style={{ fontSize: '13px', color: statusColor[status] }}>
                    {isRunning && <span className="animate-blink">▶ </span>}
                    {statusLabel[status]}
                  </span>
                  {sessionId && <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{lang === 'id' ? `sesi #${sessionId}` : `session #${sessionId}`}</span>}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {/* Counter per-platform saja — TOTAL dihapus (v10) karena
                      redundant dengan badge APPLIED/PROSPEK/PROSES/SKIP di
                      panel kanan yang sudah show total per status. Sebelumnya
                      ada 2 "total": counter TOTAL di sini + sum badge di kanan. */}
                  {[
                    { label: 'LI', val: counts.linkedin + counts.linkedin_posts, color: '#2980b9' },
                    { label: 'JS', val: counts.jobstreet, color: 'var(--orange)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <p className="font-pixel" style={{ fontSize: '14px', color }}>{val}</p>
                      <p style={{ fontSize: '14px', color: 'var(--muted)', fontFamily: 'var(--font-sans)' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {isRunning && (
                <div className="progress-bar-track" style={{ marginBottom: '10px' }}>
                  <div className="progress-bar-fill" />
                </div>
              )}
              {/* Activity log — height FIXED dari awal (bukan maxHeight yang menyusut
                  kalau pesannya masih sedikit), supaya ukurannya konsisten. */}
              <div style={{ height: '200px', overflowY: 'auto', overflowX: 'hidden' }}>
                {messages.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>
                    {isRunning ? '...' : t('page.cari_kerja.press_start')}
                  </p>
                ) : (
                  messages.slice(-20).reverse().map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '3px', minWidth: 0 }}>
                      <span style={{ fontSize: '14px', color: 'var(--muted)', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>{m.time}</span>
                      <span title={m.text} style={{ fontSize: '13px', color: m.isError ? '#e74c3c' : 'var(--black-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.platform && <b>[{m.platform}] </b>}{m.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Targets */}
            <TargetPanel isRunning={isRunning} />
          </>
        }
        right={
          <>
            <div style={{ padding: '10px 14px', borderBottom: '2px solid var(--black)', background: 'var(--black)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="font-pixel" style={{ fontSize: '14px', color: 'white' }}>{t('cari_kerja.log_proses')}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {applied.length > 0    && <span style={{ fontSize: '14px', padding: '2px 7px', background: '#27ae60', color: 'white', border: '1.5px solid #1e8449' }}>{applied.length} {t('log.status_applied')}</span>}
                {found.length > 0      && <span style={{ fontSize: '14px', padding: '2px 7px', background: '#2980b9', color: 'white', border: '1.5px solid #1f5f8d' }}>{found.length} {t('log.status_prospek')}</span>}
                {inProgress.length > 0 && <span style={{ fontSize: '14px', padding: '2px 7px', background: 'var(--orange)', color: 'white', border: '1.5px solid var(--orange-2)' }}>{inProgress.length} {t('log.status_proses')}</span>}
                {skipped.length > 0    && <span style={{ fontSize: '14px', padding: '2px 7px', background: 'var(--border)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>{skipped.length} {t('log.status_skip')}</span>}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {jobs.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '60px' }}>
                  <Zap size={28} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
                  <p className="font-pixel" style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 2 }}>
                    {t('cari_kerja.empty_jobs_title').split(' ').map((word, i) => (
                      <span key={i} style={{ display: 'block' }}>{word}</span>
                    ))}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '8px' }}>
                    {t('cari_kerja.empty_jobs_desc')}
                  </p>
                </div>
              ) : (
                <>
                  {renderOrder.map(j => <JobCard key={j.job_id} job={j} />)}
                </>
              )}
            </div>
          </>
        }
      />
    </div>
  )
}

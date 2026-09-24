import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, ArrowRight, ArrowLeft, FileText, Upload, CheckCircle2, Eye,
  Briefcase, MapPin, Wallet, CalendarClock, Building2, Ban, Sparkles,
  Mail, Globe, ExternalLink, PartyPopper, RefreshCw, AlertCircle, ChevronDown,
  UserRound, ShieldCheck, Compass,
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useI18n from '../../stores/i18nStore'
import api from '../../api'
import { PlatformLogo, LinkedInLogo, JobStreetLogo } from '../brand'
import ChipsInput from './ChipsInput'
import CoverLetterExampleModal from './CoverLetterExampleModal'

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingWizard — wizard pop-up interaktif setelah login + verifikasi.
// Langkah: 1) Upload CV  2) Preferensi kerja  3) Cover letter (lihat contoh
// {company}/{position})  4) Pilih job platform  5) Email (wajib utk LinkedIn
// Posts)  6) Login job platform (wajib min. satu) → selesai.
// Progress tersimpan di SQLite lokal per device.
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_CARDS = [
  { id: 'jobstreet', name: 'JobStreet' },
  { id: 'linkedin_jobs', name: 'LinkedIn Jobs' },
  { id: 'linkedin_posts', name: 'LinkedIn Posts' },
]

const EMPLOYMENT_TYPES = [
  { id: 'full_time', label: 'full_time' },
  { id: 'contract', label: 'contract' },
  { id: 'intern', label: 'intern' },
]

const JOIN_OPTIONS = ['immediately', '2_weeks', '1_month', 'more_than_1_month']

export default function OnboardingWizard() {
  const { t, lang } = useI18n()
  const { onboarding, setOnboarding } = useAuthStore()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState('')
  const [showExample, setShowExample] = useState(false)
  const [welcomePhase, setWelcomePhase] = useState('name')
  const [preferredName, setPreferredName] = useState('')

  // data wizard
  const [cvId, setCvId] = useState(null)
  const [cvs, setCvs] = useState([])
  const [prefs, setPrefs] = useState({
    preferred_name: '', welcome_completed: false,
    positions: [], locations: [], expected_salary: '',
    available_join: 'immediately', employment_type: 'full_time',
    excluded_positions: [], excluded_companies: [],
  })
  const [coverLetter, setCoverLetter] = useState('')
  const [platforms, setPlatforms] = useState([])
  const [platformLogins, setPlatformLogins] = useState({ linkedin: false, jobstreet: false })
  const [emailConnected, setEmailConnected] = useState(false)
  const [grabbingPlatform, setGrabbingPlatform] = useState(null)
  const pollRef = useRef(null)

  const needsEmailStep = platforms.includes('linkedin_posts')
  const steps = [
    { n: 1, key: 'onb.step_cv' },
    { n: 2, key: 'onb.step_prefs' },
    { n: 3, key: 'onb.step_cover' },
    { n: 4, key: 'onb.step_platforms' },
    ...(needsEmailStep ? [{ n: 5, key: 'onb.step_email' }] : []),
    { n: 6, key: 'onb.step_login' },
  ]
  const maxStep = needsEmailStep ? 6 : 6 // langkah 5 dilewati kalau tak perlu email

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/onboarding/status')
      const d = res.data
      setCvId(d.cv_id)
      setCvs(d.cvs || [])
      const loadedPrefs = d.preferences || {}
      setPrefs((p) => ({ ...p, ...loadedPrefs }))
      setPreferredName(loadedPrefs.preferred_name || '')
      setWelcomePhase(loadedPrefs.welcome_completed ? 'wizard' : (loadedPrefs.preferred_name ? 'hello' : 'name'))
      setCoverLetter(d.cover_letter || '')
      setPlatforms(d.platforms || [])
      setPlatformLogins(d.platform_logins || {})
      setEmailConnected(d.email_connected)
      setStep(Math.min(d.current_step || 1, 6))
    } catch (e) {
      setError(t('onb.err_load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  // ── simpan progress ke database lokal ──
  const save = async (stepNum, extra = {}) => {
    setSaving(true)
    try {
      await api.post('/onboarding/save', {
        step: stepNum,
        cv_id: cvId,
        preferences: prefs,
        cover_letter: coverLetter,
        platforms,
        ...extra,
      })
    } catch (e) {
      // tidak fatal — lanjut UI
    } finally {
      setSaving(false)
    }
  }

  const rememberName = async () => {
    const name = preferredName.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!name) {
      setError(t('onb.name_error'))
      return
    }
    const nextPrefs = { ...prefs, preferred_name: name }
    setPreferredName(name)
    setPrefs(nextPrefs)
    setError('')
    await save(1, { preferences: nextPrefs })
    setWelcomePhase('hello')
  }

  const beginSetup = async () => {
    const nextPrefs = { ...prefs, preferred_name: preferredName, welcome_completed: true }
    setPrefs(nextPrefs)
    await save(1, { preferences: nextPrefs })
    setWelcomePhase('wizard')
  }

  const refreshLogins = async () => {
    try {
      const res = await api.get('/credentials/status')
      const d = res.data?.platforms || res.data || {}
      // format lama: { linkedin: { logged_in }, jobstreet: { logged_in } } — cek dua-duanya
      const li = d.linkedin?.logged_in ?? d.linkedin ?? false
      const js = d.jobstreet?.logged_in ?? d.jobstreet ?? false
      setPlatformLogins({ linkedin: !!li, jobstreet: !!js })
      return { linkedin: !!li, jobstreet: !!js }
    } catch (e) {
      return platformLogins
    }
  }

  // ── validasi per langkah ──
  const validate = (n) => {
    if (n === 1 && !cvId) return t('onb.err_cv')
    if (n === 2) {
      if (!prefs.positions.length) return t('onb.err_positions')
      if (!prefs.locations.length) return t('onb.err_locations')
    }
    if (n === 3 && coverLetter.trim().length < 50) return t('onb.err_cover')
    if (n === 4 && !platforms.length) return t('onb.err_platforms')
    return ''
  }

  const next = async () => {
    const err = validate(step)
    if (err) { setError(err); return }
    setError('')
    await save(step)
    let target = step + 1
    if (target === 5 && !needsEmailStep) target = 6
    if (target === 6) {
      await refreshLogins()
    }
    setStep(Math.min(target, 6))
  }

  const back = () => {
    setError('')
    let target = step - 1
    if (step === 6 && !needsEmailStep) target = 4
    setStep(Math.max(target, 1))
  }

  const finish = async () => {
    const logins = await refreshLogins()
    if (!logins.linkedin && !logins.jobstreet) {
      setError(t('onb.err_login_required'))
      return
    }
    setFinishing(true)
    setError('')
    try {
      await save(6)
      const res = await api.post('/onboarding/complete')
      if (res.data?.ok) {
        // Tampilkan layar sukses dulu — store baru di-set saat user klik
        // "Mulai Pakai ORDAL" (atau saat app dibuka ulang).
        setStep(7)
      }
    } catch (e) {
      const msg = e.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('onb.err_finish'))
    } finally {
      setFinishing(false)
    }
  }

  // ── upload CV ──
  const uploadCv = async (file, label) => {
    setError('')
    const fd = new FormData()
    fd.append('position_label', label || prefs.positions[0] || 'CV Utama')
    fd.append('file', file)
    setSaving(true)
    try {
      const res = await api.post('/cvs/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const d = res.data
      const newCv = {
        id: d.id,
        position_label: d.position_label || label,
        file_name: d.file_name || file.name,
        has_text: Boolean(d.has_text),
        cv_memory: d.cv_memory || {},
      }
      setCvs((c) => [newCv, ...c])
      setCvId(d.id)
    } catch (e) {
      const msg = e.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('onb.err_cv_upload'))
    } finally {
      setSaving(false)
    }
  }

  // ── login job platform (capture session browser) ──
  const grabPlatform = async (platform) => {
    setGrabbingPlatform(platform)
    setError('')
    try {
      await api.post(`/credentials/grab/${platform}`)
      // browser terbuka di device — poll status sampai logged_in
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const logins = await refreshLogins()
        if (logins[platform]) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setGrabbingPlatform(null)
        }
      }, 2500)
    } catch (e) {
      setGrabbingPlatform(null)
      const msg = e.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('onb.err_grab'))
    }
  }

  const togglePlatform = (id) => {
    setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  if (onboarding.completed && step !== 7) return null

  if (loading) {
    return (
      <main className="onboarding-shell">
        <div className="onboarding-journey-card">
          <Loader2 size={34} className="animate-spin" color="#F2661A" />
          <p>{t('onb.loading')}</p>
        </div>
      </main>
    )
  }

  if (welcomePhase !== 'wizard') {
    return (
      <WarmWelcome
        phase={welcomePhase}
        name={preferredName}
        setName={setPreferredName}
        onRememberName={rememberName}
        onNext={() => setWelcomePhase('intro')}
        onBegin={beginSetup}
        saving={saving}
        error={error}
        t={t}
      />
    )
  }

  // ── layar sukses ──
  if (step === 7) {
    const enterApp = (path) => {
      window.history.replaceState({}, '', path)
      setOnboarding({ completed: true, current_step: 7 })
    }
    return (
      <main className="onboarding-shell">
        <section className="onboarding-frame onboarding-complete" aria-labelledby="onboarding-complete-title">
          <div className="sticker-modal-header" style={{ textAlign: 'center', paddingBottom: 30 }}>
            <span className="deco-glyph animate-float" style={{ top: 20, left: 28, color: 'rgba(242,102,26,0.6)', fontSize: 26 }}>✦</span>
            <span className="deco-glyph animate-wiggle" style={{ bottom: 20, right: 30, color: 'rgba(244,242,236,0.25)', fontSize: 30 }}>✳</span>
            <div style={{
              width: 64, height: 64, margin: '4px auto 14px', background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <PartyPopper size={30} strokeWidth={2} />
            </div>
            <h2 id="onboarding-complete-title">{t('onb.done_title')}</h2>
            <p>{t('onb.done_sub')}</p>
          </div>
          <div className="sticker-modal-body" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 6 }}>
              {[
                { icon: FileText, text: t('onb.done_cv') },
                { icon: Briefcase, text: t('onb.done_prefs') },
                { icon: Globe, text: t('onb.done_platforms') },
                { icon: CheckCircle2, text: t('onb.done_login') },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <Icon size={16} color="#F2661A" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#33363F' }}>{text}</span>
                  <CheckCircle2 size={16} color="#1E9E3E" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </div>
              ))}
            </div>
            <div className="notice notice-info" style={{ marginTop: 14, textAlign: 'left' }}>
              <Sparkles size={17} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong style={{ display: 'block', marginBottom: 3 }}>{t('onb.ai_title')}</strong>
                {t('onb.ai_sub')}
              </span>
            </div>
          </div>
          <div className="sticker-modal-footer" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => enterApp('/ai')}
            >
              <Sparkles size={17} /> {t('onb.ai_setup')}
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => enterApp('/kerja')}
            >
              {t('onb.ai_skip')} <ArrowRight size={17} />
            </button>
          </div>
        </section>
      </main>
    )
  }

  const stepInfo = steps.find((s) => s.n === step)
  const progressPct = Math.round(((step - 1) / 5) * 100)

  return (
    <main className="onboarding-shell">
      <section className="onboarding-frame" aria-labelledby="onboarding-step-title">

        {/* Header + progress */}
        <div className="sticker-modal-header" style={{ paddingBottom: 20 }}>
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 34, height: 34, background: '#F2661A',
                border: '2px solid rgba(244,242,236,0.35)', borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: '-0.04em',
              }}>O</div>
              <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em' }}>ORDAL</div>
            </div>
            <div className="chip-sticker-dark" style={{ padding: '3px 12px', fontSize: 10.5 }}>
              {t('onb.step_of', { n: step > 5 && !needsEmailStep ? 5 : steps.findIndex((s) => s.n === step) + 1, total: needsEmailStep ? 6 : 5 })}
            </div>
          </div>
          <h2 id="onboarding-step-title" style={{ fontSize: 24 }}>{stepInfo ? t(stepInfo.key) : ''}</h2>
          <p>{t('onb.hello_title', { name: preferredName })}</p>
          <div style={{ marginTop: 12 }}>
            <div className="progress-determinate" style={{ background: 'rgba(244,242,236,0.25)', border: 'none' }}>
              <div className="progress-determinate-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="sticker-modal-body onboarding-body">
            <>
              {/* ── LANGKAH 1: Upload CV ── */}
              {step === 1 && (
                <StepCv
                  t={t} lang={lang} cvs={cvs} cvId={cvId} setCvId={setCvId}
                  onUpload={uploadCv} saving={saving}
                  positionLabel={prefs.positions[0] || ''}
                />
              )}

              {/* ── LANGKAH 2: Preferensi ── */}
              {step === 2 && (
                <StepPrefs t={t} lang={lang} prefs={prefs} setPrefs={setPrefs} />
              )}

              {/* ── LANGKAH 3: Cover letter ── */}
              {step === 3 && (
                <div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowExample(true)}>
                      <Eye size={14} /> {t('onb.view_example')}
                    </button>
                  </div>
                  <div className="notice notice-info" style={{ marginBottom: 14 }}>
                    <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12.5 }}>
                      {t('onb.cover_hint')} <b>{'{company}'}</b> & <b>{'{position}'}</b> {t('onb.cover_hint2')}
                    </span>
                  </div>
                  <textarea
                    className="textarea"
                    rows={9}
                    style={{ fontSize: 13.5, lineHeight: 1.7 }}
                    placeholder={t('onb.cover_ph')}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                  />
                  <div style={{ fontSize: 11.5, color: '#6B6E76', marginTop: 6, textAlign: 'right' }}>
                    {coverLetter.trim().length} {t('onb.chars')}
                  </div>
                </div>
              )}

              {/* ── LANGKAH 4: Pilih platform ── */}
              {step === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {PLATFORM_CARDS.map((p) => {
                    const active = platforms.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        className="card-flat"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                          textAlign: 'left', cursor: 'pointer',
                          background: active ? '#FEF0E7' : '#FFFFFF',
                          borderColor: active ? '#F2661A' : 'rgba(51,54,63,0.14)',
                          boxShadow: active ? '3px 3px 0 rgba(242,102,26,0.55)' : 'none',
                          transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                      >
                        <div style={{
                          width: 46, height: 46, borderRadius: 12, background: '#FFFFFF',
                          border: '2px solid #33363F', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <PlatformLogo platformId={p.id} size={26} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5, color: '#33363F' }}>
                            {t(`onb.platform_${p.id}`)}
                          </div>
                          <div style={{ fontSize: 12, color: '#6B6E76', marginTop: 2, lineHeight: 1.45 }}>
                            {t(`onb.platform_${p.id}_desc`)}
                          </div>
                        </div>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                          border: '2px solid ' + (active ? '#F2661A' : 'rgba(51,54,63,0.25)'),
                          background: active ? '#F2661A' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <CheckCircle2 size={15} color="#fff" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                  {platforms.includes('linkedin_posts') && (
                    <div className="notice notice-info" style={{ marginTop: 2 }}>
                      <Mail size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12.5 }}>{t('onb.posts_email_note')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── LANGKAH 5: Hubungkan email (LinkedIn Posts) ── */}
              {step === 5 && (
                <StepEmail t={t} emailConnected={emailConnected} setEmailConnected={setEmailConnected} setError={setError} />
              )}

              {/* ── LANGKAH 6: Login job platform ── */}
              {step === 6 && (
                <StepPlatformLogin
                  t={t} lang={lang} platformLogins={platformLogins}
                  grabbingPlatform={grabbingPlatform} onGrab={grabPlatform}
                />
              )}

              {error && (
                <div className="notice notice-error animate-shake" style={{ marginTop: 14 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13 }}>{error}</span>
                </div>
              )}
            </>
        </div>

        {/* Footer navigasi */}
        <div className="sticker-modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={back} disabled={step === 1 || loading}>
            <ArrowLeft size={15} /> {t('common.back')}
          </button>
          {step < 6 ? (
            <button className="btn btn-primary" onClick={next} disabled={loading || saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {t('common.next')} <ArrowRight size={15} />
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={finish} disabled={finishing}>
              {finishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {t('onb.finish')}
            </button>
          )}
        </div>
      </section>

      <CoverLetterExampleModal
        open={showExample}
        onClose={() => setShowExample(false)}
        onUse={(text) => { setCoverLetter(text); setShowExample(false) }}
      />
    </main>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Sambutan awal — full-screen, bukan modal.
// ═════════════════════════════════════════════════════════════════════════════

function WarmWelcome({ phase, name, setName, onRememberName, onNext, onBegin, saving, error, t }) {
  const content = {
    name: {
      icon: UserRound,
      title: t('onb.name_title'),
      sub: t('onb.name_sub'),
    },
    hello: {
      icon: Sparkles,
      title: t('onb.hello_title', { name }),
      sub: t('onb.hello_sub'),
    },
    intro: {
      icon: Compass,
      title: t('onb.intro_title'),
      sub: t('onb.intro_sub'),
    },
  }[phase]
  const Icon = content.icon

  return (
    <main className="onboarding-shell onboarding-welcome">
      <section className="onboarding-journey-card" aria-labelledby="welcome-journey-title">
        <div className="onboarding-orbit" aria-hidden="true">✦</div>
        <div className="onboarding-hero-icon"><Icon size={34} strokeWidth={2.1} /></div>
        <div className="onboarding-kicker">ORDAL · YOUR JOB SEARCH COMPANION</div>
        <h1 id="welcome-journey-title">{content.title}</h1>
        <p className="onboarding-lead">{content.sub}</p>

        {phase === 'name' && (
          <div className="onboarding-name-form">
            <label className="input-label" htmlFor="preferred-name">{t('onb.name_label')}</label>
            <input
              id="preferred-name"
              className="input onboarding-name-input"
              autoFocus
              maxLength={60}
              placeholder={t('onb.name_ph')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onRememberName() }}
            />
          </div>
        )}

        {phase === 'intro' && (
          <div className="onboarding-promise-grid">
            {[
              [FileText, t('onb.intro_cv')],
              [Briefcase, t('onb.intro_prefs')],
              [ShieldCheck, t('onb.intro_questions')],
            ].map(([ItemIcon, text]) => (
              <div className="onboarding-promise" key={text}>
                <ItemIcon size={20} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="notice notice-error"><AlertCircle size={15} /> {error}</div>}

        <button
          type="button"
          className="btn btn-primary btn-lg onboarding-journey-next"
          disabled={saving}
          onClick={phase === 'name' ? onRememberName : phase === 'hello' ? onNext : onBegin}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {phase === 'name' ? t('common.next') : phase === 'hello' ? t('common.next') : t('onb.lets_begin')}
          <ArrowRight size={17} />
        </button>
      </section>
    </main>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Langkah 1 — Upload CV
// ═════════════════════════════════════════════════════════════════════════════

function StepCv({ t, lang, cvs, cvId, setCvId, onUpload, saving, positionLabel }) {
  const [label, setLabel] = useState(positionLabel || '')
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const activeCv = cvs.find((cv) => cv.id === cvId)

  const pick = () => fileRef.current?.click()

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    onUpload(f, label || f.name.replace(/\.pdf$/i, ''))
    e.target.value = ''
  }

  return (
    <div>
      <div className="ats-guide" style={{ marginBottom: 18 }}>
        <div className="ats-guide-icon"><ShieldCheck size={21} /></div>
        <div>
          <strong>{t('onb.cv_ats_title')}</strong>
          <p>{t('onb.cv_ats_desc')}</p>
          <small><Sparkles size={13} /> {t('onb.cv_ai_tip')}</small>
        </div>
      </div>

      {/* Dropzone */}
      <div
        className="card-flat"
        style={{
          border: '2px dashed rgba(51,54,63,0.35)', background: 'rgba(255,255,255,0.7)',
          padding: '26px 20px', textAlign: 'center', cursor: 'pointer',
        }}
        onClick={pick}
      >
        <input
          ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={onFile}
        />
        {saving ? (
          <Loader2 size={30} className="animate-spin" color="#F2661A" style={{ margin: '0 auto 10px' }} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: '#F2661A',
            border: '2px solid #33363F', boxShadow: '3px 3px 0 #33363F',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', margin: '0 auto 12px',
          }}>
            <Upload size={22} strokeWidth={2.2} />
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: 14.5, color: '#33363F', marginBottom: 4 }}>
          {t('onb.cv_title')}
        </div>
        <div style={{ fontSize: 12.5, color: '#6B6E76' }}>
          {fileName || t('onb.cv_hint')}
        </div>
      </div>

      {/* Label posisi */}
      <div style={{ marginTop: 14 }}>
        <label className="input-label">{t('onb.cv_label')}</label>
        <input
          className="input"
          placeholder={t('onb.cv_label_ph')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      {/* Daftar CV */}
      {cvs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="label-chip" style={{ marginBottom: 8 }}>{t('onb.cv_list')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cvs.map((cv) => (
              <button
                key={cv.id}
                type="button"
                className="card-flat"
                onClick={() => setCvId(cv.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                  textAlign: 'left', cursor: 'pointer',
                  background: cvId === cv.id ? '#FEF0E7' : '#FFFFFF',
                  borderColor: cvId === cv.id ? '#F2661A' : 'rgba(51,54,63,0.14)',
                  boxShadow: cvId === cv.id ? '3px 3px 0 rgba(242,102,26,0.55)' : 'none',
                }}
              >
                <FileText size={17} color={cvId === cv.id ? '#F2661A' : '#6B6E76'} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#33363F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cv.position_label}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B6E76' }}>{cv.file_name}</div>
                </div>
                {cvId === cv.id && <CheckCircle2 size={17} color="#F2661A" strokeWidth={2.5} style={{ flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCv?.has_text ? (
        <div className="notice notice-success" style={{ marginTop: 14 }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{t('onb.cv_read_ok')}</span>
        </div>
      ) : null}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Langkah 2 — Preferensi kerja
// ═════════════════════════════════════════════════════════════════════════════

function Field({ icon: Icon, label, optional, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color="#F2661A" /> {label}
        {optional && <span className="opt">· optional</span>}
      </label>
      {children}
    </div>
  )
}

function StepPrefs({ t, lang, prefs, setPrefs }) {
  const up = (k, v) => setPrefs((p) => ({ ...p, [k]: v }))

  return (
    <div>
      <Field icon={Briefcase} label={t('onb.f_positions')}>
        <ChipsInput
          value={prefs.positions}
          onChange={(v) => up('positions', v)}
          placeholder={t('onb.f_positions_ph')}
          helper={t('onb.f_positions_help')}
        />
      </Field>

      <Field icon={MapPin} label={t('onb.f_locations')}>
        <ChipsInput
          value={prefs.locations}
          onChange={(v) => up('locations', v)}
          placeholder={t('onb.f_locations_ph')}
          helper={t('onb.f_locations_help')}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field icon={Wallet} label={t('onb.f_salary')}>
          <input
            className="input"
            placeholder={t('onb.f_salary_ph')}
            value={prefs.expected_salary}
            onChange={(e) => up('expected_salary', e.target.value)}
          />
        </Field>
        <Field icon={CalendarClock} label={t('onb.f_join')}>
          <div className="select-sticker-wrap">
            <select
              className="select select-sticker"
              value={prefs.available_join}
              onChange={(e) => up('available_join', e.target.value)}
            >
              {JOIN_OPTIONS.map((j) => (
                <option key={j} value={j}>{t(`onb.join_${j}`)}</option>
              ))}
            </select>
            <ChevronDown size={18} strokeWidth={3} />
          </div>
        </Field>
      </div>

      <Field icon={Briefcase} label={t('onb.f_type')}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EMPLOYMENT_TYPES.map((tp) => {
            const active = prefs.employment_type === tp.id
            return (
              <button
                key={tp.id}
                type="button"
                className="chip-sticker"
                onClick={() => up('employment_type', tp.id)}
                style={{
                  background: active ? '#F2661A' : '#FFFFFF',
                  color: active ? '#fff' : '#33363F',
                  borderColor: '#33363F',
                  padding: '8px 16px', fontSize: 12.5,
                }}
              >
                {t(`onb.type_${tp.id}`)}
              </button>
            )
          })}
        </div>
      </Field>

      <Field icon={Ban} label={t('onb.f_excl_pos')} optional>
        <ChipsInput
          value={prefs.excluded_positions}
          onChange={(v) => up('excluded_positions', v)}
          placeholder={t('onb.f_excl_pos_ph')}
        />
      </Field>

      <Field icon={Building2} label={t('onb.f_excl_co')} optional>
        <ChipsInput
          value={prefs.excluded_companies}
          onChange={(v) => up('excluded_companies', v)}
          placeholder={t('onb.f_excl_co_ph')}
        />
      </Field>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Langkah 5 — Hubungkan email (untuk LinkedIn Posts)
// ═════════════════════════════════════════════════════════════════════════════

function StepEmail({ t, emailConnected, setEmailConnected, setError }) {
  const [sender, setSender] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState(null)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put('/email', {
        smtp_host: 'smtp.gmail.com', smtp_port: 587,
        sender_email: sender, app_password: appPassword,
      })
      setEmailConnected(true)
    } catch (e) {
      const msg = e.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('onb.err_email_save'))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestOk(null)
    try {
      const res = await api.post('/email/test')
      setTestOk(res.data?.ok !== false)
    } catch (e) {
      setTestOk(false)
    } finally {
      setTesting(false)
    }
  }

  if (emailConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '14px 0' }}>
        <CheckCircle2 size={44} color="#1E9E3E" style={{ margin: '0 auto 12px' }} strokeWidth={2} />
        <div style={{ fontWeight: 800, fontSize: 15, color: '#33363F', marginBottom: 4 }}>{t('onb.email_ok')}</div>
        <p style={{ fontSize: 13, color: '#6B6E76', margin: 0 }}>{t('onb.email_ok_sub')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="notice notice-info" style={{ marginBottom: 16 }}>
        <Mail size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{t('onb.email_note')}</span>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="input-label">Gmail (sender)</label>
        <input
          className="input" type="email" placeholder="nama@gmail.com"
          value={sender} onChange={(e) => setSender(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 6 }}>
        <label className="input-label">{t('onb.email_app_pass')}</label>
        <input
          className="input" type="password" placeholder="abcd efgh ijkl mnop"
          value={appPassword} onChange={(e) => setAppPassword(e.target.value)}
        />
        <div className="input-help">
          {t('onb.email_app_pass_hint')}{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="link-sweep" style={{ fontWeight: 600 }}>
            myaccount.google.com/apppasswords <ExternalLink size={10} style={{ display: 'inline' }} />
          </a>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !sender || !appPassword}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          {t('onb.email_save')}
        </button>
        {emailConnected && (
          <button className="btn btn-secondary" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {t('onb.email_test')}
          </button>
        )}
      </div>
      {testOk === true && <div className="notice notice-success" style={{ marginTop: 12 }}>{t('onb.email_test_ok')}</div>}
      {testOk === false && <div className="notice notice-error" style={{ marginTop: 12 }}>{t('onb.email_test_fail')}</div>}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Langkah 6 — Login job platform (wajib minimal satu, lainnya bisa di-skip)
// ═════════════════════════════════════════════════════════════════════════════

function LoginCard({ t, platform, name, loggedIn, grabbing, onGrab, children }) {
  return (
    <div className="card-flat" style={{
      padding: '16px 18px',
      background: loggedIn ? '#E9F7EC' : '#FFFFFF',
      borderColor: loggedIn ? 'rgba(30,158,62,0.6)' : 'rgba(51,54,63,0.14)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: '#fff',
          border: '2px solid #33363F', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {platform === 'jobstreet' ? <JobStreetLogo size={28} /> : <LinkedInLogo size={26} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 14.5, color: '#33363F' }}>{name}</span>
            {loggedIn
              ? <span className="badge badge-success">{t('onb.logged_in')}</span>
              : <span className="badge badge-muted">{t('onb.not_logged_in')}</span>}
          </div>
          <div style={{ fontSize: 12, color: '#6B6E76', marginTop: 3, lineHeight: 1.45 }}>
            {children}
          </div>
        </div>
        {!loggedIn && (
          <button className="btn btn-primary btn-sm" onClick={() => onGrab(platform)} disabled={!!grabbing}>
            {grabbing === platform ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            {grabbing === platform ? t('onb.waiting_login') : t('onb.login_btn')}
          </button>
        )}
      </div>
      {grabbing === platform && (
        <div className="notice notice-info" style={{ marginTop: 12, marginBottom: 0 }}>
          <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5 }}>{t('onb.grab_hint')}</span>
        </div>
      )}
    </div>
  )
}

function StepPlatformLogin({ t, lang, platformLogins, grabbingPlatform, onGrab }) {
  return (
    <div>
      <div className="notice notice-info" style={{ marginBottom: 14 }}>
        <Globe size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5 }}>{t('onb.login_required_note')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <LoginCard
          t={t} platform="jobstreet" name="JobStreet"
          loggedIn={platformLogins.jobstreet}
          grabbing={grabbingPlatform} onGrab={onGrab}
        >
          {t('onb.login_jobstreet_desc')}
        </LoginCard>
        <LoginCard
          t={t} platform="linkedin" name="LinkedIn"
          loggedIn={platformLogins.linkedin}
          grabbing={grabbingPlatform} onGrab={onGrab}
        >
          {t('onb.login_linkedin_desc')}
        </LoginCard>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, ArrowRight, ArrowLeft, FileText, Upload, CheckCircle2, Eye,
  Briefcase, MapPin, Wallet, CalendarClock, Building2, Ban, Sparkles,
  Mail, Globe, ExternalLink, PartyPopper, RefreshCw, AlertCircle, ChevronDown,
  UserRound, ShieldCheck, Compass, Key, Save, Copy, Download,
} from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import useI18n from '../../stores/i18nStore'
import api from '../../api'
import { PlatformLogo, LinkedInLogo, JobStreetLogo } from '../brand'
import ChipsInput from './ChipsInput'
import { COVER_LETTER_EXAMPLE } from './CoverLetterExampleModal'
import { ProviderLogo, PROVIDER_GUIDES } from '../../pages/AI'

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
  { id: 'glints', name: 'Glints' },
  { id: 'indeed', name: 'Indeed' },
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
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false)
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
  const [platformLogins, setPlatformLogins] = useState({ linkedin: false, jobstreet: false, glints: false, indeed: false })
  const [emailConnected, setEmailConnected] = useState(false)
  const [grabbingPlatform, setGrabbingPlatform] = useState(null)
  const [aiProviders, setAiProviders] = useState([])
  const [selectedAi, setSelectedAi] = useState('')
  const [aiKey, setAiKey] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [savingAi, setSavingAi] = useState(false)
  const onboardingBodyRef = useRef(null)

  const needsEmailStep = platforms.includes('linkedin_posts')
  const steps = [
    { n: 1, key: 'onb.step_cv' },
    { n: 2, key: 'onb.step_prefs' },
    { n: 3, key: 'onb.step_platforms' },
    ...(needsEmailStep ? [{ n: 4, key: 'onb.step_email' }] : []),
    { n: 5, key: 'onb.step_ai' },
    { n: 6, key: 'onb.step_cover' },
  ]
  const finalStep = 6

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
      const savedStep = Number(d.current_step || 1)
      setStep(savedStep >= 6 ? 6 : savedStep === 4 ? 3 : Math.min(savedStep, 5))
    } catch (e) {
      setError(t('onb.err_load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.get('/ai_config').then((res) => {
      const providers = res.data?.providers || []
      setAiProviders(providers)
      setSelectedAi(res.data?.active || providers.find(provider => provider.configured)?.key || providers[0]?.key || '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const provider = aiProviders.find(item => item.key === selectedAi)
    if (provider?.key === 'custom') {
      setAiBaseUrl(provider.api_base || '')
      setAiModel(provider.model || '')
    }
  }, [selectedAi, aiProviders])

  useEffect(() => {
    onboardingBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [step, loading, welcomePhase])

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
      const gl = d.glints?.logged_in ?? d.glints ?? false
      const ind = d.indeed?.logged_in ?? d.indeed ?? false
      setPlatformLogins({ linkedin: !!li, jobstreet: !!js, glints: !!gl, indeed: !!ind })
      return { linkedin: !!li, jobstreet: !!js, glints: !!gl, indeed: !!ind }
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
    if (n === 3) {
      if (!platforms.length) return t('onb.err_platforms')
      const loginKeys = [...new Set(platforms.map(id => id.startsWith('linkedin_') ? 'linkedin' : id))]
      if (loginKeys.some(key => !platformLogins[key])) return t('onb.err_login_required')
    }
    if (n === 5 && !aiProviders.find(provider => provider.key === selectedAi)?.verified) return lang === 'id' ? 'Test koneksi AI yang kamu pilih sampai berhasil.' : 'Test your selected AI connection successfully.'
    if (n === 6 && coverLetter.trim().length < 50) return t('onb.err_cover')
    return ''
  }

  const next = async () => {
    const err = validate(step)
    if (err) { setError(err); return }
    setError('')
    await save(step)
    const index = steps.findIndex(item => item.n === step)
    setStep(steps[Math.min(index + 1, steps.length - 1)]?.n || finalStep)
  }

  const back = () => {
    setError('')
    const index = steps.findIndex(item => item.n === step)
    setStep(steps[Math.max(index - 1, 0)]?.n || 1)
  }

  const finish = async () => {
    const logins = await refreshLogins()
    const selectedLoginKeys = [...new Set(platforms.map(id => id.startsWith('linkedin_') ? 'linkedin' : id))]
    if (!selectedLoginKeys.length || selectedLoginKeys.some(key => !logins[key])) {
      setError(t('onb.err_login_required'))
      return
    }
    setFinishing(true)
    setError('')
    try {
      await save(finalStep)
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
        ats_report: d.ats_report || null,
        optimized: Boolean(d.optimized),
        file_url: d.file_url || `/api/cvs/${d.id}/file`,
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

  const generateCoverLetterFromCv = async () => {
    if (!cvId) {
      setError(t('onb.err_cv'))
      return
    }
    const positions = prefs.positions.map(position => position.trim()).filter(Boolean)
    if (positions.length === 0) {
      setError(t('onb.err_positions'))
      return
    }
    setGeneratingCoverLetter(true)
    setError('')
    try {
      const res = await api.post(`/cvs/${cvId}/generate-cover-letter-template`, { positions }, { timeout: 45000 })
      if (!res.data?.ok || !res.data?.template) throw new Error(t('cari_kerja.gagal_generate_cover_ai'))
      setCoverLetter(res.data.template)
    } catch (e) {
      const detail = e.code === 'ECONNABORTED'
        ? (lang === 'id' ? 'AI terlalu lama merespons. Coba lagi atau pilih provider AI lain.' : 'AI took too long to respond. Try again or choose another AI provider.')
        : (e.response?.data?.detail || e.message)
      setError(detail || t('cari_kerja.gagal_generate_cover_ai'))
    } finally {
      setGeneratingCoverLetter(false)
    }
  }

  const connectAiProvider = async () => {
    const provider = aiProviders.find(item => item.key === selectedAi)
    if (!provider) return
    if (provider.verified && provider.key !== 'custom') {
      setSavingAi(true)
      try {
        await api.put('/ai_config/active', { provider: provider.key })
        setAiProviders(current => current.map(item => ({ ...item })))
      } catch (e) {
        setError(e.response?.data?.detail || e.message)
      } finally {
        setSavingAi(false)
      }
      return
    }
    if (!provider.configured && provider.key !== 'custom' && !aiKey.trim()) {
      setError(lang === 'id' ? 'Masukkan API key provider yang kamu pilih.' : 'Enter the API key for your selected provider.')
      return
    }
    if (provider.key === 'custom' && (!aiBaseUrl.trim() || !aiModel.trim())) {
      setError(lang === 'id' ? 'Isi endpoint dan nama model AI lokal atau OpenAI-compatible.' : 'Enter the endpoint and model name for the local or OpenAI-compatible AI.')
      return
    }
    setSavingAi(true)
    setError('')
    try {
      if (!provider.configured || provider.key === 'custom') {
        await api.put(`/ai_config/${provider.key}/key`, {
          value: aiKey.trim(),
          base_url: provider.key === 'custom' ? aiBaseUrl.trim() : undefined,
          model: provider.key === 'custom' ? aiModel.trim() : undefined,
        })
      }
      const test = await api.post(`/ai_config/${provider.key}/test`)
      if (!test.data?.ok) throw new Error(test.data?.error || 'Koneksi AI gagal diuji.')
      await api.put('/ai_config/active', { provider: provider.key })
      const res = await api.get('/ai_config')
      setAiProviders(res.data?.providers || [])
      setSelectedAi(provider.key)
      setAiKey('')
      setAiBaseUrl('')
      setAiModel('')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setSavingAi(false)
    }
  }

  // ── login job platform (capture session browser) ──
  const grabPlatform = async (platform) => {
    setGrabbingPlatform(platform)
    setError('')
    try {
      const res = await api.post(`/credentials/grab/${platform}`)
      if (!res.data?.logged_in) {
        setError(res.data?.message || t('onb.err_grab'))
        return
      }
      await refreshLogins()
    } catch (e) {
      const msg = e.response?.data?.detail
      setError(typeof msg === 'string' ? msg : t('onb.err_grab'))
    } finally {
      setGrabbingPlatform(null)
    }
  }

  const togglePlatform = (id) => {
    setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const connectPlatform = async (id) => {
    const loginKey = id.startsWith('linkedin_') ? 'linkedin' : id
    if (platforms.includes(id)) {
      if (platformLogins[loginKey]) togglePlatform(id)
      else await grabPlatform(loginKey)
      return
    }
    setPlatforms(current => [...current, id])
    if (!platformLogins[loginKey]) await grabPlatform(loginKey)
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
        <section className="onboarding-page onboarding-complete" aria-labelledby="onboarding-complete-title">
          <header className="onboarding-page-header">
            <div className="onboarding-page-header-inner onboarding-complete-hero">
            <div className="onboarding-complete-icon" style={{
              width: 64, height: 64, margin: '0 auto 16px', background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <PartyPopper size={30} strokeWidth={2} />
            </div>
            <h2 id="onboarding-complete-title">{t('onb.done_title')}</h2>
            <p>{t('onb.done_sub')}</p>
            </div>
          </header>
          <div className="onboarding-page-main onboarding-complete-main" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', marginBottom: 6 }}>
              {[
                { icon: FileText, text: t('onb.done_cv') },
                { icon: Briefcase, text: t('onb.done_prefs') },
                { icon: Globe, text: t('onb.done_platforms') },
                { icon: CheckCircle2, text: t('onb.done_login') },
                { icon: Sparkles, text: lang === 'id' ? 'Koneksi AI sudah diuji dan siap dipakai' : 'AI connection is tested and ready' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  <Icon size={16} color="#F2661A" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#33363F' }}>{text}</span>
                  <CheckCircle2 size={16} color="#1E9E3E" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                </div>
              ))}
            </div>
            <div className="onboarding-page-actions onboarding-complete-actions">
              <button className="btn btn-primary btn-lg" onClick={() => enterApp('/kerja')}>
                {lang === 'id' ? 'Mulai Cari Kerja' : 'Start Finding Jobs'} <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const stepInfo = steps.find((s) => s.n === step)
  const visibleStepIndex = steps.findIndex((item) => item.n === step) + 1
  const visibleStepTotal = steps.length
  const progressPct = visibleStepTotal > 1 ? Math.round(((visibleStepIndex - 1) / (visibleStepTotal - 1)) * 100) : 100

  return (
    <main className="onboarding-shell">
      <section className="onboarding-page" aria-labelledby="onboarding-step-title">

        {/* Header + progress */}
        <header className="onboarding-page-header">
          <div className="onboarding-page-header-inner">
            <div className="onboarding-page-brand" aria-label="ORDAL">
              <div className="onboarding-page-logo">O</div>
            </div>
            <div className="onboarding-page-title-row">
              <p>{lang === 'id' ? 'MISI PERSIAPAN' : 'SETUP MISSION'}</p>
              <h2 id="onboarding-step-title">{stepInfo ? t(stepInfo.key) : ''}</h2>
            </div>
            <div className="onboarding-page-progress">
              <div className="onboarding-step-count">
                <span>{lang === 'id' ? 'TAHAP' : 'STAGE'}</span>
                <strong>{visibleStepIndex}</strong>
                <small>/ {visibleStepTotal}</small>
              </div>
              <div className="progress-determinate" aria-label={`${progressPct}%`}>
                <div className="progress-determinate-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="onboarding-page-main">
          <div ref={onboardingBodyRef} key={step} className="onboarding-page-body" data-step={step}>
            <>
              {step !== 6 && <StageAnimation step={step} />}

              {/* ── LANGKAH 1: Upload CV ── */}
              {step === 1 && (
                <StepCv
                  t={t} lang={lang} cvs={cvs} setCvs={setCvs} cvId={cvId} setCvId={setCvId}
                  onUpload={uploadCv} saving={saving}
                  positionLabel={prefs.positions[0] || ''}
                  positions={prefs.positions}
                />
              )}

              {/* ── LANGKAH 2: Preferensi ── */}
              {step === 2 && (
                <StepPrefs t={t} lang={lang} prefs={prefs} setPrefs={setPrefs} />
              )}

              {/* ── LANGKAH 3: Cover letter ── */}
              {step === 6 && (
                <section className="cover-letter-stage">
                  <div className="cover-letter-quest">
                    <div className="cover-letter-quest-copy">
                      <span className="cover-letter-mission-tag">{lang === 'id' ? 'MISI MENULIS' : 'WRITING MISSION'}</span>
                      <h3>{lang === 'id' ? 'Buat surat lamaranmu' : 'Create your cover letter'}</h3>
                      <p>
                        {lang === 'id'
                          ? 'Gunakan pengalaman nyata dari CV. ORDAL akan mengganti dua token ini untuk setiap lowongan.'
                          : 'Use real experience from your CV. ORDAL replaces these two tokens for every vacancy.'}
                      </p>
                      <div className="cover-letter-token-row">
                        <span>{'{company}'}</span>
                        <span>{'{position}'}</span>
                      </div>
                      <div className="cover-letter-quest-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={generateCoverLetterFromCv}
                          disabled={generatingCoverLetter || !cvId}
                        >
                          {generatingCoverLetter ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {generatingCoverLetter
                            ? (lang === 'id' ? 'AI sedang menulis...' : 'AI is writing...')
                            : (lang === 'id' ? 'Buat dari CV dengan AI' : 'Create from CV with AI')}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowExample(value => !value)}>
                          <Eye size={15} /> {showExample ? t('common.close') : t('onb.view_example')}
                        </button>
                      </div>
                    </div>
                    <div className="typewriter-scene" aria-hidden="true">
                      <div className="mail-float"><Mail size={27} /></div>
                      <div className="typewriter-paper">
                        <span className="typed-line line-one" />
                        <span className="typed-line line-two" />
                        <span className="typed-line line-three" />
                        <span className="type-cursor" />
                      </div>
                      <div className="typewriter-body">
                        <div className="typewriter-slot" />
                        <div className="typewriter-keys">
                          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {showExample && (
                    <section className="onboarding-inline-example" aria-label={t('cover.title')}>
                      <div className="onboarding-inline-example-header">
                        <div>
                          <strong>{t('cover.title')}</strong>
                          <p>{t('cover.sub')}</p>
                        </div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowExample(false)}>
                          {t('common.close')}
                        </button>
                      </div>
                      <pre>{COVER_LETTER_EXAMPLE}</pre>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => { setCoverLetter(COVER_LETTER_EXAMPLE); setShowExample(false) }}
                      >
                        <CheckCircle2 size={15} /> {t('cover.use_example')}
                      </button>
                    </section>
                  )}
                  <div className="cover-letter-workbench">
                    <div className="cover-letter-workbench-bar">
                      <div>
                        <FileText size={16} />
                        <strong>{lang === 'id' ? 'DRAF SURAT' : 'LETTER DRAFT'}</strong>
                      </div>
                      <span>{coverLetter.trim().length} {t('onb.chars')}</span>
                    </div>
                    <textarea
                      className="textarea cover-letter-editor"
                      placeholder={t('onb.cover_ph')}
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                    />
                  </div>
                </section>
              )}

              {/* ── LANGKAH 4: Pilih sekaligus login platform ── */}
              {step === 3 && (
                <div className="onboarding-mission-content">
                  <StepPlatformConnections
                    t={t}
                    platforms={platforms}
                    platformLogins={platformLogins}
                    grabbingPlatform={grabbingPlatform}
                    onConnect={connectPlatform}
                  />
                  {platforms.includes('linkedin_posts') && (
                    <div className="notice notice-info" style={{ marginTop: 2 }}>
                      <Mail size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 12.5 }}>{t('onb.posts_email_note')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── LANGKAH 5: Hubungkan email (LinkedIn Posts) ── */}
              {step === 4 && (
                <StepEmail t={t} emailConnected={emailConnected} setEmailConnected={setEmailConnected} setError={setError} />
              )}

              {step === 5 && (
                <StepAiConnection
                  t={t}
                  lang={lang}
                  providers={aiProviders}
                  selected={selectedAi}
                  setSelected={setSelectedAi}
                  apiKey={aiKey}
                  setApiKey={setAiKey}
                  baseUrl={aiBaseUrl}
                  setBaseUrl={setAiBaseUrl}
                  model={aiModel}
                  setModel={setAiModel}
                  saving={savingAi}
                  onConnect={connectAiProvider}
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

        {/* Navigasi menyatu dengan konten halaman */}
        <div className="onboarding-page-actions">
          <button className="btn btn-secondary" onClick={back} disabled={step === 1 || loading}>
            <ArrowLeft size={15} /> {t('common.back')}
          </button>
          {step < finalStep ? (
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
        </div>
      </section>

    </main>
  )
}

function StageAnimation({ step }) {
  if (step === 1) {
    return (
      <div className="onboarding-topic-scene topic-cv-story" aria-hidden="true">
        <div className="ats-upload-tray"><Upload size={20} /></div>
        <div className="ats-document">
          <div className="ats-document-head"><FileText size={17} /><strong>CV</strong><b>ATS 92</b></div>
          <span className="ats-copy-line ats-copy-long" />
          <span className="ats-copy-line ats-copy-medium" />
          <span className="ats-copy-line ats-copy-short" />
          <div className="ats-check-row"><i>✓</i><span /></div>
          <div className="ats-check-row"><i>✓</i><span /></div>
          <div className="ats-scan-line" />
        </div>
        <div className="ats-ready-badge"><CheckCircle2 size={16} /> ATS READY</div>
        <span className="story-spark story-spark-one">✦</span>
        <span className="story-spark story-spark-two">✦</span>
      </div>
    )
  }
  if (step === 2) {
    return (
      <div className="onboarding-topic-scene topic-commute-story" aria-hidden="true">
        <div className="commute-sun" />
        <div className="commute-cloud"><i /><i /><i /></div>
        <div className="office-building">
          <strong>WORK</strong>
          {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
          <span className="office-door" />
        </div>
        <div className="commute-pin"><MapPin size={18} /></div>
        <div className="walking-person">
          <span className="person-head" />
          <span className="person-body" />
          <span className="person-arm" />
          <span className="person-leg person-leg-one" />
          <span className="person-leg person-leg-two" />
          <span className="person-bag"><Briefcase size={15} /></span>
        </div>
        <div className="commute-road"><span /><span /><span /><span /></div>
      </div>
    )
  }
  if (step === 3) {
    return (
      <div className="onboarding-topic-scene topic-platform-story" aria-hidden="true">
        <div className="platform-browser">
          <div className="platform-browser-bar"><i /><i /><i /></div>
          <div className="platform-job-card"><Briefcase size={14} /><span /><b>✓</b></div>
          <div className="platform-job-card"><Briefcase size={14} /><span /><b>✓</b></div>
        </div>
        <div className="platform-flying-logo platform-linkedin"><LinkedInLogo size={25} /></div>
        <div className="platform-flying-logo platform-jobstreet"><JobStreetLogo size={25} /></div>
        <div className="platform-search-ring"><Globe size={22} /></div>
      </div>
    )
  }
  if (step === 4) {
    return (
      <div className="onboarding-topic-scene topic-email-story" aria-hidden="true">
        <span className="email-speed email-speed-one" />
        <span className="email-speed email-speed-two" />
        <div className="flying-envelope"><Mail size={36} /></div>
        <div className="security-gate"><ShieldCheck size={30} /><span /></div>
        <div className="email-safe-dot"><CheckCircle2 size={17} /></div>
      </div>
    )
  }
  if (step === 5) {
    return (
      <div className="onboarding-topic-scene topic-login-story" aria-hidden="true">
        <div className="login-browser">
          <div className="login-browser-bar"><i /><i /><i /></div>
          <div className="login-avatar"><Sparkles size={24} /></div>
          <span className="login-field" />
          <span className="login-field login-field-short" />
          <span className="login-button"><Key size={13} /></span>
        </div>
        <div className="login-success"><CheckCircle2 size={24} /></div>
        <span className="login-success-ring" />
      </div>
    )
  }
  return (
    <div className="onboarding-topic-scene topic-login-story" aria-hidden="true">
      <div className="login-browser">
        <div className="login-browser-bar"><i /><i /><i /></div>
        <div className="login-avatar"><UserRound size={24} /></div>
        <span className="login-field" />
        <span className="login-field login-field-short" />
        <span className="login-button"><ExternalLink size={13} /></span>
      </div>
      <div className="login-success"><CheckCircle2 size={24} /></div>
      <span className="login-success-ring" />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Sambutan awal — full-screen, bukan modal.
// ═════════════════════════════════════════════════════════════════════════════

function WarmWelcome({ phase, name, setName, onRememberName, onNext, onBegin, saving, error, t }) {
  const content = {
    name: {
      icon: UserRound,
      kicker: t('onb.name_kicker'),
      title: t('onb.name_title'),
      sub: t('onb.name_sub'),
      cta: t('onb.name_cta'),
    },
    hello: {
      icon: Sparkles,
      kicker: t('onb.hello_kicker'),
      title: t('onb.hello_title', { name }),
      sub: t('onb.hello_sub'),
      cta: t('onb.hello_cta'),
    },
    intro: {
      icon: Compass,
      kicker: t('onb.intro_kicker'),
      title: t('onb.intro_title'),
      sub: t('onb.intro_sub'),
      cta: t('onb.lets_begin'),
    },
  }[phase]
  const Icon = content.icon

  return (
    <main className="onboarding-shell onboarding-welcome">
      <section key={phase} className={`onboarding-journey-card welcome-phase-${phase}`} aria-labelledby="welcome-journey-title" aria-live="polite">
        <div className="onboarding-orbit" aria-hidden="true">✦</div>
        <div className="onboarding-welcome-steps" aria-label="Welcome progress">
          {['name', 'hello', 'intro'].map((item) => (
            <span key={item} className={item === phase ? 'active' : ''} />
          ))}
        </div>
        <div className="onboarding-hero-icon"><Icon size={34} strokeWidth={2.1} /></div>
        <div className="onboarding-kicker">{content.kicker}</div>
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
          {content.cta}
          <ArrowRight size={17} />
        </button>
      </section>
    </main>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Langkah 1 — Upload CV
// ═════════════════════════════════════════════════════════════════════════════

function StepCv({ t, lang, cvs, setCvs, cvId, setCvId, onUpload, saving, positionLabel, positions }) {
  const [label, setLabel] = useState(positionLabel || '')
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [atsError, setAtsError] = useState('')
  const [externalPrompt, setExternalPrompt] = useState('')
  const [externalInstructions, setExternalInstructions] = useState([])
  const [copied, setCopied] = useState(false)
  const [pendingOptimizedCv, setPendingOptimizedCv] = useState(null)
  const activeCv = cvs.find((cv) => cv.id === cvId)
  const ats = activeCv?.ats_report

  const pick = () => fileRef.current?.click()

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    onUpload(f, label || f.name.replace(/\.pdf$/i, ''))
    e.target.value = ''
  }

  const loadExternalPrompt = async () => {
    if (!cvId) return
    setAtsError('')
    try {
      const res = await api.post(`/cvs/${cvId}/optimization-prompt`, { positions: positions || [] })
      setExternalPrompt(res.data?.prompt || '')
      setExternalInstructions(res.data?.instructions || [])
    } catch (e) {
      setAtsError(e.response?.data?.detail || e.message)
    }
  }

  const optimizeCv = async () => {
    if (!cvId) return
    setOptimizing(true)
    setAtsError('')
    setPendingOptimizedCv(null)
    try {
      const res = await api.post(`/cvs/${cvId}/optimize`, { positions: positions || [] }, { timeout: 120000 })
      const nextCv = res.data?.cv
      if (!nextCv?.id) throw new Error(lang === 'id' ? 'CV hasil optimasi tidak diterima.' : 'Optimized CV was not returned.')
      setCvs(current => [nextCv, ...current.filter(item => item.id !== nextCv.id)])
      setPendingOptimizedCv(nextCv)
    } catch (e) {
      const detail = e.code === 'ECONNABORTED'
        ? (lang === 'id' ? 'AI terlalu lama merespons.' : 'AI took too long to respond.')
        : (e.response?.data?.detail || e.message)
      setAtsError(typeof detail === 'string' ? detail : (lang === 'id' ? 'Optimasi CV gagal.' : 'CV optimization failed.'))
      await loadExternalPrompt()
    } finally {
      setOptimizing(false)
    }
  }

  const copyPrompt = async () => {
    if (!externalPrompt) return
    await navigator.clipboard.writeText(externalPrompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="onboarding-mission-content onboarding-cv-mission">
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

      {ats && (
        <section className="ats-report-card" aria-label={lang === 'id' ? 'Penilaian ATS CV' : 'CV ATS assessment'}>
          <div className="ats-report-head">
            <div className="ats-score-ring" data-rating={ats.rating}>
              <strong>{ats.score}</strong><span>/100</span>
            </div>
            <div>
              <div className="label-chip">{lang === 'id' ? 'AUDIT ATS TRANSPARAN' : 'TRANSPARENT ATS AUDIT'}</div>
              <h3>{lang === 'id' ? 'Seberapa mudah CV ini dibaca sistem?' : 'How readable is this CV to an ATS?'}</h3>
              <p>{ats.disclaimer}</p>
            </div>
          </div>
          <div className="ats-criteria-grid">
            {(ats.criteria || []).map(item => (
              <article key={item.key} className="ats-criterion" data-status={item.status}>
                <div><strong>{item.label}</strong><b>{item.score}/{item.max_score}</b></div>
                <p>{item.evidence}</p>
                <small>{item.recommendation}</small>
              </article>
            ))}
          </div>
          <div className="ats-format-guide">
            <strong>{lang === 'id' ? 'Patokan format CV hasil optimasi' : 'Optimized CV format standard'}</strong>
            <ul>
              <li>{lang === 'id' ? 'A4, satu kolom, maksimal dua halaman, margin 16-20 mm.' : 'A4, one column, maximum two pages, 16-20 mm margins.'}</li>
              <li>{lang === 'id' ? 'Font isi 10-11 pt, heading 12-14 pt, nama 18-22 pt, maksimal dua jenis font.' : '10-11 pt body, 12-14 pt headings, 18-22 pt name, maximum two fonts.'}</li>
              <li>{lang === 'id' ? 'Tanpa tabel kompleks, grafik skill, text box, foto, atau informasi penting di header/footer.' : 'No complex tables, skill charts, text boxes, photos, or important header/footer content.'}</li>
              <li>{lang === 'id' ? 'Bullet memakai tindakan, konteks, dan hasil. Angka hanya boleh berasal dari CV asli.' : 'Bullets use action, context, and result. Metrics must come from the source CV.'}</li>
            </ul>
          </div>
          <div className="ats-report-actions">
            <button type="button" className="btn btn-primary" onClick={optimizeCv} disabled={optimizing}>
              {optimizing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {optimizing ? (lang === 'id' ? 'AI sedang mengoptimalkan...' : 'AI is optimizing...') : (lang === 'id' ? 'Optimalkan CV dengan AI' : 'Optimize CV with AI')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={loadExternalPrompt}>
              <Copy size={15} /> {lang === 'id' ? 'Prompt untuk AI di luar app' : 'Prompt for external AI'}
            </button>
            {activeCv.file_url && (
              <a className="btn btn-secondary" href={activeCv.file_url} target="_blank" rel="noreferrer">
                <Download size={15} /> {lang === 'id' ? 'Buka PDF' : 'Open PDF'}
              </a>
            )}
          </div>
        </section>
      )}

      {pendingOptimizedCv && (
        <div className="notice notice-success ats-use-choice">
          <CheckCircle2 size={18} />
          <div>
            <strong>{lang === 'id' ? 'CV versi ATS sudah dibuat.' : 'ATS CV version is ready.'}</strong>
            <p>{lang === 'id' ? 'Pilih CV yang akan dipakai ORDAL untuk melamar.' : 'Choose which CV ORDAL should use for applications.'}</p>
            <div>
              <button type="button" className="btn btn-primary" onClick={() => { setCvId(pendingOptimizedCv.id); setPendingOptimizedCv(null) }}>
                {lang === 'id' ? 'Gunakan CV hasil optimasi' : 'Use optimized CV'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingOptimizedCv(null)}>
                {lang === 'id' ? 'Tetap gunakan CV asli' : 'Keep original CV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {atsError && <div className="notice notice-error"><AlertCircle size={15} /> <span>{atsError}</span></div>}

      {externalPrompt && (
        <section className="external-cv-prompt">
          <div className="external-cv-prompt-head">
            <div>
              <strong>{lang === 'id' ? 'Jika AI di app tidak bisa membuat CV' : 'If in-app AI cannot create the CV'}</strong>
              <p>{lang === 'id' ? 'Pakai prompt lengkap ini di AI pilihanmu, lalu unggah kembali PDF hasilnya.' : 'Use this complete prompt in your preferred AI, then upload the resulting PDF again.'}</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={copyPrompt}>
              <Copy size={14} /> {copied ? (lang === 'id' ? 'Tersalin' : 'Copied') : (lang === 'id' ? 'Salin prompt' : 'Copy prompt')}
            </button>
          </div>
          <textarea className="textarea" readOnly value={externalPrompt} />
          <ol>{externalInstructions.map(item => <li key={item}>{item}</li>)}</ol>
        </section>
      )}
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
    <div className="onboarding-mission-content onboarding-preferences-mission">
      <Field icon={Briefcase} label={t('onb.f_positions')}>
        <ChipsInput
          value={prefs.positions}
          onChange={(v) => up('positions', v)}
          placeholder={t('onb.f_positions_ph')}
          helper={t('onb.f_positions_help')}
          savedLabel={t('onb.f_saved_values')}
          clearLabel={t('common.clear_all')}
        />
      </Field>

      <Field icon={MapPin} label={t('onb.f_locations')}>
        <ChipsInput
          value={prefs.locations}
          onChange={(v) => up('locations', v)}
          placeholder={t('onb.f_locations_ph')}
          helper={t('onb.f_locations_help')}
          savedLabel={t('onb.f_saved_values')}
          clearLabel={t('common.clear_all')}
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
      <div className="onboarding-mission-content" style={{ textAlign: 'center', padding: '14px 0' }}>
        <CheckCircle2 size={44} color="#1E9E3E" style={{ margin: '0 auto 12px' }} strokeWidth={2} />
        <div style={{ fontWeight: 800, fontSize: 15, color: '#33363F', marginBottom: 4 }}>{t('onb.email_ok')}</div>
        <p style={{ fontSize: 13, color: '#6B6E76', margin: 0 }}>{t('onb.email_ok_sub')}</p>
      </div>
    )
  }

  return (
    <div className="onboarding-mission-content onboarding-email-mission">
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

function StepPlatformConnections({ t, platforms, platformLogins, grabbingPlatform, onConnect }) {
  return (
    <div className="onboarding-platform-connections">
      <div className="notice notice-info" style={{ marginBottom: 14 }}>
        <Globe size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5 }}>{t('onb.login_required_note')}</span>
      </div>
      <div className="onboarding-provider-grid">
        {PLATFORM_CARDS.map(platform => {
          const loginKey = platform.id.startsWith('linkedin_') ? 'linkedin' : platform.id
          const selected = platforms.includes(platform.id)
          const connected = Boolean(platformLogins[loginKey])
          const connecting = grabbingPlatform === loginKey
          return (
            <button
              key={platform.id}
              type="button"
              className="onboarding-provider-card"
              data-selected={selected ? 'true' : 'false'}
              data-connected={connected ? 'true' : 'false'}
              onClick={() => onConnect(platform.id)}
              disabled={Boolean(grabbingPlatform) && !connecting}
            >
              <span className="onboarding-provider-logo"><PlatformLogo platformId={platform.id} size={30} /></span>
              <span className="onboarding-provider-copy">
                <strong>{t(`onb.platform_${platform.id}`)}</strong>
                {connected && (
                  <small className="provider-connected-status">
                    <span className="connection-light is-online" /> {t('onb.logged_in')}
                  </small>
                )}
                {connecting && <small>{t('onb.waiting_login')}</small>}
              </span>
              {connecting && <Loader2 size={16} className="animate-spin" />}
            </button>
          )
        })}
      </div>
      <p className="onboarding-coming-soon">{t('onb.platforms_coming_soon')}</p>
    </div>
  )
}

function StepAiConnection({ t, lang, providers, selected, setSelected, apiKey, setApiKey, baseUrl, setBaseUrl, model, setModel, saving, onConnect }) {
  const provider = providers.find(item => item.key === selected) || providers[0]
  return (
    <div className="onboarding-mission-content onboarding-ai-connect">
      <div className="notice notice-info" style={{ marginBottom: 14 }}>
        <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5 }}>
          {lang === 'id' ? 'Pilih satu AI. Kamu tidak perlu menghubungkan semuanya.' : 'Choose one AI. You do not need to connect every provider.'}
        </span>
      </div>
      <div className="onboarding-provider-grid">
        {providers.map(item => {
          const connected = Boolean(item.verified)
          return (
            <button
              key={item.key}
              type="button"
              className="onboarding-provider-card"
              data-selected={item.key === provider?.key ? 'true' : 'false'}
              onClick={() => { setSelected(item.key); setApiKey(''); setBaseUrl(item.api_base || ''); setModel(item.model || '') }}
            >
              <span className="onboarding-provider-logo"><ProviderLogo providerKey={item.key} size={28} /></span>
              <span className="onboarding-provider-copy">
                <strong>{item.label}</strong>
                <small>{PROVIDER_GUIDES[item.key]?.cost?.[lang] || item.model}</small>
                {connected && (
                  <small className="provider-connected-status">
                    <span className="connection-light is-online" /> {lang === 'id' ? 'Terhubung dan teruji' : 'Connected and verified'}
                  </small>
                )}
                {!connected && item.configured && <small>{lang === 'id' ? 'Key tersimpan, belum teruji' : 'Key saved, not tested'}</small>}
              </span>
            </button>
          )
        })}
      </div>
      {provider && (
        <div className="onboarding-ai-key-panel">
          <div>
            <strong>{provider.label}</strong>
            <p>{PROVIDER_GUIDES[provider.key]?.description?.[lang] || provider.description}</p>
          </div>
          {provider.key === 'custom' && (
            <>
              <input
                className="input"
                type="url"
                value={baseUrl}
                onChange={event => setBaseUrl(event.target.value)}
                placeholder="http://localhost:11434/v1"
              />
              <input
                className="input"
                value={model}
                onChange={event => setModel(event.target.value)}
                placeholder={lang === 'id' ? 'Nama model, mis. llama3.2' : 'Model name, e.g. llama3.2'}
              />
            </>
          )}
          {(!provider.configured || provider.key === 'custom') && (
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              placeholder={provider.key === 'custom' ? (lang === 'id' ? 'API key opsional. Kosongkan untuk mempertahankan key lama.' : 'Optional API key. Leave blank to keep the saved key.') : (provider.api_key_label || 'API key')}
              autoComplete="off"
            />
          )}
          <div className="onboarding-ai-key-actions">
            {provider.api_key_link && !provider.configured && (
              <a className="btn btn-secondary" href={provider.api_key_link} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> {lang === 'id' ? 'Dapatkan API key' : 'Get API key'}
              </a>
            )}
            <button className="btn btn-primary" type="button" onClick={onConnect} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : provider.configured ? <CheckCircle2 size={15} /> : <Save size={15} />}
              {provider.verified ? (lang === 'id' ? 'Gunakan AI ini' : 'Use this AI') : provider.configured ? (lang === 'id' ? 'Test dan hubungkan' : 'Test and connect') : (lang === 'id' ? 'Simpan, test, dan hubungkan' : 'Save, test, and connect')}
            </button>
          </div>
          <div className="onboarding-ai-local-note"><Key size={13} /> {lang === 'id' ? 'API key dienkripsi dan disimpan lokal di perangkat ini.' : 'API key is encrypted and stored locally on this device.'}</div>
        </div>
      )}
    </div>
  )
}

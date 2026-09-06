import { useEffect, useState } from 'react'
import {
  Loader, CheckCircle, AlertCircle, Sparkles, Save, Trash2,
  Eye, EyeOff, Send, Bot, Cpu, ExternalLink, Zap, User, Key,
} from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Toast({ msg, type = 'success' }) {
  if (!msg) return null
  const cls = type === 'success' ? 'notice-success' : 'notice-error'
  const Icon = type === 'success' ? CheckCircle : AlertCircle
  return (
    <div className={`notice ${cls}`} style={{ marginTop: 12 }}>
      <Icon size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{msg}</span>
    </div>
  )
}

// ── Provider logo SVGs (v13: ganti icon generic dengan logo brand asli) ────
// Setiap provider punya logo SVG inline yang di-render di card header.
// Logo pakai warna brand asli supaya recognizable.
function GeminiLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" fill="#4285F4"/>
    </svg>
  )
}
function OpenAILogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z" fill="#000"/>
      <path d="M13.26 22.244a4.494 4.494 0 0 1-2.882-1.04l.144-.08 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .04.055v5.583a4.504 4.504 0 0 1-4.493 4.49z" fill="#fff" opacity="0.6"/>
    </svg>
  )
}
function AnthropicLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.307 6.404h3.461l3.46 11.192h-3.275l-.547-2.056H7.786l-.547 2.056H4.054L7.307 6.404zm2.487 2.487L8.293 13.7h2.66l-1.16-4.81zM17.693 6.404h3.275v11.192h-3.275V6.404z" fill="#D97757"/>
    </svg>
  )
}
function GroqLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.1 13.1L24 13.1L13.1 24L13.1 13.1z" fill="#F55036"/>
      <path d="M10.9 13.1L0 13.1L10.9 0L10.9 13.1z" fill="#F55036"/>
      <path d="M13.1 10.9L24 10.9L13.1 0L13.1 10.9z" fill="#F55036" opacity="0.7"/>
      <path d="M10.9 13.1L0 13.1L10.9 24L10.9 13.1z" fill="#F55036" opacity="0.7"/>
    </svg>
  )
}
function OpenRouterLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#000"/>
      <path d="M6 8h12M6 12h12M6 16h8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function ProviderLogo({ providerKey, size = 24 }) {
  switch (providerKey) {
    case 'gemini': return <GeminiLogo size={size} />
    case 'openai': return <OpenAILogo size={size} />
    case 'anthropic': return <AnthropicLogo size={size} />
    case 'groq': return <GroqLogo size={size} />
    case 'openrouter': return <OpenRouterLogo size={size} />
    default: return <Bot size={size} strokeWidth={2.25} />
  }
}

function providerIcon(key) {
  // Legacy: dipakai untuk fallback. Sekarang pakai ProviderLogo (SVG brand).
  if (key === 'gemini') return Sparkles
  if (key === 'openai') return Bot
  if (key === 'anthropic') return Cpu
  if (key === 'groq') return Zap
  if (key === 'openrouter') return Cpu
  return Bot
}

// ─────────────────────────────────────────────────────────────────────────────
// ProviderCard — pilih provider + set API key + test
// ─────────────────────────────────────────────────────────────────────────────
function ProviderCard({ provider, isActive, onSelect, onSaved }) {
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)
  const { t } = useI18n()

  useEffect(() => {
    setApiKey('')
    setToast(null)
  }, [provider.key])

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setToast({ type: 'error', msg: t('ai.toast.key_empty') })
      return
    }
    setLoading(true); setToast(null)
    try {
      await api.put(`/ai_config/${provider.key}/key`, { value: apiKey.trim() })
      setToast({ type: 'success', msg: `${t('ai.toast.key_saved')} ${provider.label} ${t('ai.toast.saved_suffix')}` })
      setApiKey('')
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `${t('ai.toast.save_failed')} ${e.response?.data?.detail || e.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!confirm(`${t('ai.confirm.delete')} ${provider.label}${t('ai.confirm.question_mark')}`)) return
    setLoading(true); setToast(null)
    try {
      await api.delete(`/ai_config/${provider.key}/key`)
      setToast({ type: 'success', msg: `${t('ai.toast.key_deleted')} ${provider.label} ${t('ai.toast.deleted_suffix')}` })
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `${t('ai.toast.delete_failed')} ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    setTesting(true); setToast(null)
    try {
      const res = await api.post(`/ai_config/${provider.key}/test`)
      if (res.data.ok) {
        setToast({ type: 'success', msg: res.data.detail })
      } else {
        setToast({ type: 'error', msg: res.data.error })
      }
    } catch (e) {
      setToast({ type: 'error', msg: `${t('ai.toast.test_failed')} ${e.response?.data?.error || e.message}` })
    } finally {
      setTesting(false)
    }
  }

  const Icon = providerIcon(provider.key)

  return (
    <div className="card" style={{
      border: isActive ? '2px solid var(--orange)' : '1px solid var(--gray-200)',
      boxShadow: isActive ? '0 4px 14px rgba(255, 107, 26, 0.16)' : 'var(--shadow)',
    }}>
      {/* Header */}
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* v21: logo provider tanpa background container.
            Sebelumnya, container orange menutupi logo brand (Gemini jadi
            kelihatan orange padahal aslinya biru). Sekarang logo ditampilkan
            langsung tanpa background, supaya warna brand asli terlihat. */}
        <div style={{
          width: 40, height: 40, borderRadius: 9,
          background: 'white',
          border: isActive ? '2px solid var(--orange)' : '1px solid var(--gray-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? '0 4px 14px rgba(255, 107, 26, 0.16)' : 'none',
          flexShrink: 0,
        }}>
          <ProviderLogo providerKey={provider.key} size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {provider.label}
            {isActive && (
              <span className="badge badge-orange">
                <Zap size={10} /> {t('ai.badge.active')}
              </span>
            )}
            {provider.configured ? (
              <span className="badge badge-success">
                <CheckCircle size={10} /> {t('ai.badge.key_set')}
              </span>
            ) : (
              <span className="badge badge-muted">{t('ai.badge.key_missing')}</span>
            )}
          </div>
          <div className="card-subtitle">{provider.description}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            model: {provider.model}
          </div>
        </div>
        {!isActive && provider.configured && (
          <button
            onClick={() => onSelect(provider.key)}
            className="btn btn-secondary"
            style={{ padding: '7px 12px' }}
          >
            {t('ai.btn.use')}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 20 }}>
        {provider.configured && (
          <div style={{
            marginBottom: 12, padding: '8px 10px',
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--gray-700)',
            fontFamily: 'var(--font-mono)',
          }}>
            {t('ai.label.current')}: <span style={{ color: 'var(--gray-900)', fontWeight: 500 }}>{provider.masked}</span>
          </div>
        )}

        <label className="input-label">
          {provider.configured ? t('ai.label.override_key') : `${t('ai.label.enter_key')} ${provider.api_key_label}`}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={provider.configured ? '••••••••••••' : `${t('ai.placeholder.enter_key')} ${provider.api_key_label}...`}
            className="input"
            style={{ paddingRight: 38, fontFamily: 'var(--font-mono)' }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', padding: 4,
              color: 'var(--gray-500)', cursor: 'pointer',
            }}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveKey}
            disabled={loading || !apiKey.trim()}
            className="btn btn-primary"
            style={{ flex: 1, minWidth: 100 }}
          >
            {loading ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {t('ai.btn.save_key')}
          </button>
          {provider.configured && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn btn-secondary"
            >
              {testing ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {t('ai.btn.test')}
            </button>
          )}
          {provider.configured && (
            <button
              onClick={handleDeleteKey}
              disabled={loading}
              className="btn btn-danger"
              aria-label={t('ai.btn.delete_aria')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {provider.api_key_link && (
          <a href={provider.api_key_link} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 12, fontSize: 12,
          }}>
            <ExternalLink size={11} /> {t('ai.link.get_key')} {provider.api_key_label}
          </a>
        )}

        <Toast {...(toast || {})} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatPlayground — test AI dengan prompt
// ─────────────────────────────────────────────────────────────────────────────
function ChatPlayground({ activeProvider, providers }) {
  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()

  const activeMeta = providers.find(p => p.key === activeProvider)

  const send = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(''); setResponse('')
    try {
      const res = await api.post('/ai_config/chat', {
        prompt: prompt.trim(),
        system_prompt: systemPrompt.trim() || null,
        max_tokens: 1500,
        temperature: 0.7,
      })
      if (res.data.ok) {
        setResponse(res.data.response)
      } else {
        setError(res.data.error || t('ai.playground.response_empty'))
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--orange-50)', color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Send size={18} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title">{t('ai.playground.title')}</div>
          <div className="card-subtitle">
            {t('ai.playground.desc')}
          </div>
        </div>
        {activeMeta && (
          <span className="badge badge-orange">
            <Zap size={10} /> {activeMeta.label} · {activeMeta.model}
          </span>
        )}
      </div>

      <div className="card-pad" style={{ paddingTop: 18, paddingBottom: 20 }}>
        {!activeMeta?.configured ? (
          <div className="notice notice-error">
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{t('ai.playground.no_key')}</span>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="input-label">{t('ai.playground.label_system')}</label>
              <textarea
                rows={2}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder={t('ai.playground.placeholder_system')}
                className="textarea"
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="input-label">{t('ai.playground.label_prompt')}</label>
              <textarea
                rows={4}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t('ai.playground.placeholder_prompt')}
                className="textarea"
                style={{ resize: 'vertical' }}
              />
            </div>

            <button
              onClick={send}
              disabled={loading || !prompt.trim()}
              className="btn btn-primary"
            >
              {loading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              {t('ai.playground.btn_send')}
            </button>

            {error && (
              <div className="notice notice-error" style={{ marginTop: 14 }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {response && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{t('ai.playground.response_label')}</div>
                <div style={{
                  background: 'var(--gray-50)',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--gray-900)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                }}>
                  {response}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function AI() {
  const [providers, setProviders] = useState([])
  const [active, setActive] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { t } = useI18n()

  const refresh = async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.get('/ai_config')
      setProviders(res.data.providers || [])
      setActive(res.data.active)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleSelectActive = async (providerKey) => {
    try {
      await api.put('/ai_config/active', { provider: providerKey })
      setActive(providerKey)
    } catch (e) {
      alert(`Gagal set active: ${e.response?.data?.detail || e.message}`)
    }
  }

  if (loading) {
    return (
      <div className="main-scroll">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>
          <Loader size={20} className="animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="main-scroll">
        <div className="notice notice-error" style={{ margin: '16px 0' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            Gagal memuat konfigurasi AI: {error}
            <button onClick={refresh} className="btn btn-secondary" style={{ marginLeft: 10, padding: '4px 10px' }}>
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    )
  }

  const anyConfigured = providers.some(p => p.configured)

  return (
    <div className="main-scroll">
      <div className="page-header">
        <h1>{t('page.ai.title')}</h1>
        <p>
          {t('page.ai.desc')}
        </p>
      </div>

      {!anyConfigured && (
        <div className="notice notice-info" style={{ marginBottom: 20 }}>
          <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('page.ai.no_key_title')}</div>
            <div style={{ fontSize: 13 }}>
              {t('page.ai.no_key_desc')}
            </div>
          </div>
        </div>
      )}

      <div className="section-header">
        <h2><Cpu size={16} color="var(--orange)" /> {t('page.ai.section_provider')}</h2>
        <p>
          {t('page.ai.section_provider_desc')}
        </p>
      </div>

      <div className="grid-cards" style={{ marginBottom: 32 }}>
        {providers.map(provider => (
          <ProviderCard
            key={provider.key}
            provider={provider}
            isActive={provider.key === active}
            onSelect={handleSelectActive}
            onSaved={refresh}
          />
        ))}
      </div>

      <div className="section-header">
        <h2><Send size={16} color="var(--orange)" /> {t('page.ai.section_test')}</h2>
        <p>{t('page.ai.section_test_desc')}</p>
      </div>

      <ChatPlayground activeProvider={active} providers={providers} />
    </div>
  )
}

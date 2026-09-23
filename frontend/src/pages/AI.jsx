import { useEffect, useState } from 'react'
import {
  Loader, CheckCircle, AlertCircle, Sparkles, Save, Trash2,
  Eye, EyeOff, Send, Bot, ExternalLink, Zap, Key,
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
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="Google Gemini">
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" fill="#8E75B2"/>
    </svg>
  )
}
function OpenAILogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="OpenAI">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686.04.055v5.583a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324l-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685h-.071l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2h.071l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974l.0284-.0615 4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" fill="#111827"/>
    </svg>
  )
}
function AnthropicLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="Anthropic">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" fill="#191919"/>
    </svg>
  )
}
function GroqLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 33 33" xmlns="http://www.w3.org/2000/svg" aria-label="Groq">
      <rect x=".5" y=".5" width="32" height="32" rx="5" fill="#F43E01"/>
      <path d="m18.445 4.406-9.468 13.74 7.341.665-1.69 9.578 9.469-13.74-7.342-.664 1.69-9.579Z" fill="#fff"/>
    </svg>
  )
}
function OpenRouterLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="OpenRouter">
      <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" fill="#6D28D9"/>
    </svg>
  )
}

const PROVIDER_GUIDES = {
  gemini: {
    description: { id: 'Cepat dan praktis untuk analisis lowongan serta jawaban formulir.', en: 'Fast and practical for job analysis and application answers.' },
    cost: { id: 'Free tier tersedia', en: 'Free tier available' },
    oauth: { id: 'API developer memakai key, bukan login OAuth.', en: 'Developer API access uses a key, not OAuth sign-in.' },
    steps: {
      id: ['Buka Google AI Studio.', 'Login dengan akun Google.', 'Klik Create API key, lalu salin key ke ORDAL.'],
      en: ['Open Google AI Studio.', 'Sign in with Google.', 'Click Create API key, then paste the key into ORDAL.'],
    },
  },
  openai: {
    description: { id: 'Model ringan berkualitas untuk penulisan dan klasifikasi.', en: 'A capable lightweight model for writing and classification.' },
    cost: { id: 'Berbayar · pay-as-you-go', en: 'Paid · pay as you go' },
    oauth: { id: 'Langganan ChatGPT tidak termasuk kredit API.', en: 'A ChatGPT subscription does not include API credits.' },
    steps: {
      id: ['Buka OpenAI Platform dan tambahkan billing.', 'Buat secret key di API Keys.', 'Salin key sekali; OpenAI tidak menampilkannya lagi.'],
      en: ['Open the OpenAI Platform and add billing.', 'Create a secret key under API Keys.', 'Copy it once; OpenAI will not show it again.'],
    },
  },
  anthropic: {
    description: { id: 'Kuat untuk penulisan natural dan instruksi panjang.', en: 'Strong at natural writing and long instructions.' },
    cost: { id: 'Berbayar · kredit API', en: 'Paid · API credits' },
    oauth: { id: 'Claude web dan Claude API memiliki billing terpisah.', en: 'Claude web and Claude API use separate billing.' },
    steps: {
      id: ['Buka Anthropic Console.', 'Tambahkan kredit/billing.', 'Buat API key lalu salin ke ORDAL.'],
      en: ['Open the Anthropic Console.', 'Add credits or billing.', 'Create an API key and paste it into ORDAL.'],
    },
  },
  groq: {
    description: { id: 'Inferensi sangat cepat dengan batas free tier.', en: 'Very fast inference with free-tier limits.' },
    cost: { id: 'Free tier terbatas + paket berbayar', en: 'Limited free tier + paid plans' },
    oauth: { id: 'Akses model memakai API key Groq.', en: 'Model access uses a Groq API key.' },
    steps: {
      id: ['Buka GroqCloud Console.', 'Pilih API Keys lalu Create API Key.', 'Salin key ke ORDAL; batas free tier mengikuti rate limit Groq.'],
      en: ['Open the GroqCloud Console.', 'Choose API Keys, then Create API Key.', 'Paste it into ORDAL; free usage follows Groq rate limits.'],
    },
  },
  openrouter: {
    description: { id: 'Satu API untuk banyak model gratis maupun berbayar.', en: 'One API for many free and paid models.' },
    cost: { id: 'Model gratis dan berbayar', en: 'Free and paid models' },
    oauth: { id: 'OpenRouter mendukung OAuth PKCE, tetapi ORDAL memakai API key manual agar alur semua provider konsisten.', en: 'OpenRouter supports OAuth PKCE, but ORDAL uses a manual API key for a consistent provider flow.' },
    steps: {
      id: ['Buka OpenRouter Keys.', 'Buat key baru dan atur limit kredit bila perlu.', 'Pilih model berlabel :free untuk penggunaan gratis.'],
      en: ['Open OpenRouter Keys.', 'Create a key and optionally set a credit limit.', 'Choose models tagged :free for free usage.'],
    },
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// ProviderCard — pilih provider + set API key + test
// ─────────────────────────────────────────────────────────────────────────────
function ProviderCard({ provider, isActive, onSelect, onSaved }) {
  const [apiKey, setApiKey] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)
  const { t, lang } = useI18n()
  const guide = PROVIDER_GUIDES[provider.key]

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
            {guide && <span className="badge badge-warning">{guide.cost[lang]}</span>}
          </div>
          <div className="card-subtitle">{guide?.description[lang] || provider.description}</div>
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
        {guide && (
          <div className="notice notice-muted" style={{ marginBottom: 14 }}>
            <Key size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>{lang === 'id' ? 'Cara mendapatkan API key' : 'How to get an API key'}</strong>
              <ol style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                {guide.steps[lang].map((step) => <li key={step} style={{ marginBottom: 3 }}>{step}</li>)}
              </ol>
              <span style={{ fontSize: 12 }}>{guide.oauth[lang]}</span>
            </div>
          </div>
        )}
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
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState('')
  const { t, lang } = useI18n()

  const refresh = async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.get('/ai_config')
      const nextProviders = res.data.providers || []
      const nextActive = res.data.active
      setProviders(nextProviders)
      setActive(nextActive)
      setSelected(current => current || nextActive || nextProviders[0]?.key || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleSelectActive = async (providerKey) => {
    setActionError('')
    try {
      await api.put('/ai_config/active', { provider: providerKey })
      setActive(providerKey)
    } catch (e) {
      setActionError(e.response?.data?.detail || e.message)
    }
  }

  if (loading) {
    return (
      <div className="main-scroll">
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, color: 'var(--gray-600)' }}>
          <Loader size={20} className="animate-spin" />
          <span>{lang === 'id' ? 'Memuat koneksi AI...' : 'Loading AI connections...'}</span>
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
  const selectedProvider = providers.find(provider => provider.key === selected) || providers[0]

  return (
    <div className="main-scroll">
      <div className="page-header">
        <h1>{t('page.ai.title')}</h1>
        <p>
          {t('page.ai.desc')}
        </p>
      </div>

      <div className="notice notice-muted" style={{ marginBottom: 16 }}>
        <Key size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{t('page.ai.oauth_note')}</span>
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

      <div className="ai-connect-layout" style={{ marginBottom: 32 }}>
        <aside className="card ai-provider-list" aria-label={lang === 'id' ? 'Daftar provider AI' : 'AI provider list'}>
          <div className="card-header">
            <div className="card-title">{lang === 'id' ? 'Pilih layanan' : 'Choose service'}</div>
            <div className="card-subtitle">
              {lang === 'id' ? 'Satu provider aktif dipakai seluruh proses lamaran.' : 'One active provider handles all application tasks.'}
            </div>
          </div>
          <div style={{ padding: 10, display: 'grid', gap: 6 }}>
            {providers.map(provider => {
              const isSelected = provider.key === selectedProvider?.key
              return (
                <button
                  key={provider.key}
                  type="button"
                  onClick={() => setSelected(provider.key)}
                  className="ai-provider-option"
                  data-selected={isSelected ? 'true' : 'false'}
                  aria-pressed={isSelected}
                >
                  <ProviderLogo providerKey={provider.key} size={22} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <strong>{provider.label}</strong>
                    <small>{provider.configured ? (lang === 'id' ? 'Terhubung' : 'Connected') : (lang === 'id' ? 'Belum terhubung' : 'Not connected')}</small>
                  </span>
                  {provider.key === active && <span className="ai-active-dot" title={lang === 'id' ? 'Sedang dipakai' : 'Currently active'} />}
                </button>
              )
            })}
          </div>
          <div className="ai-local-note">
            <Key size={14} />
            <span>{lang === 'id' ? 'API key dienkripsi dan disimpan lokal pada perangkat ini.' : 'API keys are encrypted and stored locally on this device.'}</span>
          </div>
        </aside>

        <div>
          {actionError && (
            <div className="notice notice-error" style={{ marginBottom: 12 }}>
              <AlertCircle size={14} /> <span>{actionError}</span>
            </div>
          )}
          {selectedProvider ? (
            <ProviderCard
              provider={selectedProvider}
              isActive={selectedProvider.key === active}
              onSelect={handleSelectActive}
              onSaved={refresh}
            />
          ) : (
            <div className="notice notice-error">{lang === 'id' ? 'Provider AI tidak tersedia.' : 'No AI provider is available.'}</div>
          )}
        </div>
      </div>

      <div className="section-header">
        <h2><Send size={16} color="var(--orange)" /> {t('page.ai.section_test')}</h2>
        <p>{t('page.ai.section_test_desc')}</p>
      </div>

      <ChatPlayground activeProvider={active} providers={providers} />
    </div>
  )
}

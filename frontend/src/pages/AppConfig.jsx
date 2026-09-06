import { useEffect, useState } from 'react'
import {
  ExternalLink, Loader, CheckCircle, AlertCircle, Key, Bot,
  Calendar, Clock, Save, Sparkles, Eye, EyeOff, Trash2, Send, Link2, Zap,
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

function SecretStatus({ configured }) {
  const { t } = useI18n()
  return (
    <span className={configured ? 'badge badge-success' : 'badge badge-muted'}>
      {configured ? (
        <>
          <CheckCircle size={11} /> {t('ai.badge.active')}
        </>
      ) : (
        t('appconfig.belum_diset')
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SecretCard — input + save + test untuk satu secret (Gemini/Telegram)
// ─────────────────────────────────────────────────────────────────────────────
export function SecretCard({ secret, onSaved }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    setValue('')
    setToast(null)
  }, [secret.key])

  const handleSave = async () => {
    if (!value.trim()) {
      setToast({ type: 'error', msg: t('appconfig.nilai_tidak_boleh_kosong') })
      return
    }
    setLoading(true); setToast(null)
    try {
      const res = await api.put(`/app_config/${secret.key}`, { value: value.trim() })
      setToast({ type: 'success', msg: `Tersimpan. ${secret.label}: ${res.data.masked}` })
      setValue('')
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `Gagal simpan: ${e.response?.data?.detail || e.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!confirm(`Hapus ${secret.label}?`)) return
    setLoading(true); setToast(null)
    try {
      await api.delete(`/app_config/${secret.key}`)
      setToast({ type: 'success', msg: `${secret.label} dihapus.` })
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `Gagal hapus: ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    setTesting(true); setToast(null)
    try {
      const res = await api.post(`/app_config/test/${secret.key === 'GEMINI_API_KEY' ? 'gemini' : 'telegram'}`)
      if (res.data.ok) {
        setToast({ type: 'success', msg: res.data.detail })
      } else {
        setToast({ type: 'error', msg: res.data.error })
      }
    } catch (e) {
      setToast({ type: 'error', msg: `Gagal test: ${e.message}` })
    } finally {
      setTesting(false)
    }
  }

  const Icon = secret.key === 'GEMINI_API_KEY' ? Sparkles : Bot

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--orange-50)',
          color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={18} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {secret.label}
            <SecretStatus configured={secret.configured} />
          </div>
          <div className="card-subtitle">{secret.description}</div>
        </div>
      </div>

      {/* Body */}
      <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 20 }}>
        {secret.configured && (
          <div style={{
            marginBottom: 12, padding: '8px 10px',
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--gray-700)',
            fontFamily: 'var(--font-mono)',
          }}>
            Current: <span style={{ color: 'var(--gray-900)', fontWeight: 500 }}>{secret.masked}</span>
          </div>
        )}

        <label className="input-label">{secret.configured ? t('appconfig.override_label') : t('appconfig.masukkan_nilai')}</label>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={secret.configured ? '••••••••••••' : `Masukkan ${secret.label}...`}
            className="input"
            style={{ paddingRight: 38, fontFamily: 'var(--font-mono)', fontSize: 12 }}
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
            aria-label={show ? 'Sembunyikan' : 'Tampilkan'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleSave}
            disabled={loading || !value.trim()}
            className="btn btn-primary"
            style={{ flex: 1, minWidth: 100 }}
          >
            {loading ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Simpan
          </button>
          {secret.configured && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn btn-secondary"
            >
              {testing ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Test
            </button>
          )}
          {secret.configured && (
            <button
              onClick={handleClear}
              disabled={loading}
              className="btn btn-danger"
              aria-label="Hapus"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {secret.link && (
          <a href={secret.link} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 12, fontSize: 11,
          }}>
            <ExternalLink size={11} /> Dapatkan {secret.label} di sini
          </a>
        )}

        <Toast {...(toast || {})} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TelegramLinkCard — link akun Telegram user (chat_id) supaya bot bisa kirim
// notifikasi & user bisa balas via Telegram.
// ─────────────────────────────────────────────────────────────────────────────
export function TelegramLinkCard({ telegramConfigured, onSaved }) {
  const { t } = useI18n()
  const [identifier, setIdentifier] = useState('')
  const [linkState, setLinkState] = useState(null)  // {connected, chat_id, enabled}
  const [loading, setLoading] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [autoLinking, setAutoLinking] = useState(false)
  const [toast, setToast] = useState(null)

  const load = async () => {
    try {
      const res = await api.get('/app_config/telegram_link')
      setLinkState(res.data)
    } catch (e) {
      // ignore
    }
  }
  useEffect(() => { load() }, [])

  const handleLink = async () => {
    if (!identifier.trim()) {
      setToast({ type: 'error', msg: 'Masukkan Telegram User ID atau @username.' })
      return
    }
    setLoading(true); setToast(null)
    try {
      const res = await api.post('/app_config/telegram_link', { identifier: identifier.trim() })
      if (res.data.ok) {
        setToast({ type: 'success', msg: res.data.detail })
        setIdentifier('')
        load()
        onSaved && onSaved()
      } else {
        setToast({ type: 'error', msg: res.data.error })
      }
    } catch (e) {
      setToast({ type: 'error', msg: e.response?.data?.error || e.message })
    } finally {
      setLoading(false)
    }
  }

  const handleAutoLink = async () => {
    setAutoLinking(true); setToast(null)
    try {
      const res = await api.post('/app_config/telegram_link/auto')
      if (res.data.ok) {
        setToast({ type: 'success', msg: res.data.detail })
        load()
        onSaved && onSaved()
      } else {
        setToast({ type: 'error', msg: res.data.error })
      }
    } catch (e) {
      setToast({ type: 'error', msg: e.response?.data?.error || e.message })
    } finally {
      setAutoLinking(false)
    }
  }

  const handleUnlink = async () => {
    if (!confirm(t('appconfig.konfirmasi_putus_telegram'))) return
    setUnlinking(true); setToast(null)
    try {
      await api.delete('/app_config/telegram_link')
      setToast({ type: 'success', msg: 'Link Telegram dihapus.' })
      load()
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
    } finally {
      setUnlinking(false)
    }
  }

  const connected = linkState?.connected
  const botConfigured = linkState?.bot_configured ?? telegramConfigured

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--orange-50)', color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Link2 size={18} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Link Akun Telegram
            {connected ? (
              <span className="badge badge-success"><CheckCircle size={11} /> Terhubung</span>
            ) : (
              <span className="badge badge-muted">Belum</span>
            )}
          </div>
          <div className="card-subtitle">
            Hubungkan akun Telegram Anda supaya bot bisa kirim notifikasi auto-apply &amp; Anda bisa balas/jawab pertanyaan via Telegram.
          </div>
        </div>
      </div>

      <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 20 }}>
        {!botConfigured && (
          <div className="notice notice-error" style={{ marginBottom: 14 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Set TELEGRAM_BOT_TOKEN dulu di kartu "Telegram Bot Token" di atas.</span>
          </div>
        )}

        {connected && (
          <div className="notice notice-success" style={{ marginBottom: 14 }}>
            <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              Akun Telegram Anda terhubung dengan chat_id <code style={{ fontFamily: 'var(--font-mono)' }}>{linkState.chat_id}</code>.
              Notifikasi akan dikirim ke chat ini.
            </div>
          </div>
        )}

        {!connected && (
          <>
            <div className="notice notice-info" style={{ marginBottom: 14 }}>
              <Bot size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Cara link (RECOMMENDED — auto):</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  <li>
                    Buka Telegram, cari bot <strong>@siordal_bot</strong>
                    {/* ── Direct link ke bot Telegram ───────────────────────────
                        User request v9: tambah link yang langsung mengarahkan
                        user ke bot Telegram di tab Persiapan. Klik link →
                        buka app Telegram (desktop/web) langsung ke chat bot. */}
                    {' '}(
                    <a
                      href="https://t.me/siordal_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >
                      buka bot <ExternalLink size={10} />
                    </a>
                    )
                  </li>
                  <li>Klik tombol <strong>Start</strong> atau kirim perintah <code style={{ fontFamily: 'var(--font-mono)' }}>/start</code></li>
                  <li>Kembali ke app, klik tombol <strong>"Auto-link via /start"</strong> di bawah</li>
                </ol>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gray-500)' }}>
                  Cara manual (kalau auto gagal): input User ID numerik (dari @userinfobot) atau @username, lalu klik "Link Manual".
                </div>
              </div>
            </div>

            {/* ── Tombol besar: buka bot Telegram langsung ────────────────────
                Tombol sekunder di atas auto-link, supaya user yang belum punya
                Telegram app terinstall bisa langsung ke t.me/siordal_bot
                (Telegram Web / minta install app). */}
            <a
              href="https://t.me/siordal_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '10px 16px', fontSize: 13,
                marginBottom: 10, textDecoration: 'none',
              }}
            >
              <Bot size={14} /> Buka Bot @siordal_bot di Telegram
              <ExternalLink size={11} />
            </a>

            {/* Auto-link button — RECOMMENDED */}
            <button
              onClick={handleAutoLink}
              disabled={autoLinking}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 16px', fontSize: 14 }}
            >
              {autoLinking ? <Loader size={14} className="animate-spin" /> : <Zap size={14} fill="white" />}
              {autoLinking ? 'Menghubungkan...' : 'Auto-link via /start'}
            </button>

            <div style={{ margin: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', position: 'relative' }}>
              <span style={{ background: 'var(--white)', padding: '0 12px', position: 'relative', zIndex: 1 }}>atau input manual</span>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--gray-200)' }} />
            </div>

            <label className="input-label">Telegram User ID atau @username</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="contoh: 123456789 atau @namasaya"
              className="input"
              style={{ fontFamily: 'var(--font-mono)' }}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="input-help">
              Tip: chat <code style={{ fontFamily: 'var(--font-mono)' }}>@userinfobot</code> di Telegram untuk dapat User ID numerik Anda.
            </div>

            <button
              onClick={handleLink}
              disabled={loading || !identifier.trim()}
              className="btn btn-secondary"
              style={{ marginTop: 14, width: '100%' }}
            >
              {loading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              Link Manual
            </button>
          </>
        )}

        {connected && (
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="btn btn-danger"
            style={{ width: '100%' }}
          >
            {unlinking ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Putuskan Link
          </button>
        )}

        <Toast {...(toast || {})} />
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// AutoApplyScheduleCard
// ─────────────────────────────────────────────────────────────────────────────
const DAYS = [
  { id: 'mon', label: 'Sen' },
  { id: 'tue', label: 'Sel' },
  { id: 'wed', label: 'Rab' },
  { id: 'thu', label: 'Kam' },
  { id: 'fri', label: 'Jum' },
  { id: 'sat', label: 'Sab' },
  { id: 'sun', label: 'Min' },
]

export function AutoApplyScheduleCard({ prefs, onSaved }) {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(!!prefs.auto_apply_enabled)
  const [hour, setHour] = useState(prefs.auto_apply_hour ?? 9)
  const [minute, setMinute] = useState(prefs.auto_apply_minute ?? 0)
  const [days, setDays] = useState(prefs.auto_apply_days || 'mon,tue,wed,thu,fri')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    setEnabled(!!prefs.auto_apply_enabled)
    setHour(prefs.auto_apply_hour ?? 9)
    setMinute(prefs.auto_apply_minute ?? 0)
    setDays(prefs.auto_apply_days || 'mon,tue,wed,thu,fri')
  }, [prefs])

  const toggleDay = (dayId) => {
    const arr = days.split(',').filter(Boolean)
    const has = arr.includes(dayId)
    const next = has ? arr.filter(d => d !== dayId) : [...arr, dayId]
    setDays(next.join(','))
  }

  const handleSave = async () => {
    setLoading(true); setToast(null)
    try {
      await api.put('/preferences', {
        auto_apply_enabled: enabled ? 1 : 0,
        auto_apply_hour: Number(hour),
        auto_apply_minute: Number(minute),
        auto_apply_days: days,
      })
      setToast({ type: 'success', msg: t('appconfig.jadwal_disimpan') })
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `Gagal: ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--orange-50)',
          color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Calendar size={18} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title">Jadwal Auto-Apply</div>
          <div className="card-subtitle">Bot akan otomatis melamar sesuai jadwal ini tiap hari.</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="card-pad" style={{ paddingTop: 18, paddingBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label className="input-label">
              <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Jam
            </label>
            <select
              value={hour}
              onChange={e => setHour(e.target.value)}
              disabled={!enabled}
              className="select"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--gray-400)',
            paddingBottom: 9,
          }}>:</div>
          <div style={{ flex: 1 }}>
            <label className="input-label">Menit</label>
            <select
              value={minute}
              onChange={e => setMinute(e.target.value)}
              disabled={!enabled}
              className="select"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', paddingBottom: 11 }}>
            WIB
          </div>
        </div>

        <label className="input-label">Hari Aktif</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DAYS.map(d => {
            const active = days.split(',').includes(d.id)
            return (
              <button
                key={d.id}
                onClick={() => toggleDay(d.id)}
                disabled={!enabled}
                style={{
                  flex: '1 1 0',
                  minWidth: 38,
                  padding: '8px 4px',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  background: active ? 'var(--orange)' : 'var(--white)',
                  color: active ? 'white' : 'var(--gray-500)',
                  border: `1px solid ${active ? 'var(--orange)' : 'var(--gray-300)'}`,
                  borderRadius: 6,
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  transition: 'all 0.12s ease',
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 16 }}
        >
          {loading ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          Simpan Jadwal
        </button>

        <Toast {...(toast || {})} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PreferencesCard
// ─────────────────────────────────────────────────────────────────────────────
export function PreferencesCard({ prefs, onSaved }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    expected_salary: prefs.expected_salary || '',
    available_join: prefs.available_join || '',
    headless_mode: !!prefs.headless_mode,
    testing_email_mode: !!prefs.testing_email_mode,
  })
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    setForm({
      expected_salary: prefs.expected_salary || '',
      available_join: prefs.available_join || '',
      headless_mode: !!prefs.headless_mode,
      testing_email_mode: !!prefs.testing_email_mode,
    })
  }, [prefs])

  const handleSave = async () => {
    setLoading(true); setToast(null)
    try {
      await api.put('/preferences', {
        expected_salary: form.expected_salary,
        available_join: form.available_join,
        headless_mode: form.headless_mode ? 1 : 0,
        testing_email_mode: form.testing_email_mode ? 1 : 0,
      })
      setToast({ type: 'success', msg: t('appconfig.prefs_disimpan') })
      onSaved && onSaved()
    } catch (e) {
      setToast({ type: 'error', msg: `Gagal: ${e.message}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--orange-50)',
          color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Key size={18} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="card-title">Preferensi</div>
          <div className="card-subtitle">Info yang dipakai bot saat menjawab form pertanyaan.</div>
        </div>
      </div>

      <div className="card-pad" style={{ paddingTop: 18, paddingBottom: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <label className="input-label">Expected Salary</label>
          <input
            type="text"
            value={form.expected_salary}
            onChange={e => setForm(f => ({ ...f, expected_salary: e.target.value }))}
            placeholder="contoh: 8–10 juta IDR / bulan"
            className="input"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="input-label">Available Join</label>
          <input
            type="text"
            value={form.available_join}
            onChange={e => setForm(f => ({ ...f, available_join: e.target.value }))}
            placeholder="contoh: 30 hari / segera / 1 Maret 2026"
            className="input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.headless_mode}
                onChange={e => setForm(f => ({ ...f, headless_mode: e.target.checked }))}
              />
              <span className="toggle-slider" />
            </label>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-900)' }}>Headless Mode</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                Browser berjalan tersembunyi (tidak muncul di layar).
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.testing_email_mode}
                onChange={e => setForm(f => ({ ...f, testing_email_mode: e.target.checked }))}
              />
              <span className="toggle-slider" />
            </label>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-900)' }}>Testing Email Mode</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                Email recruiter dikirim ke email sendiri (max 3 per session) — untuk verifikasi.
              </div>
            </div>
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {loading ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          Simpan Preferensi
        </button>

        <Toast {...(toast || {})} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main — unified single grid, no early-return on error (Telegram stays visible)
// ─────────────────────────────────────────────────────────────────────────────
export default function AppConfig() {
  const { t } = useI18n()
  const [secrets, setSecrets] = useState([])
  const [prefs, setPrefs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = async (retryCount = 0) => {
    setLoading(true); setError(null)
    try {
      const [secRes, prefRes] = await Promise.all([
        api.get('/app_config'),
        api.get('/preferences'),
      ])
      setSecrets(secRes.data.secrets || [])
      setPrefs(prefRes.data || {})
    } catch (e) {
      // Axios errors: check e.response.status (not e.message which is generic)
      const status = e.response?.status
      const is404 = status === 404
      const isNetwork = !status || e.message?.includes('Network Error') || e.message?.includes('ERR')
      // Auto-retry 3x dengan delay 1s — kadang backend baru start saat app dibuka
      if (retryCount < 3 && (is404 || isNetwork)) {
        console.log(`AppConfig retry ${retryCount + 1}/3... (status=${status})`)
        setTimeout(() => refresh(retryCount + 1), 1000)
        return
      }
      setError(e.message || `HTTP ${status || '?'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // JANGAN early-return! Render semua cards meskipun error — Telegram tetap visible.
  // Card sendiri punya state loading/error inline, tidak nuke entire section.

  // Default secrets (kalau API gagal, tetap render card dengan configured=false)
  const fallbackSecrets = (secrets.length > 0 ? secrets : [
    {
      key: 'TELEGRAM_BOT_TOKEN',
      label: 'Telegram Bot Token',
      description: t('persiapan.telegram.desc_long'),
      link: 'https://t.me/BotFather',
      configured: false,
      masked: '',
      test_endpoint: '/api/app_config/test/telegram',
    },
  ]).filter(s => s.key !== 'GEMINI_API_KEY')  // Gemini ada di page AI, jangan duplikat di Persiapan

  return (
    <div>
      {/* Inline error banner (TIDAK menggantikan cards, hanya muncul di atas) */}
      {error && (
        <div className="notice notice-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            Gagal memuat konfigurasi: {error}. Pastikan backend sudah jalan.
            <button onClick={() => refresh()} className="btn btn-secondary" style={{ marginLeft: 10, padding: '4px 10px' }}>
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Loading state — inline, tidak menutup cards lain */}
      {loading && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--gray-500)' }}>
          <Loader size={14} className="animate-spin" />
          Memuat konfigurasi...
        </div>
      )}

      {/* Section 1: API Keys + Link Telegram (one unified grid) */}
      <div className="section-header">
        <h2><Sparkles size={15} color="var(--orange)" /> API Keys &amp; Bot Telegram</h2>
        <p>Disimpan terenkripsi (Fernet AES-128) di lokal app — tidak pernah dikirim keluar.</p>
      </div>

      <div className="grid-cards" style={{ marginBottom: 32 }}>
        {fallbackSecrets.map(secret => (
          <SecretCard key={secret.key} secret={secret} onSaved={refresh} />
        ))}
        <TelegramLinkCard
          telegramConfigured={fallbackSecrets.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.configured}
          onSaved={refresh}
        />
      </div>

      {/* Section 2: Schedule & Preferences */}
      <div className="section-header">
        <h2><Calendar size={15} color="var(--orange)" /> Jadwal &amp; Preferensi</h2>
        <p>Atur kapan bot jalan otomatis &amp; info yang dipakai saat menjawab form.</p>
      </div>

      <div className="grid-cards">
        <AutoApplyScheduleCard prefs={prefs} onSaved={refresh} />
        <PreferencesCard prefs={prefs} onSaved={refresh} />
      </div>
    </div>
  )
}

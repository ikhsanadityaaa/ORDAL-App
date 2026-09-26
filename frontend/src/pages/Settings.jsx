import { useEffect, useState } from 'react'
import {
  ExternalLink, Terminal, Trash2, RefreshCw, Loader, Mail,
  Eye, EyeOff, CheckCircle, Send, Copy,
  AlertCircle, Info, FileText, FolderOpen, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'
import { PlatformLogo } from '../components/brand'

const PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',  desc: 'Dipakai untuk LinkedIn Jobs dan LinkedIn Posts', loginUrl: 'https://www.linkedin.com/login' },
  { id: 'jobstreet', label: 'JobStreet', desc: 'Dipakai untuk JobStreet Indonesia', loginUrl: 'https://id.jobstreet.com/id' },
]

function isPlaywrightError(text) {
  return text && (text.includes("Executable doesn't exist") || text.includes("playwright install") || text.includes("BrowserType.launch"))
}

function Toast({ msg }) {
  if (!msg) return null
  const cls = msg.type === 'success' ? 'notice-success'
    : msg.type === 'error' ? 'notice-error'
    : msg.type === 'warn' ? 'notice-error'
    : 'notice-info'
  return (
    <div className={`notice ${cls}`} style={{ marginBottom: 12 }}>
      {msg.type === 'playwright' ? (
        <>
          <Terminal size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Playwright browser belum terinstall</div>
            <div style={{ fontSize: 11, marginBottom: 8 }}>Jalankan di terminal backend (venv aktif):</div>
            <pre style={{
              background: 'var(--black)', color: '#10b981',
              padding: '8px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              margin: 0, overflowX: 'auto' }}>{`source .venv/bin/activate\npython -m playwright install chromium`}</pre>
          </div>
        </>
      ) : (
        <>
          {msg.type === 'success' ? <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            : msg.type === 'error' ? <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            : <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
          <div>
            {msg.text}
            {msg.loginUrl && (
              <a href={msg.loginUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 4, fontWeight: 600 }}>
                → Buka halaman login {msg.platform}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PlatformCard({ platform, status, onGrab, onLogout, loading }) {
  const { t, lang } = useI18n()
  const isLoggedIn = status?.logged_in
  const needsCapture = status?.needs_capture
  const isLoading = loading === platform.id

  return (
    <div className="card" style={{ height: '100%' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* v26: logo asli LinkedIn/JobStreet */}
          <PlatformLogo platformId={platform.id} size={24} />
          <div style={{ minWidth: 0 }}>
            <div className="card-title" style={{ fontSize: 14 }}>{platform.label}</div>
          </div>
        </div>
        {isLoggedIn ? (
          <span className="badge badge-success" style={{ fontSize: 10 }}><CheckCircle size={10} /> Aktif</span>
        ) : needsCapture ? (
          <span className="badge badge-warning" style={{ fontSize: 10 }}>Perlu capture</span>
        ) : (
          <span className="badge badge-muted" style={{ fontSize: 10 }}>Belum</span>
        )}
      </div>

      <div className="card-pad" style={{ paddingTop: 12, paddingBottom: 14 }}>
        {!isLoggedIn && (
          <div className="notice notice-info" style={{ marginBottom: 10, padding: '8px 10px' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 11 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{needsCapture ? t('settings.session_not_captured') : t('settings.cara_login')}</div>
              <ol style={{ margin: 0, paddingLeft: 14, fontSize: 11, lineHeight: 1.5 }}>
                <li>Klik <strong>Capture Session</strong>.</li>
                <li>Login ke {platform.label} di browser yang terbuka.</li>
                <li>Tunggu ORDAL menyimpan session.</li>
              </ol>
            </div>
          </div>
        )}

        {isLoggedIn && (
          <div className="notice notice-success" style={{ marginBottom: 10, padding: '8px 10px' }}>
            <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12 }}>Session aktif. ORDAL bisa membaca {platform.label}.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a href={platform.loginUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }}>
            <ExternalLink size={12} /> Buka
          </a>
          <button onClick={() => onGrab(platform.id)} disabled={isLoading} className="btn btn-primary" style={{ flex: 1, minWidth: 100, fontSize: 11, padding: '6px 10px' }}>
            {isLoading ? (
              <>
                <Loader size={12} className="animate-spin" /> Menunggu...
              </>
            ) : isLoggedIn ? (
              <>
                <RefreshCw size={12} /> Capture Ulang
              </>
            ) : (
              '▶ Capture Session'
            )}
          </button>
          {isLoggedIn && (
            <button onClick={() => onLogout(platform.id)} className="btn btn-danger" style={{ fontSize: 11, padding: '6px 10px' }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailConfigCard() {
  const { t, lang } = useI18n()
  const appPasswordUrl = 'https://myaccount.google.com/apppasswords'
  const [config,   setConfig]   = useState(null)
  const [form,     setForm]     = useState({ smtp_host: 'smtp.gmail.com', smtp_port: 587, sender_email: '', app_password: '' })
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [message,  setMessage]  = useState(null)
  const [editing,  setEditing]  = useState(false)

  useEffect(() => {
    api.get('/email/status').then(r => {
      setConfig(r.data)
      if (r.data.configured) {
        setForm(f => ({
          ...f,
          smtp_host:    r.data.smtp_host || 'smtp.gmail.com',
          smtp_port:    r.data.smtp_port || 587,
          sender_email: r.data.sender || '' }))
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!form.sender_email.trim()) { setMessage({ type: 'error', text: t('settings.email.sender_required') }); return }
    if (!form.app_password.trim()) { setMessage({ type: 'error', text: lang === 'id' ? 'App Password wajib diisi' : 'App Password is required' }); return }
    setSaving(true)
    try {
      await api.put('/email', form)
      const r = await api.get('/email/status')
      setConfig(r.data)
      setMessage({ type: 'success', text: t('settings.email.saved') })
      setEditing(false)
      setForm(f => ({ ...f, app_password: '' }))
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || t('settings.email.gagal_simpan') })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm(t('settings.email.konfirmasi_hapus'))) return
    await api.delete('/email')
    setConfig({ configured: false, sender: '', smtp_host: 'smtp.gmail.com', smtp_port: 587 })
    setForm({ smtp_host: 'smtp.gmail.com', smtp_port: 587, sender_email: '', app_password: '' })
    setMessage({ type: 'success', text: lang === 'id' ? 'Konfigurasi email dihapus' : 'Email configuration deleted' })
    setEditing(false)
  }

  const handleTestEmail = async () => {
    setTesting(true)
    try {
      const recipient = config?.sender || form.sender_email
      const res = await api.post('/email/test', { recipient_email: recipient })
      setMessage({ type: 'success', text: res.data.message })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || (lang === 'id' ? 'Gagal mengirim email test' : 'Failed to send test email') })
    } finally { setTesting(false) }
  }

  const isConfigured = config?.configured

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'var(--orange-50)', color: 'var(--orange)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={18} strokeWidth={2.25} />
          </div>
          <div>
            <div className="card-title">Email Otomatis</div>
            <div className="card-subtitle">Dipakai untuk kirim lamaran via email saat bot menemukan lowongan dari LinkedIn Posts.</div>
          </div>
        </div>
        {isConfigured ? (
          <span className="badge badge-success"><CheckCircle size={11} /> Aktif</span>
        ) : (
          <span className="badge badge-muted">Belum</span>
        )}
      </div>

      <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 18 }}>
        <Toast msg={message} />

        {isConfigured && !editing && (
          <div className="notice notice-success" style={{ marginBottom: 14 }}>
            <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Mengirim dari <strong>{config.sender}</strong> via {config.smtp_host}.
              Gunakan test email dulu untuk memastikan SMTP siap sebelum kirim ke email perusahaan.
            </span>
          </div>
        )}

        {(!isConfigured || editing) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            <div className="notice notice-info">
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Cara pakai Gmail:</div>
                <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
                  <li>Aktifkan 2-Factor Authentication di akun Google.</li>
                  <li>Buka <a href={appPasswordUrl} target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a></li>
                  <li>Buat App Password baru → pilih "Mail".</li>
                  <li>Copy 16-digit kode ke kolom App Password di bawah.</li>
                </ol>
              </div>
            </div>

            <div>
              <label className="input-label">Email Pengirim</label>
              <input
                type="email"
                value={form.sender_email}
                onChange={e => setForm(f => ({ ...f, sender_email: e.target.value }))}
                placeholder="kamu@gmail.com"
                className="input"
              />
            </div>
            <div>
              <label className="input-label">App Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.app_password}
                  onChange={e => setForm(f => ({ ...f, app_password: e.target.value }))}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="input"
                  style={{ paddingRight: 38, fontFamily: 'var(--font-mono)' }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', padding: 4,
                    color: 'var(--gray-500)', cursor: 'pointer' }}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <a
                href={appPasswordUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <ExternalLink size={12} /> Dapatkan App Password di Google Account
              </a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <div>
                <label className="input-label">SMTP Host</label>
                <input
                  type="text"
                  value={form.smtp_host}
                  onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">Port</label>
                <input
                  type="number"
                  value={form.smtp_port}
                  onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))}
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(!isConfigured || editing) && (
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />}
              Simpan
            </button>
          )}
          {isConfigured && !editing && (
            <button onClick={() => setEditing(true)} className="btn btn-secondary">
              <RefreshCw size={13} /> Edit
            </button>
          )}
          {isConfigured && !editing && (
            <button onClick={handleTestEmail} disabled={testing} className="btn btn-primary">
              {testing ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              Test ke email sendiri
            </button>
          )}
          {isConfigured && (
            <button onClick={handleDelete} className="btn btn-danger">
              <Trash2 size={13} /> Hapus
            </button>
          )}
          {editing && (
            <button onClick={() => { setEditing(false); setMessage(null) }} className="btn btn-secondary">
              Batal
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Debug Log Card ─────────────────────────────────────────────────────────
// Tampilkan N baris terakhir log backend + tombol buka folder log di
// Finder/Explorer. Penting untuk debugging di app mode (Mac/Windows build)
// di mana tidak ada console yang terlihat.
function DebugLogCard() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [logPath, setLogPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const { t, lang } = useI18n()

  const fetchLog = async (lines = 200) => {
    setLoading(true)
    setMsg(null)
    try {
      const res = await api.get('/debug/log', { params: { lines } })
      setContent(res.data.content || '(log kosong)')
      setLogPath(res.data.log_file_path || '')
    } catch (err) {
      setMsg({ text: err.response?.data?.detail || (lang === 'id' ? 'Gagal memuat log' : 'Failed to load log'), type: 'error' })
    } finally { setLoading(false) }
  }

  const openFolder = async () => {
    setMsg(null)
    try {
      const res = await api.post('/debug/log/open')
      if (res.data.ok) {
        setMsg({ text: `Folder log dibuka: ${res.data.log_file_path}`, type: 'success' })
      } else {
        // Fallback: tampilkan path supaya user bisa buka manual
        setMsg({ text: `Buka manual: ${res.data.log_file_path}`, type: 'warn' })
      }
    } catch (err) {
      setMsg({ text: err.response?.data?.detail || t('settings.log.gagal_buka_folder'), type: 'error' })
    }
  }

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setMsg({ text: lang === 'id' ? 'Log disalin ke clipboard' : 'Log copied to clipboard', type: 'success' })
    } catch {
      setMsg({ text: 'Gagal copy. Buka folder log & copy manual.', type: 'warn' })
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} /> {t('settings.log.title')}
          </div>
          <div className="card-subtitle">{t('settings.log.subtitle')}</div>
        </div>
        <button
          onClick={() => {
            const next = !open
            setOpen(next)
            if (next && !content) fetchLog(200)
          }}
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
        >
          {open ? <><ChevronUp size={13} /> {t('settings.log.tutup')}</> : <><ChevronDown size={13} /> {t('settings.log.buka')}</>}
        </button>
      </div>

      {open && (
        <div className="card-pad" style={{ paddingTop: 14, paddingBottom: 16 }}>
          {msg && (
            <div className={`notice ${msg.type === 'success' ? 'notice-success' : msg.type === 'error' ? 'notice-error' : 'notice-info'}`} style={{ marginBottom: 10 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12 }}>{msg.text}</div>
            </div>
          )}

          {logPath && (
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8, fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
              File: {logPath}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button onClick={() => fetchLog(200)} disabled={loading} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <RefreshCw size={12} /> {loading ? (lang === 'id' ? 'Memuat...' : 'Loading...') : `${t('settings.log.refresh')} (200)`}
            </button>
            <button onClick={() => fetchLog(500)} disabled={loading} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <RefreshCw size={12} /> 500 {t('settings.log.baris')}
            </button>
            <button onClick={copyLog} disabled={!content} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <Copy size={12} /> {t('settings.log.copy')}
            </button>
            <button onClick={openFolder} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <FolderOpen size={12} /> {t('settings.log.folder')}
            </button>
          </div>

          <pre style={{
            background: 'var(--black)', color: '#d4d4d4',
            padding: '12px 10px', borderRadius: 6,
            fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
            lineHeight: 1.5, margin: 0, overflow: 'auto',
            maxHeight: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{content || t('settings.log.empty')}</pre>
        </div>
      )}
    </div>
  )
}

export default function Settings({ embedded = false }) {
  const { t, lang } = useI18n()
  const [status,  setStatus]  = useState({})
  const [loading, setLoading] = useState(null)
  const [message, setMessage] = useState(null)

  const fetchStatus = () => api.get('/credentials/status').then(r => setStatus(r.data)).catch(() => {})
  useEffect(() => { fetchStatus() }, [])

  const handleGrab = async (platformId) => {
    setLoading(platformId)
    setMessage({ text: lang === 'id' ? 'Browser login sedang dibuka...' : 'Opening login browser...', type: 'info' })
    try {
      const res = await api.post(`/credentials/grab/${platformId}`, {}, { timeout: 310000 })
      if (res.data.success) {
        setMessage({ text: res.data.message, type: 'success' })
        fetchStatus()
      } else {
        // v15: handle error_type internet_disconnected dengan pesan yang jelas
        if (res.data.error_type === 'internet_disconnected') {
          setMessage({
            text: `📡 ${res.data.message}`,
            type: 'error',
          })
        } else {
          setMessage({ text: res.data.message, type: 'warn', loginUrl: res.data.login_url, platform: platformId })
        }
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Gagal mendeteksi session.'
      // v15: deteksi error network di HTTPException juga
      if (detail.includes('ERR_INTERNET_DISCONNECTED') || detail.includes('INTERNET_DISCONNECTED')) {
        setMessage({
          text: `📡 Tidak bisa terhubung ke internet. Periksa koneksi internet Anda dan coba lagi.`,
          type: 'error',
        })
      } else {
        setMessage({ text: detail, type: isPlaywrightError(detail) ? 'playwright' : 'error' })
      }
    } finally { setLoading(null) }
  }

  const handleLogout = async (platformId) => {
    if (!confirm(`Hapus session ${platformId}?`)) return
    await api.delete(`/credentials/${platformId}`)
    setMessage({ text: `Session ${platformId} dihapus`, type: 'success' })
    fetchStatus()
  }

  return (
    <div style={{ maxWidth: embedded ? 'none' : 620 }}>
      <Toast msg={message} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* v26: Platform cards dalam 2 kolom (LinkedIn + JobStreet side by side) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {PLATFORMS.map(p => (
            <PlatformCard
              key={p.id}
              platform={p}
              status={status[p.id]}
              onGrab={handleGrab}
              onLogout={handleLogout}
              loading={loading}
            />
          ))}
        </div>

        <EmailConfigCard />

        {/* DebugLogCard dihapus dari Persiapan > Apply (v13).
            Log Backend sekarang hanya bisa diakses via tombol "Cek Log"
            di sidebar bawah. Sebelumnya DebugLogCard muncul di tab Apply
            bikin halaman panjang dan redundant dengan tombol sidebar. */}

        <div className="notice notice-info">
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Kenapa login lewat browser app?</div>
            <div style={{ fontSize: 12 }}>
              Login di tab Chrome biasa belum cukup untuk bot. ORDAL perlu capture session lewat browser Playwright supaya LinkedIn dan JobStreet bisa dibaca otomatis.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Send } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

export default function Feedback() {
  const { lang } = useI18n()
  const id = lang === 'id'
  const [form, setForm] = useState({ category: 'suggestion', message: '', include_diagnostics: false })
  const [state, setState] = useState({ loading: false, receipt: '', error: '' })

  const submit = async (event) => {
    event.preventDefault()
    setState({ loading: true, receipt: '', error: '' })
    try {
      const response = await api.post('/product/feedback', form)
      setState({ loading: false, receipt: response.data.reference, error: '' })
      setForm((current) => ({ ...current, message: '' }))
    } catch (error) {
      setState({ loading: false, receipt: '', error: error.response?.data?.detail?.message || error.response?.data?.detail || 'Feedback gagal dikirim' })
    }
  }

  return (
    <div style={{ padding: '34px clamp(24px, 5vw, 70px)', maxWidth: 850, margin: '0 auto' }}>
      <p className="font-pixel" style={{ fontSize: 9, color: 'var(--orange)', marginBottom: 8 }}>FEEDBACK</p>
      <h1 style={{ fontSize: 30, fontWeight: 900 }}>{id ? 'Bantu ORDAL lebih baik' : 'Help ORDAL improve'}</h1>
      <p style={{ color: 'var(--muted)', margin: '7px 0 22px' }}>{id ? 'Ceritakan masalah atau ide kamu. Feedback disimpan maksimal 30 hari.' : 'Share a problem or idea. Feedback is retained for up to 30 days.'}</p>
      <form onSubmit={submit} className="card-pixel" style={{ padding: 22, display: 'grid', gap: 16 }}>
        <label><strong>{id ? 'Kategori' : 'Category'}</strong><select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} style={{ width: '100%', marginTop: 8 }}><option value="bug">Bug</option><option value="suggestion">{id ? 'Saran' : 'Suggestion'}</option><option value="automation">Automation</option><option value="account">{id ? 'Akun' : 'Account'}</option><option value="payment">{id ? 'Pembayaran' : 'Payment'}</option><option value="other">{id ? 'Lainnya' : 'Other'}</option></select></label>
        <label><strong>{id ? 'Pesan' : 'Message'}</strong><textarea className="input" required maxLength={4000} rows={8} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder={id ? 'Apa yang terjadi? Apa yang kamu harapkan?' : 'What happened? What did you expect?'} style={{ width: '100%', marginTop: 8, resize: 'vertical' }} /></label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={form.include_diagnostics} onChange={(event) => setForm({ ...form, include_diagnostics: event.target.checked })} /><span><strong>{id ? 'Sertakan info teknis' : 'Include technical info'}</strong><small style={{ display: 'block', color: 'var(--muted)', marginTop: 3 }}>{id ? 'Versi aplikasi, OS, versi Python, dan arsitektur perangkat. Tidak termasuk CV, API key, password, atau isi lamaran.' : 'App version, OS, Python version, and device architecture. Never CVs, API keys, passwords, or application contents.'}</small></span></label>
        {state.receipt && <div style={{ padding: 13, borderRadius: 12, background: '#E7F7EC', border: '2px solid #238636' }}>{id ? 'Terkirim. Nomor laporan: ' : 'Sent. Reference: '}<strong>{state.receipt}</strong></div>}
        {state.error && <div style={{ color: '#B42318' }}>{String(state.error)}</div>}
        <button className="btn btn-primary" disabled={state.loading || !form.message.trim()} style={{ justifySelf: 'start' }}><Send size={16} />{state.loading ? (id ? 'Mengirim...' : 'Sending...') : (id ? 'Kirim feedback' : 'Send feedback')}</button>
      </form>
    </div>
  )
}

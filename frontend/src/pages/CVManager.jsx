import { useEffect, useRef, useState } from 'react'
import { FileText, Trash2, Upload, X } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

export default function CVManager({ embedded = false }) {
  const { t, lang } = useI18n()
  const [cvs,       setCvs]       = useState([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [label,     setLabel]     = useState('')
  const [file,      setFile]      = useState(null)
  const fileRef = useRef()

  const fetchCvs = () => api.get('/cvs/').then(r => setCvs(r.data)).finally(() => setLoading(false))
  useEffect(() => { fetchCvs() }, [])

  const handleUpload = async () => {
    if (!file)  { setError(t('cv.pilih_file_dulu')); return }
    if (!label) { setError(t('cv.isi_label')); return }
    setError(''); setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('position_label', label)
    try {
      await api.post('/cvs/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setFile(null); setLabel('')
      if (fileRef.current) fileRef.current.value = ''
      fetchCvs()
    } catch (err) { 
      const msg = err.response?.data?.detail || t('cv.upload_gagal')
      setError(msg)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
    finally { setUploading(false) }
  }

  const handleDelete = async id => {
    if (!confirm(lang === 'id' ? 'Hapus CV ini?' : 'Delete this CV?')) return
    await api.delete(`/cvs/${id}`)
    setCvs(c => c.filter(x => x.id !== id))
  }

  return (
    <div style={{ maxWidth: embedded ? 'none' : 680 }}>
      {/* Upload card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">{lang === 'id' ? 'Upload CV Baru' : 'Upload New CV'}</div>
        </div>
        <div className="card-pad" style={{ paddingTop: 16, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="notice notice-error">{error}</div>}
          <div>
            <label className="input-label">{t('cv.label')}</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={lang === 'id' ? 'contoh: Purchasing Specialist' : 'e.g. Purchasing Specialist'}
              className="input"
            />
          </div>
          <div>
            <label className="input-label">{lang === 'id' ? 'File PDF' : 'PDF File'}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={e => setFile(e.target.files[0])}
                className="input"
                style={{ padding: '7px 10px', flex: 1 }}
              />
              {file && (
                <button
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="btn btn-ghost"
                  style={{ padding: '8px 10px' }}
                  aria-label="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {file && (
              <div className="input-help" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <FileText size={11} /> {file.name}
              </div>
            )}
          </div>
          <button onClick={handleUpload} disabled={uploading} className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '7px 14px', fontSize: 13 }}>
            {uploading ? null : <Upload size={12} />} {uploading ? (lang === 'id' ? 'Uploading...' : 'Uploading...') : (lang === 'id' ? 'Upload' : 'Upload')}
          </button>
        </div>
      </div>

      {/* CV list */}
      <div className="card">
        <div className="card-header">
          <span className="eyebrow">{lang === 'id' ? 'CV Tersimpan' : 'Saved CVs'}</span>
        </div>
        <div style={{ padding: 12 }}>
          {loading ? (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--gray-500)' }}>{t('cari_kerja.memuat')}</div>
          ) : cvs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px dashed var(--gray-300)', borderRadius: 8 }}>
              <FileText size={28} style={{ color: 'var(--gray-300)', margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>{t('cv.belum_ada')}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
                {lang === 'id' ? 'Upload CV PDF untuk dipakai saat apply.' : 'Upload a PDF CV to use when applying.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cvs.map(cv => {
                const hasText = cv.cv_text && cv.cv_text.trim().length > 0
                return (
                  <div key={cv.id} style={{
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--gray-50)',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6,
                        background: hasText ? 'var(--orange-50)' : 'var(--red-50)',
                        color: hasText ? 'var(--orange)' : 'var(--red)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FileText size={15} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{cv.position_label}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{cv.file_name}</div>
                        {!hasText && (
                          <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2, fontWeight: 500 }}>
                            ⚠️ {lang === 'id' ? 'Teks CV belum ter-ekstrak (PDF mungkin hasil scan/gambar)' : 'CV text not extracted (PDF may be scanned/image-based)'}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(cv.id)}
                      className="btn btn-danger"
                      style={{ padding: '6px 10px' }}
                      aria-label="Hapus"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

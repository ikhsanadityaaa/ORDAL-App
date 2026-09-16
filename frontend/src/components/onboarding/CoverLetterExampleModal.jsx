import { FileText, Sparkles, CheckCircle2 } from 'lucide-react'
import useI18n from '../../stores/i18nStore'

// ─────────────────────────────────────────────────────────────────────────────
// CoverLetterExampleModal — contoh cover letter lengkap dengan placeholder
// {company} dan {position} (sesuai permintaan user). Tombol "Pakai Contoh Ini".
// ─────────────────────────────────────────────────────────────────────────────

export const COVER_LETTER_EXAMPLE = `Halo Tim {company},

Saya tertarik dengan posisi {position} yang terbuka di {company}. Dengan latar belakang pendidikan dan pengalaman kerja saya yang sesuai dengan kebutuhan posisi ini, saya yakin dapat memberikan kontribusi yang berarti bagi tim Anda.

Selama berkarier, saya telah terbiasa bekerja dengan target yang jelas, berkolaborasi lintas tim, dan terus belajar hal-hal baru. Beberapa pencapaian yang relevan dengan posisi {position} antara lain menyelesaikan proyek tepat waktu, meningkatkan efisiensi proses kerja, dan beradaptasi cepat terhadap teknologi atau tools terbaru di bidang ini.

Saya melihat {company} sebagai tempat yang tepat untuk berkembang lebih jauh, karena reputasi dan nilai-nilai perusahaan yang selalu saya ikuti perkembangannya. Saya sangat antusias jika diberikan kesempatan untuk berdiskusi lebih lanjut mengenai bagaimana skill saya dapat mendukung tim {position} di {company}.

Terlampir CV saya untuk pertimbangan lebih detail. Terima kasih atas waktu dan perhatiannya. Saya menantikan kabar baik dari Anda.

Hormat saya,
[Nama Anda]`

export default function CoverLetterExampleModal({ open, onClose, onUse }) {
  const { t } = useI18n()
  if (!open) return null

  const highlight = (text) => {
    // Sorot placeholder {company} dan {position} dengan warna oranye
    const parts = text.split(/(\{company\}|\{position\})/g)
    return parts.map((p, i) => {
      if (p === '{company}' || p === '{position}') {
        return (
          <mark key={i} style={{
            background: 'rgba(242,102,26,0.18)',
            color: '#D65511', fontWeight: 700,
            borderRadius: 4, padding: '0 3px',
          }}>{p}</mark>
        )
      }
      return <span key={i}>{p}</span>
    })
  }

  const paragraphs = COVER_LETTER_EXAMPLE.split('\n\n')

  return (
    <div className="sticker-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sticker-modal wide" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="sticker-modal-header">
          <span className="deco-glyph" style={{ top: 14, right: 22, color: 'rgba(242,102,26,0.55)' }}>✦</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 36, height: 36, background: '#F2661A',
              border: '2px solid rgba(244,242,236,0.35)', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <FileText size={17} strokeWidth={2.2} />
            </div>
            <div style={{ color: '#F4F2EC', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>ORDAL</div>
          </div>
          <h2>{t('cover.title')}</h2>
          <p>{t('cover.sub')}</p>
        </div>

        <div className="sticker-modal-body" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {/* Penjelasan placeholder */}
          <div className="notice notice-info" style={{ marginBottom: 16 }}>
            <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              {t('cover.explain')}{' '}
              <b>{t('cover.ph_company')}</b> {t('cover.and')} <b>{t('cover.ph_position')}</b>{' '}
              {t('cover.auto_replace')}
            </span>
          </div>

          {/* Contoh surat */}
          <div className="card-flat" style={{ padding: '18px 20px', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.75, color: '#33363F', whiteSpace: 'pre-line' }}>
              {paragraphs.map((p, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{highlight(p)}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="sticker-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button className="btn btn-primary" onClick={() => onUse(COVER_LETTER_EXAMPLE)}>
            <CheckCircle2 size={15} />
            {t('cover.use_example')}
          </button>
        </div>
      </div>
    </div>
  )
}

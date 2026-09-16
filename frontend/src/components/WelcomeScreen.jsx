import { CheckCircle2, FileText, Zap, Mail } from 'lucide-react'
import useI18n from '../stores/i18nStore'
import { SpinBadge } from './brand'

// ─────────────────────────────────────────────────────────────────────────────
// WelcomeScreen — layar di belakang popup login (gaya hero ORDAL-Web):
// dot pattern + wash warna, chip badge miring, judul besar + highlight,
// floating sticker cards, marquee band oranye, spin badge.
// ─────────────────────────────────────────────────────────────────────────────

const MARQUEE_ITEMS = ['AUTO APPLY', 'JOBSTREET', 'LINKEDIN', 'COVER LETTER OTOMATIS', 'RIWAYAT LAMARAN', 'AI AGENT']

export default function WelcomeScreen() {
  const { t, lang } = useI18n()

  return (
    <div className="dot-pattern" style={{
      position: 'relative',
      height: '100%',
      overflow: 'hidden',
      background: '#F4F2EC',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>
      {/* Wash warna blur (satu-satunya "glow") */}
      <div style={{ position: 'absolute', top: '-120px', left: '10%', width: 380, height: 380, background: 'rgba(242,102,26,0.10)', borderRadius: '50%', filter: 'blur(90px)' }} />
      <div style={{ position: 'absolute', bottom: '-100px', right: '8%', width: 340, height: 340, background: 'rgba(23,62,118,0.10)', borderRadius: '50%', filter: 'blur(90px)' }} />
      <span style={{ position: 'absolute', top: 90, right: '16%', fontSize: 26, color: 'rgba(51,54,63,0.18)' }} className="animate-float">✦</span>
      <span style={{ position: 'absolute', top: 200, left: '12%', fontSize: 30, color: 'rgba(242,102,26,0.35)' }} className="animate-wiggle">✳</span>

      {/* Badge chip miring */}
      <div style={{
        transform: 'rotate(-2deg)',
        marginBottom: 26,
        display: 'flex',
        justifyContent: 'center',
      }}>
        <span className="chip-sticker">
          <Zap size={13} color="#F2661A" />
          AI JOB SEARCH AGENT
        </span>
      </div>

      {/* Judul besar */}
      <h1 className="h-display" style={{
        fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
        color: '#33363F',
        margin: 0,
        textAlign: 'center',
      }}>
        {t('welcome.title')} <mark className="hl" style={{ color: '#F2661A' }}>ORDAL</mark>
      </h1>
      <p style={{
        fontSize: 15,
        color: '#6B6E76',
        maxWidth: 480,
        textAlign: 'center',
        margin: '14px 0 0',
        lineHeight: 1.65,
      }}>
        {t('welcome.sub')}
      </p>

      {/* Floating sticker cards */}
      <div style={{
        display: 'flex', gap: 18, marginTop: 40,
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div className="card float-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, '--bob-rot': '-1.5deg' }}>
          <FileText size={16} color="#F2661A" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#33363F' }}>CV Uploaded</div>
            <div style={{ fontSize: 11, color: '#6B6E76' }}>Backend Engineer.pdf</div>
          </div>
          <CheckCircle2 size={15} color="#1E9E3E" />
        </div>
        <div className="card float-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, '--bob-rot': '1deg' }}>
          <Zap size={16} color="#F2661A" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#33363F' }}>New Match Found</div>
            <div style={{ fontSize: 11, color: '#6B6E76' }}>Full Stack · Jakarta · 92%</div>
          </div>
          <span className="badge badge-orange num-display">92%</span>
        </div>
        <div className="card float-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, '--bob-rot': '-1deg' }}>
          <Mail size={16} color="#F2661A" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#33363F' }}>+62 Lamaran Terkirim</div>
            <div style={{ fontSize: 11, color: '#6B6E76' }}>JobStreet + LinkedIn</div>
          </div>
        </div>
      </div>

      {/* Spin badge */}
      <div style={{ position: 'absolute', top: 60, right: '10%' }}>
        <SpinBadge size={88} text="ORDAL • AUTO APPLY • " />
      </div>

      {/* Marquee band bawah */}
      <div className="marquee-band" style={{
        position: 'absolute', left: -20, right: -20, bottom: 42,
      }}>
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="marquee-item">
              {item} <span style={{ color: '#F4F2EC', margin: '0 8px' }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Footer kecil */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center',
        fontSize: 11, color: '#9CA3AF', letterSpacing: '0.06em',
      }}>
        ORDAL · AI JOB SEARCH AGENT · v{import.meta.env.VITE_APP_VERSION || '3.0.0'}
      </div>
    </div>
  )
}

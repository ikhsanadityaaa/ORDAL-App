import { useEffect, useState } from 'react'
import { Check, Compass, Lightbulb, RefreshCw, Sparkles, Target, TrendingUp } from 'lucide-react'
import api from '../api'
import useI18n from '../stores/i18nStore'

const PLATFORM_NAMES = {
  linkedin: 'LinkedIn Jobs', linkedin_posts: 'LinkedIn Post', jobstreet: 'JobStreet', glints: 'Glints', indeed: 'Indeed',
}

export default function CareerProgress() {
  const { lang } = useI18n()
  const id = lang === 'id'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData((await api.get('/product/career-progress')).data)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || (id ? 'Gagal membaca progres karier.' : 'Failed to load career progress.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [lang])

  if (loading) return <div className="main-scroll"><p>{id ? 'Membaca progresmu...' : 'Reading your progress...'}</p></div>
  if (error || !data) return <div className="main-scroll"><div className="notice notice-error">{error}</div></div>

  const dimensions = [
    ['profile_strength', id ? 'Kekuatan profil' : 'Profile strength'],
    ['cv_readiness', id ? 'Kesiapan CV' : 'CV readiness'],
    ['target_readiness', id ? 'Kesiapan target' : 'Target readiness'],
    ['application_readiness', id ? 'Kesiapan melamar' : 'Application readiness'],
  ]

  return (
    <div className="main-scroll career-progress-page">
      <div className="page-header">
        <div>
          <p className="eyebrow eyebrow-orange">CAREER PROGRESS</p>
          <h1>{id ? 'Seberapa siap perjalanan kariermu?' : 'How ready is your career journey?'}</h1>
          <p>{id ? 'Nilai ini mengukur kesiapan profil dan lamaran, bukan nilai dirimu sebagai manusia.' : 'This measures profile and application readiness, never your worth as a person.'}</p>
        </div>
        <button className="btn btn-secondary" onClick={load}><RefreshCw size={15} />{id ? 'Perbarui' : 'Refresh'}</button>
      </div>

      <section className="career-hero card-flat">
        <div className="career-score" aria-label={data.overall + '%'} style={{ '--score': (data.overall * 3.6) + 'deg' }}>
          <div><strong>{data.overall}%</strong><span>{id ? 'siap' : 'ready'}</span></div>
        </div>
        <div>
          <span className="badge badge-orange">{id ? 'PROGRES KESIAPAN' : 'READINESS PROGRESS'}</span>
          <h2>{data.overall >= 75 ? (id ? 'Fondasi kamu sudah kuat.' : 'Your foundation is strong.') : (id ? 'Fondasi sedang dibangun.' : 'Your foundation is growing.')}</h2>
          <p>{id ? data.evidence.jobs_analyzed + ' lowongan dianalisis, ' + data.evidence.strong_matches + ' kecocokan kuat, dan ' + data.evidence.applications + ' lamaran terkirim.' : data.evidence.jobs_analyzed + ' jobs analyzed, ' + data.evidence.strong_matches + ' strong matches, and ' + data.evidence.applications + ' applications sent.'}</p>
        </div>
      </section>

      <section className="career-dimension-grid">
        {dimensions.map(([key, label]) => (
          <article key={key} className="card-flat career-dimension">
            <div><span>{label}</span><strong>{data.dimensions[key]}%</strong></div>
            <div className="career-meter"><i style={{ width: data.dimensions[key] + '%' }} /></div>
          </article>
        ))}
      </section>

      <section className="career-two-column">
        <article className="card-flat career-panel">
          <div className="career-panel-title"><Compass size={20} /><div><h2>Reality check</h2><p>{id ? 'Berdasarkan hasil nyata yang sudah dianalisis.' : 'Based on actual analyzed results.'}</p></div></div>
          <div className={'career-insight career-insight-' + data.reality_check.status}>
            <strong>{id ? data.reality_check.title : data.reality_check.title_en}</strong>
            <p>{id ? data.reality_check.message : data.reality_check.message_en}</p>
          </div>
          {data.recommendations.length > 0 && <div className="career-recommendations"><h3><Lightbulb size={16} />{id ? 'Langkah berikutnya' : 'Next steps'}</h3>{data.recommendations.map((item) => <p key={item.id}>• {id ? item.id : item.en}</p>)}</div>}
        </article>

        <article className="card-flat career-panel">
          <div className="career-panel-title"><Sparkles size={20} /><div><h2>{id ? 'Peluang stretch' : 'Stretch opportunities'}</h2><p>{id ? 'Pilihan terkait yang tidak mengganti target utamamu.' : 'Related options that never replace your main target.'}</p></div></div>
          {data.stretch_opportunities.length === 0 ? <p className="career-empty">{id ? 'Lengkapi CV dan target untuk membuka saran terkait.' : 'Complete your CV and targets to unlock related suggestions.'}</p> : data.stretch_opportunities.map((item) => (
            <div className="career-stretch" key={item.role}><Target size={17} /><div><strong>{item.role}</strong><p>{id ? item.reason : item.reason_en}</p></div></div>
          ))}
        </article>
      </section>

      <section className="career-two-column">
        <article className="card-flat career-panel">
          <div className="career-panel-title"><TrendingUp size={20} /><div><h2>{id ? 'Kinerja sumber' : 'Source performance'}</h2><p>{id ? 'Platform terbaik berdasarkan hasil pencarianmu.' : 'Best platforms from your own search results.'}</p></div></div>
          {data.source_performance.length === 0 ? <p className="career-empty">{id ? 'Mulai pencarian untuk mengumpulkan data sumber.' : 'Start a search to collect source data.'}</p> : (
            <div className="career-source-list">{data.source_performance.map((source, index) => (
              <div key={source.platform}><span>{index + 1}. {PLATFORM_NAMES[source.platform] || source.platform}</span><small>{source.found} {id ? 'ditemukan' : 'found'} · {source.strong} {id ? 'kuat' : 'strong'} · {source.applied} {id ? 'terkirim' : 'sent'}</small><strong>{source.average_match == null ? '-' : source.average_match + '%'}</strong></div>
            ))}</div>
          )}
        </article>

        <article className="card-flat career-panel">
          <div className="career-panel-title"><Check size={20} /><div><h2>{id ? 'Milestone' : 'Milestones'}</h2><p>{id ? 'Kemajuan berkualitas, bukan sekadar jumlah lamaran.' : 'Quality progress, not raw application volume.'}</p></div></div>
          <div className="career-milestones">{data.milestones.map((item) => (
            <div key={item.key} className={item.complete ? 'complete' : ''}><span>{item.complete ? <Check size={14} /> : ''}</span>{id ? item.label : item.label_en}</div>
          ))}</div>
        </article>
      </section>
    </div>
  )
}

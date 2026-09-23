import { Languages } from 'lucide-react'
import useI18n from '../stores/i18nStore'

export default function LanguageGate() {
  const { t, setLang } = useI18n()

  return (
    <main className="language-gate">
      <section className="language-gate-card" aria-labelledby="language-title">
        <div className="language-mark">O</div>
        <div className="language-kicker"><Languages size={16} /> ORDAL</div>
        <h1 id="language-title">{t('lang.choose_title')}</h1>
        <p>{t('lang.choose_sub')}</p>
        <div className="language-options">
          <button type="button" onClick={() => setLang('id')}>
            <span className="language-code">ID</span>
            <span>
              <strong>Bahasa Indonesia</strong>
              <small>Lanjut dalam Bahasa Indonesia</small>
            </span>
          </button>
          <button type="button" onClick={() => setLang('en')}>
            <span className="language-code">EN</span>
            <span>
              <strong>English</strong>
              <small>Continue in English</small>
            </span>
          </button>
        </div>
      </section>
    </main>
  )
}

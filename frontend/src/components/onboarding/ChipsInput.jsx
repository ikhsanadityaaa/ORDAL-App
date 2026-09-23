import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import useI18n from '../../stores/i18nStore'

// ─────────────────────────────────────────────────────────────────────────────
// ChipsInput — input nilai jamak gaya sticker chip (posisi, lokasi, dll).
// Enter/koma untuk tambah, klik X untuk hapus.
// ─────────────────────────────────────────────────────────────────────────────

export default function ChipsInput({ value = [], onChange, placeholder, addLabel, helper }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')

  const add = (raw) => {
    const v = raw.trim().replace(/,+$/, '')
    if (!v) return
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...value, v])
    setDraft('')
  }

  const remove = (idx) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        background: '#FFFFFF', border: '2px solid rgba(51,54,63,0.14)',
        borderRadius: 12, padding: 10, minHeight: 48,
      }}>
        {value.map((chip, i) => (
          <span key={i} className="chip-sticker" style={{ padding: '4px 6px 4px 12px', gap: 4 }}>
            {chip}
            <button
              type="button"
              onClick={() => remove(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                background: '#33363F', color: '#F4F2EC', border: 'none',
              }}
              title={t('common.remove')}
            >
              <X size={11} strokeWidth={3} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              remove(value.length - 1)
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? '' : placeholder}
          style={{
            flex: 1, minWidth: 120, border: 'none', outline: 'none',
            fontSize: 13.5, color: '#33363F', background: 'transparent', padding: '2px 4px',
          }}
        />
      </div>
      {helper && <div className="input-help">{helper}</div>}
      {draft && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => add(draft)}
        >
          <Plus size={13} /> {addLabel || t('common.add')}
        </button>
      )}
    </div>
  )
}

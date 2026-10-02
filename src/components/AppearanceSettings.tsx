import { accents, setAppearance, themes, useAppearance } from '../data/theme'
import { CheckIcon } from './Icons'

/** Тема, цвет акцента и режим без анимаций. Сохраняется в браузере, вход не нужен. */
export default function AppearanceSettings() {
  const a = useAppearance()
  return (
    <section className="stack appearance">
      <h2>Оформление</h2>
      <div className="appearance__row">
        <span className="muted">Тема</span>
        <div className="chips">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip-btn${a.theme === t.id ? ' chip-btn--on' : ''}`}
              aria-pressed={a.theme === t.id}
              title={t.hint}
              onClick={() => setAppearance({ theme: t.id })}
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>
      <div className="appearance__row">
        <span className="muted">Цвет</span>
        <div className="swatches" role="radiogroup" aria-label="Цвет акцента">
          {accents.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={a.accent === c.id}
              aria-label={c.title}
              className={`swatch${a.accent === c.id ? ' swatch--on' : ''}`}
              style={{ background: c.color }}
              onClick={() => setAppearance({ accent: c.id })}
            >
              {a.accent === c.id && <CheckIcon size={16} />}
            </button>
          ))}
        </div>
      </div>
      <label className="appearance__row appearance__toggle">
        <input type="checkbox" checked={a.calm} onChange={(e) => setAppearance({ calm: e.target.checked })} />
        <span>Без анимаций</span>
      </label>
    </section>
  )
}

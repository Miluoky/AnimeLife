import { accents, setAppearance, themes, useAppearance } from '../data/theme'
import { CheckIcon } from './Icons'
import { slowNetwork } from '../data/saver'

const SAVER = [
  { id: 'auto', title: 'Авто' },
  { id: 'on', title: 'Всегда' },
  { id: 'off', title: 'Выключена' },
] as const

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
      <div className="appearance__row">
        <span className="muted">Экономия трафика</span>
        <div className="chips" role="group" aria-label="Экономия трафика">
          {SAVER.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip-btn${(a.saver ?? 'auto') === s.id ? ' chip-btn--on' : ''}`}
              aria-pressed={(a.saver ?? 'auto') === s.id}
              onClick={() => setAppearance({ saver: s.id })}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
      <p className="muted appearance__hint">
        Лёгкие постеры, без кадров в баннере, предзагрузки и тяжёлых эффектов. «Авто» включает экономию на медленной сети
        {(a.saver ?? 'auto') === 'auto' ? (slowNetwork() ? ': сейчас она включена.' : ': сейчас сеть быстрая.') : '.'}
      </p>
      <label className="appearance__row appearance__toggle">
        <input type="checkbox" checked={a.calm} onChange={(e) => setAppearance({ calm: e.target.checked })} />
        <span>Без анимаций</span>
      </label>
      <label className="appearance__row appearance__toggle">
        <input type="checkbox" checked={a.glow !== false} onChange={(e) => setAppearance({ glow: e.target.checked })} />
        <span>Подсветка вокруг плеера в цветах кадра</span>
      </label>
    </section>
  )
}

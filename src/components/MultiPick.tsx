import { useEffect, useId, useRef, useState } from 'react'

interface Option {
  id: string | number
  title: string
}

interface Props {
  label: string
  /** подпись, когда ничего не выбрано */
  any: string
  options: Option[]
  /** выбранные id строками */
  value: string[]
  onChange: (next: string[]) => void
  /** поле поиска по списку, если вариантов много */
  searchable?: boolean
}

/**
 * Выбор нескольких вариантов из длинного списка (жанры, студии): кнопка как у обычного фильтра,
 * по нажатию — список с галочками и поиском. Закрывается кликом мимо и Esc.
 */
export default function MultiPick({ label, any, options, value, onChange, searchable }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const chosen = options.filter((o) => value.includes(String(o.id)))
  const summary = chosen.length ? (chosen.length > 1 ? `${chosen[0].title} +${chosen.length - 1}` : chosen[0].title) : any
  const needle = text.trim().toLowerCase()
  const shown = needle ? options.filter((o) => o.title.toLowerCase().includes(needle)) : options

  const toggle = (oid: string) => onChange(value.includes(oid) ? value.filter((v) => v !== oid) : [...value, oid])

  return (
    <div ref={box} className={`filter multi-pick${value.length ? ' filter--set' : ''}`}>
      <span className="filter__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="multi-pick__button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen(!open)}
      >
        <span id={`${id}-value`}>{summary}</span>
      </button>
      {open && (
        <div className="multi-pick__panel" role="group" aria-label={label}>
          {searchable && (
            <input
              type="search"
              className="multi-pick__search"
              placeholder="Найти в списке"
              aria-label={`Найти: ${label.toLowerCase()}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          )}
          <div className="multi-pick__list">
            {shown.map((o) => (
              <label key={o.id} className="multi-pick__item">
                <input type="checkbox" checked={value.includes(String(o.id))} onChange={() => toggle(String(o.id))} />
                <span>{o.title}</span>
              </label>
            ))}
            {!shown.length && <p className="muted multi-pick__empty">Ничего не нашлось</p>}
          </div>
          <div className="multi-pick__foot">
            <span className="muted">{value.length > 1 ? `Тайтлы со всеми выбранными: ${value.length}` : 'Можно выбрать несколько'}</span>
            {value.length > 0 && (
              <button type="button" className="link-btn" onClick={() => onChange([])}>
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

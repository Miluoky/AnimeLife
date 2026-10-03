import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadCatalog } from '../api'
import type { Anime } from '../data/catalog'
import { Poster } from './PosterCard'
import { SearchIcon } from './Icons'

interface Props {
  className: string
  /** вызывается после перехода, например чтобы закрыть мобильное меню */
  onDone?: () => void
}

/** Поиск с подсказками: первые совпадения появляются прямо во время ввода. */
export default function SearchBox({ className, onDone }: Props) {
  const navigate = useNavigate()
  const id = useId()
  const [query, setQuery] = useState('')
  const [hints, setHints] = useState<Anime[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLFormElement>(null)

  // Ждём паузу в наборе, чтобы не дёргать API на каждую букву (лимит Shikimori 5 запросов в секунду).
  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setHints([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await loadCatalog({ search: text, limit: 6 })
      if (!cancelled) {
        setHints(result.data.slice(0, 6))
        setActive(-1)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // Клик мимо поиска закрывает подсказки.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function go(path: string) {
    setOpen(false)
    setQuery('')
    setHints([])
    setActive(-1)
    navigate(path)
    onDone?.()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (active >= 0 && hints[active]) return go(`/anime/${hints[active].id}`)
    const text = query.trim()
    go(text ? `/catalog?q=${encodeURIComponent(text)}` : '/catalog')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!hints.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
    e.preventDefault()
    setOpen(true)
    const step = e.key === 'ArrowDown' ? 1 : -1
    // -1 значит «ничего не выбрано»: Enter тогда ищет по тексту.
    setActive((i) => {
      const next = i + step
      if (next >= hints.length) return -1
      if (next < -1) return hints.length - 1
      return next
    })
  }

  const showHints = open && query.trim().length >= 2 && hints.length > 0
  const listId = `${id}-hints`

  return (
    <form ref={box} className={`${className} search-box`} role="search" onSubmit={onSubmit}>
      <SearchIcon />
      <label htmlFor={id} className="sr-only">
        Поиск аниме
      </label>
      <input
        id={id}
        type="search"
        placeholder="Найти аниме"
        autoComplete="off"
        role="combobox"
        aria-expanded={showHints}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showHints && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {!query && <kbd className="search__kbd" aria-hidden="true">Ctrl K</kbd>}
      {showHints && (
        <ul id={listId} className="search-hints" role="listbox" aria-label="Подсказки">
          {hints.map((a, i) => (
            <li
              key={a.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search-hint${i === active ? ' active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => go(`/anime/${a.id}`)}
            >
              <span className="search-hint__poster" style={{ background: a.posterFill }}>
                <Poster anime={a} />
              </span>
              <span className="search-hint__info">
                <span className="search-hint__title">{a.title}</span>
                <span className="muted">{[a.year, a.kind].filter(Boolean).join(' · ')}</span>
              </span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            className="search-hint search-hint--all"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => go(`/catalog?q=${encodeURIComponent(query.trim())}`)}
          >
            Все результаты
          </li>
        </ul>
      )}
    </form>
  )
}

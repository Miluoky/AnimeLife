import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchIcon } from './Icons'

// Подсказки — отдельный файл: он грузится при первом фокусе на поле, а не с каждой страницей.
const SearchHints = lazy(() => import('./SearchHints'))

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
  const [open, setOpen] = useState(false)
  // Однажды открытые подсказки остаются загруженными.
  const [wanted, setWanted] = useState(false)
  const [aria, setAria] = useState<{ expanded: boolean; active?: string }>({ expanded: false })
  const keys = useRef<((e: KeyboardEvent<HTMLInputElement>) => boolean) | null>(null)
  const box = useRef<HTMLFormElement>(null)

  // Клик мимо поиска закрывает подсказки.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const onState = useCallback((expanded: boolean, active?: string) => setAria({ expanded, active }), [])

  function go(path: string) {
    setOpen(false)
    // Иначе поле остаётся в фокусе, и следующий клик по нему не откроет подсказки.
    box.current?.querySelector('input')?.blur()
    setQuery('')
    navigate(path)
    onDone?.()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = query.trim()
    go(text ? `/catalog?q=${encodeURIComponent(text)}` : '/catalog')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
    if (open) keys.current?.(e)
  }

  function show() {
    setOpen(true)
    setWanted(true)
  }

  const expanded = open && aria.expanded
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
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? aria.active : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          show()
        }}
        onFocus={show}
        onClick={show}
        onKeyDown={onKeyDown}
      />
      {!query && <kbd className="search__kbd" aria-hidden="true">Ctrl K</kbd>}
      {wanted && open && (
        <Suspense fallback={null}>
          <SearchHints query={query} listId={listId} keys={keys} onGo={go} onState={onState} />
        </Suspense>
      )}
    </form>
  )
}

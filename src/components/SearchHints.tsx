import { useEffect, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react'
import { loadCatalog } from '../api'
import type { Anime } from '../data/catalog'
import { swapLayout } from '../data/keyboard'
import { createLocalStore } from '../data/localStore'
import { Poster } from './PosterCard'
import './search.css'

/** Тайтл в подсказке: хватает того, что приходит в списке Shikimori. */
type Hint = Pick<
  Anime,
  'id' | 'title' | 'originalTitle' | 'year' | 'kind' | 'episodes' | 'score' | 'ongoing' | 'upcoming' | 'posterSmall' | 'posterSmall2x' | 'posterFill'
>

const LIMIT = 6
const RECENT_LIMIT = 6
const recentStore = createLocalStore<Hint[]>('anime.search-recent.v1', [])

function remember(a: Hint) {
  const { id, title, originalTitle, year, kind, episodes, score, ongoing, upcoming, posterSmall, posterSmall2x, posterFill } = a
  const entry = { id, title, originalTitle, year, kind, episodes, score, ongoing, upcoming, posterSmall, posterSmall2x, posterFill }
  recentStore.set([entry, ...recentStore.get().filter((r) => r.id !== a.id)].slice(0, RECENT_LIMIT))
}

// Популярные онгоинги для пустого поля: грузим один раз за визит.
let popular: Promise<Hint[]> | undefined
const loadPopular = () =>
  (popular ??= loadCatalog({ status: 'ongoing', order: 'popularity', limit: 5 }).then((r) => (r.demo ? [] : r.data)))

interface Found {
  text: string
  items: Hint[]
  /** ничего не нашлось, зато нашлось по тексту в другой раскладке */
  swapped?: string
  failed?: boolean
}

/** Ищем как есть, а если пусто — тот же текст в другой раскладке («yfhenj» → «наруто»). */
async function find(text: string): Promise<Found> {
  const first = await loadCatalog({ search: text, limit: LIMIT })
  if (first.demo) return { text, items: [], failed: true }
  if (first.data.length) return { text, items: first.data }
  const other = swapLayout(text)
  if (!other) return { text, items: [] }
  const second = await loadCatalog({ search: other, limit: LIMIT })
  return second.demo || !second.data.length ? { text, items: [] } : { text, items: second.data, swapped: other }
}

/** Совпадение с запросом в названии выделено. */
function highlight(title: string, query: string): ReactNode {
  const at = query ? title.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return title
  return (
    <>
      {title.slice(0, at)}
      <mark>{title.slice(at, at + query.length)}</mark>
      {title.slice(at + query.length)}
    </>
  )
}

const meta = (a: Hint) =>
  [a.year, a.kind, a.episodes && `${a.episodes} эп.`].filter(Boolean).join(' · ')

interface Props {
  query: string
  listId: string
  /** сюда подсказки кладут свой обработчик клавиш поля ввода; true — клавиша обработана */
  keys: MutableRefObject<((e: KeyboardEvent<HTMLInputElement>) => boolean) | null>
  onGo: (path: string) => void
  /** id выбранной стрелками строки и открыт ли список, для aria-атрибутов поля */
  onState: (expanded: boolean, activeId?: string) => void
}

/**
 * Выпадающие подсказки поиска. Грузятся отдельным файлом при первом фокусе на поле.
 * Пустое поле: недавно открытые из поиска тайтлы или популярные онгоинги.
 * С текстом: первые совпадения с постером, годом, типом и оценкой; опечатку в раскладке исправляем сами.
 */
export default function SearchHints({ query, listId, keys, onGo, onState }: Props) {
  const text = query.trim()
  const typing = text.length >= 2
  const recent = recentStore.use()
  const [found, setFound] = useState<Found>()
  const [loading, setLoading] = useState(false)
  const [top, setTop] = useState<Hint[]>([])
  const [active, setActive] = useState(-1)

  // Ждём паузу в наборе, чтобы не дёргать API на каждую букву (лимит Shikimori 5 запросов в секунду).
  useEffect(() => {
    setActive(-1)
    if (!typing) return setLoading(false)
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      find(text)
        .catch((): Found => ({ text, items: [], failed: true }))
        .then((res) => {
          if (cancelled) return
          setFound(res)
          setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, typing])

  useEffect(() => {
    if (typing || recent.length) return
    let alive = true
    loadPopular()
      .then((list) => alive && setTop(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [typing, recent.length])

  // Пока ищем новый текст, остаются прежние подсказки: так список не мигает на каждой букве.
  const shown = typing ? found : undefined
  const fresh = shown?.text === text
  const items: Hint[] = typing ? shown?.items ?? [] : recent.length ? recent : top
  const searchText = (fresh && shown?.swapped) || text
  const allPath = `/catalog?q=${encodeURIComponent(searchText)}`
  const message = !typing || items.length
    ? undefined
    : loading || !fresh
      ? 'Ищем…'
      : shown?.failed
        ? 'Поиск сейчас не отвечает. Попробуйте ещё раз чуть позже.'
        : 'Ничего не нашлось. Попробуйте название на английском или японском.'
  const expanded = items.length > 0 || !!message

  useEffect(() => {
    onState(expanded, expanded && active >= 0 ? `${listId}-${active}` : undefined)
  }, [expanded, active, listId, onState])

  const pick = (a: Hint) => {
    remember(a)
    onGo(`/anime/${a.id}`)
  }

  keys.current = (e) => {
    if (e.key === 'Enter') {
      if (active >= 0 && items[active]) pick(items[active])
      else if (text) onGo(allPath)
      else return false
      e.preventDefault()
      return true
    }
    if (!items.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return false
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    // -1 значит «ничего не выбрано»: Enter тогда ищет по тексту.
    setActive((i) => {
      const next = i + step
      if (next >= items.length) return -1
      if (next < -1) return items.length - 1
      return next
    })
    return true
  }

  if (!expanded) return null

  const head = typing
    ? fresh && shown?.swapped && `Показаны результаты для «${shown.swapped}»`
    : recent.length
      ? 'Вы недавно открывали'
      : 'Сейчас смотрят'

  return (
    <ul id={listId} className="search-hints" role="listbox" aria-label="Подсказки" aria-busy={loading}>
      {head && (
        <li role="presentation" className="search-hints__head">
          <span>{head}</span>
          {!typing && recent.length > 0 && (
            <button
              type="button"
              className="search-hints__clear"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => recentStore.set([])}
            >
              Очистить
            </button>
          )}
        </li>
      )}
      {items.map((a, i) => (
        <li
          key={a.id}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={i === active}
          className={`search-hint${i === active ? ' active' : ''}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => pick(a)}
        >
          <span className="search-hint__poster" style={{ background: a.posterFill }}>
            <Poster anime={a} />
          </span>
          <span className="search-hint__info">
            <span className="search-hint__title">{highlight(a.title, typing ? searchText : '')}</span>
            {a.originalTitle && a.originalTitle !== a.title && (
              <span className="search-hint__alt">{highlight(a.originalTitle, typing ? searchText : '')}</span>
            )}
            <span className="search-hint__meta">
              {a.score ? <span className="search-hint__score">★ {a.score.toFixed(1)}</span> : null}
              <span className="muted">{meta(a)}</span>
              {a.ongoing && <span className="search-hint__badge">онгоинг</span>}
              {a.upcoming && <span className="search-hint__badge search-hint__badge--soon">анонс</span>}
            </span>
          </span>
        </li>
      ))}
      {message && (
        <li role="presentation" className="search-hints__message muted" aria-live="polite">
          {message}
        </li>
      )}
      {typing && items.length > 0 && (
        <li
          role="option"
          aria-selected={false}
          className="search-hint search-hint--all"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onGo(allPath)}
        >
          Все результаты
        </li>
      )}
    </ul>
  )
}

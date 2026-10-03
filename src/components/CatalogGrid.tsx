import { useEffect, useRef, useState } from 'react'
import { loadCatalog, useAsync, type CatalogQuery } from '../api'
import type { Anime } from '../data/catalog'
import PosterCard from './PosterCard'

const PAGE_SIZE = 24

interface Props {
  /** Фильтры без страницы. При смене фильтров родитель пересоздаёт сетку через key. */
  query: Omit<CatalogQuery, 'page' | 'limit'>
  empty?: string
  /** с какой страницы начать (адрес вида ?page=3) */
  start?: number
  /** сколько тайтлов пришло на первой загруженной странице: по нему рисуются ссылки на страницы */
  onFirst?: (count: number) => void
}

/** Сетка постеров с подгрузкой следующих страниц при прокрутке к концу списка. */
export default function CatalogGrid({ query, empty = 'Ничего не нашлось. Попробуйте другой запрос или фильтры.', start = 1, onFirst }: Props) {
  const [page, setPage] = useState(start)
  const [items, setItems] = useState<Anime[]>([])
  const [hasMore, setHasMore] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // Колбэк родителя меняется на каждом рендере: держим свежий в ref, чтобы не перезапускать эффект.
  const onFirstRef = useRef(onFirst)
  onFirstRef.current = onFirst

  const batch = useAsync(() => loadCatalog({ ...query, page, limit: PAGE_SIZE }), [page])

  useEffect(() => {
    if (!batch.value) return
    const { data, demo } = batch.value
    setItems((prev) => (page === start ? data : [...prev, ...data.filter((a) => !prev.some((p) => p.id === a.id))]))
    setHasMore(!demo && data.length === PAGE_SIZE)
    if (page === start) onFirstRef.current?.(demo ? 0 : data.length)
  }, [batch.value, page, start])

  // Когда низ списка подходит к экрану, грузим следующую страницу. Кнопка ниже остаётся запасным путём.
  const loading = batch.loading
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPage((p) => p + 1)
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading])

  const demo = batch.value?.demo
  const firstLoad = loading && page === start

  return (
    <>
      {demo && (
        <p className="notice" role="status">
          Не получилось загрузить каталог Shikimori, поэтому показаны демо-данные.
        </p>
      )}

      {firstLoad ? (
        <div className="grid grid--posters" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="poster-card">
              <div className="poster-card__img skeleton" />
              <div className="skeleton skeleton--line" />
            </div>
          ))}
        </div>
      ) : items.length ? (
        <div className="grid grid--posters">
          {items.map((a, i) => (
            <PosterCard key={a.id} anime={a} priority={i < 6} />
          ))}
        </div>
      ) : (
        <p className="muted">{empty}</p>
      )}

      {hasMore && (
        <>
          <div ref={sentinel} aria-hidden="true" />
          <button
            type="button"
            className="btn btn--ghost load-more"
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {loading ? 'Загружаю…' : 'Показать ещё'}
          </button>
        </>
      )}
    </>
  )
}

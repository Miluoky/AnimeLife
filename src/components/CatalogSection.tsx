import { useEffect, useState } from 'react'
import { loadCatalog, loadGenres, useAsync, type CatalogQuery } from '../api'
import type { Anime } from '../data/catalog'
import PosterCard from './PosterCard'

const PAGE_SIZE = 24

interface Props {
  title: string
  status?: CatalogQuery['status']
  search?: string
}

export default function CatalogSection({ title, status, search }: Props) {
  const genres = useAsync(loadGenres, [])
  const [genre, setGenre] = useState<number>()
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Anime[]>([])
  const [hasMore, setHasMore] = useState(false)

  // Смена жанра начинает список заново. Смену status и search родитель делает через key.
  function pickGenre(id: number | undefined) {
    setGenre(id)
    setPage(1)
  }

  const batch = useAsync(
    () => loadCatalog({ page, limit: PAGE_SIZE, status, genre, search }),
    [page, genre, status, search],
  )

  useEffect(() => {
    if (!batch.value) return
    const { data } = batch.value
    setItems((prev) => (page === 1 ? data : [...prev, ...data.filter((a) => !prev.some((p) => p.id === a.id))]))
    setHasMore(!batch.value.demo && data.length === PAGE_SIZE)
  }, [batch.value, page])

  const demo = batch.value?.demo
  const firstLoad = batch.loading && page === 1

  return (
    <section className="stack">
      <div className="section-head" style={{ alignItems: 'center' }}>
        <h2>{title}</h2>
        <div className="chips">
          <button
            type="button"
            className={`pill${genre === undefined ? ' active' : ''}`}
            aria-pressed={genre === undefined}
            onClick={() => pickGenre(undefined)}
          >
            Все
          </button>
          {genres.value?.data.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`pill${g.id === genre ? ' active' : ''}`}
              aria-pressed={g.id === genre}
              onClick={() => pickGenre(g.id)}
            >
              {g.title}
            </button>
          ))}
        </div>
      </div>

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
          {items.map((a) => (
            <PosterCard key={a.id} anime={a} />
          ))}
        </div>
      ) : (
        <p className="muted">Ничего не нашлось. Попробуйте другой запрос или жанр.</p>
      )}

      {hasMore && (
        <button
          type="button"
          className="btn btn--ghost load-more"
          disabled={batch.loading}
          onClick={() => setPage((p) => p + 1)}
        >
          {batch.loading ? 'Загружаю…' : 'Показать ещё'}
        </button>
      )}
    </section>
  )
}

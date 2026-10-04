import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loadGenres, useAsync, type CatalogQuery } from '../api'
import CatalogGrid from './CatalogGrid'

interface Props {
  title: string
  status?: CatalogQuery['status']
  /** ссылка «Все фильтры» на страницу каталога */
  moreLink?: string
}

/** Подборка с быстрыми фильтрами по популярным жанрам. */
export default function CatalogSection({ title, status, moreLink }: Props) {
  const genres = useAsync(loadGenres, [])
  const [genre, setGenre] = useState<number>()

  return (
    <section className="stack">
      <div className="section-head" style={{ alignItems: 'center' }}>
        <h2>{title}</h2>
        <div className="chips">
          <button
            type="button"
            className={`pill${genre === undefined ? ' active' : ''}`}
            aria-pressed={genre === undefined}
            onClick={() => setGenre(undefined)}
          >
            Все
          </button>
          {genres.value?.data.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`pill${g.id === genre ? ' active' : ''}`}
              aria-pressed={g.id === genre}
              onClick={() => setGenre(g.id)}
            >
              {g.title}
            </button>
          ))}
          {moreLink && (
            <Link to={moreLink} className="pill pill--link">
              Все фильтры
            </Link>
          )}
        </div>
      </div>

      <CatalogGrid key={genre ?? 'all'} query={{ status, genre }} />
    </section>
  )
}

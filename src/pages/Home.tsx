import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { catalog, continueWatching, genres, getAnime } from '../data/catalog'
import PosterCard from '../components/PosterCard'
import { FilterIcon, PlayIcon } from '../components/Icons'

export default function Home() {
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim().toLowerCase()
  const [genre, setGenre] = useState('Все')
  const featured = getAnime('frieren')!

  const filtered = catalog.filter(
    (a) =>
      (genre === 'Все' || a.genres.includes(genre)) &&
      (!query || a.title.toLowerCase().includes(query) || a.originalTitle?.toLowerCase().includes(query)),
  )

  return (
    <main className="container home">
      {!query && (
        <section className="hero">
          <div className="hero__text">
            <div className="eyebrow">Подборка недели</div>
            <h1 className="hero__title">{featured.title}</h1>
            <div className="meta-line">
              <span>{featured.year}</span>
              <span>·</span>
              <span>{featured.kind}</span>
              <span>·</span>
              <span>{featured.episodes} серий</span>
              <span>·</span>
              <span>{featured.studio}</span>
            </div>
            <div className="chips">
              {featured.genres.map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
            <p className="hero__desc">{featured.description}</p>
            <div className="actions">
              <Link to={`/watch/${featured.id}/1`} className="btn btn--accent">
                <PlayIcon />
                Смотреть 1 серию
              </Link>
              <Link to={`/anime/${featured.id}`} className="btn btn--ghost">
                Подробнее
              </Link>
            </div>
          </div>
          <div className="hero__art" style={{ background: featured.posterFill }}>
            <span className="art-label">[Ключевой арт тайтла, 16:9]</span>
          </div>
        </section>
      )}

      {!query && (
        <section className="stack">
          <div className="section-head">
            <h2>Продолжить просмотр</h2>
            <a href="#">Вся история</a>
          </div>
          <div className="grid grid--wide">
            {continueWatching.map((item) => {
              const anime = getAnime(item.animeId)!
              return (
                <Link key={item.animeId} to={`/watch/${anime.id}/${item.episode}`} className="continue-card">
                  <div className="continue-card__img" style={{ background: anime.posterFill }}>
                    <span className="continue-card__play">
                      <PlayIcon size={20} />
                    </span>
                    <div className="progress-track">
                      <div className="progress-bar" style={{ width: `${item.progressPercent}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="poster-card__title">{anime.title}</div>
                    <div className="poster-card__meta">
                      Серия {item.episode} из {item.totalEpisodes}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section className="stack">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <h2>{query ? `Результаты поиска: «${params.get('q')}»` : 'Каталог'}</h2>
          <div className="chips">
            {genres.map((g) => (
              <button
                key={g}
                type="button"
                className={`pill${g === genre ? ' active' : ''}`}
                aria-pressed={g === genre}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
            <button type="button" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FilterIcon />
              Фильтры
            </button>
          </div>
        </div>
        {filtered.length ? (
          <div className="grid grid--posters">
            {filtered.map((a) => (
              <PosterCard key={a.id} anime={a} />
            ))}
          </div>
        ) : (
          <p className="muted">Ничего не нашлось. Попробуйте другой запрос или жанр.</p>
        )}
      </section>
    </main>
  )
}

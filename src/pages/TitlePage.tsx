import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { continueWatching, getAnime } from '../data/catalog'
import { PlayIcon, PlusIcon } from '../components/Icons'
import NotFound from './NotFound'

const PAGE_SIZE = 12

export default function TitlePage() {
  const { id = '' } = useParams()
  const anime = getAnime(id)
  const [page, setPage] = useState(0)

  if (!anime) return <NotFound />

  const progress = continueWatching.find((p) => p.animeId === anime.id)
  const total = anime.episodes ?? 12
  const pages = Math.ceil(total / PAGE_SIZE)
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, from + PAGE_SIZE - 1)
  const episodes = Array.from({ length: to - from + 1 }, (_, i) => from + i)

  function episodeState(n: number) {
    if (!progress) return { percent: 0, label: `${anime!.episodeMinutes ?? 24} мин` }
    if (n < progress.episode) return { percent: 100, label: 'Просмотрено' }
    if (n === progress.episode) return { percent: progress.progressPercent, label: 'Продолжить' }
    return { percent: 0, label: `${anime!.episodeMinutes ?? 24} мин` }
  }

  return (
    <>
      <div className="banner" style={{ background: anime.posterFill }}>
        <span className="art-label">[Широкий баннер тайтла]</span>
      </div>
      <main className="container title-page">
        <section className="title-head">
          <div className="title-head__poster" style={{ background: anime.posterFill }}>
            <span className="placeholder-label">[Постер]</span>
          </div>
          <div className="title-head__info">
            {anime.originalTitle && <div className="muted">{anime.originalTitle}</div>}
            <h1 className="title-head__title">{anime.title}</h1>
            <div className="chips">
              <span className="chip chip--accent">{anime.ongoing ? 'Онгоинг' : 'Вышел'}</span>
              <span className="chip">{anime.year}</span>
              {anime.genres.map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
            <div className="actions">
              <Link to={`/watch/${anime.id}/${progress?.episode ?? 1}`} className="btn btn--accent">
                <PlayIcon />
                {progress ? `Продолжить: серия ${progress.episode}` : 'Смотреть 1 серию'}
              </Link>
              <button type="button" className="btn btn--ghost">
                <PlusIcon />В мой список
              </button>
            </div>
          </div>
        </section>

        <div className="title-body">
          <div className="stack">
            <div className="section-head" style={{ alignItems: 'center' }}>
              <h2>Серии</h2>
              {pages > 1 && (
                <div className="chips">
                  {Array.from({ length: pages }, (_, i) => {
                    const a = i * PAGE_SIZE + 1
                    const b = Math.min(total, a + PAGE_SIZE - 1)
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`pill${i === page ? ' active' : ''}`}
                        aria-pressed={i === page}
                        onClick={() => setPage(i)}
                      >
                        {a}–{b}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="grid grid--episodes">
              {episodes.map((n) => {
                const st = episodeState(n)
                return (
                  <Link key={n} to={`/watch/${anime.id}/${n}`} className="episode-card">
                    <div className="episode-card__img" style={{ background: anime.posterFill }}>
                      <span className="episode-card__num">{n}</span>
                      {st.percent > 0 && (
                        <div className="progress-track" style={{ background: 'transparent' }}>
                          <div className="progress-bar" style={{ width: `${st.percent}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="episode-card__meta">
                      <span>Серия {n}</span>
                      <span className="muted">{st.label}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <aside className="stack title-aside">
            <dl className="facts">
              <div>
                <dt>Тип</dt>
                <dd>{anime.kind}</dd>
              </div>
              {anime.episodes && (
                <div>
                  <dt>Серии</dt>
                  <dd>{anime.episodes}</dd>
                </div>
              )}
              {anime.studio && (
                <div>
                  <dt>Студия</dt>
                  <dd>{anime.studio}</dd>
                </div>
              )}
              <div>
                <dt>Год</dt>
                <dd>{anime.season ?? anime.year}</dd>
              </div>
            </dl>
            <div className="stack" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500 }}>Описание</h2>
              <p className="soft" style={{ margin: 0 }}>
                {anime.description}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  )
}

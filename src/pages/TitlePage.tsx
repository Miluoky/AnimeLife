import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { loadAnime, useAsync } from '../api'
import { episodeCount } from '../data/catalog'
import { useHistory } from '../data/history'
import { Poster } from '../components/PosterCard'
import { PlayIcon } from '../components/Icons'
import NotFound from './NotFound'

const PAGE_SIZE = 12

export default function TitlePage() {
  const { id = '' } = useParams()
  const result = useAsync(() => loadAnime(id), [id])
  const history = useHistory()
  const [page, setPage] = useState(0)

  if (result.loading && !result.value) return <main className="container empty-page" aria-busy="true" />
  const anime = result.value?.data
  if (!anime) return <NotFound title="Тайтл не найден" />

  const progress = history.find((h) => h.animeId === anime.id)
  const total = episodeCount(anime)
  const pages = Math.ceil(total / PAGE_SIZE)
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, from + PAGE_SIZE - 1)
  const episodes = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const minutes = anime.episodeMinutes ? `${anime.episodeMinutes} мин` : ''

  function episodeLabel(n: number) {
    if (progress && n < progress.episode) return 'Просмотрено'
    if (progress && n === progress.episode) return 'Вы здесь'
    return minutes
  }

  return (
    <>
      <div className="banner" style={{ background: anime.posterFill }}>
        {anime.posterUrl ? (
          <img className="banner__img" src={anime.posterUrl} alt="" />
        ) : (
          <span className="art-label">[Широкий баннер тайтла]</span>
        )}
      </div>
      <main className="container title-page">
        <section className="title-head">
          <div className="title-head__poster" style={{ background: anime.posterFill }}>
            <Poster anime={anime} />
          </div>
          <div className="title-head__info">
            {anime.originalTitle && <div className="muted">{anime.originalTitle}</div>}
            <h1 className="title-head__title">{anime.title}</h1>
            <div className="chips">
              <span className="chip chip--accent">{anime.ongoing ? 'Онгоинг' : 'Вышел'}</span>
              {anime.score ? <span className="chip">★ {anime.score.toFixed(1)}</span> : null}
              {anime.year && <span className="chip">{anime.year}</span>}
              {anime.genres.map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
            <div className="actions">
              <Link to={`/watch/${anime.id}/${progress?.episode ?? 1}`} className="btn btn--accent">
                <PlayIcon />
                {progress ? `Продолжить: серия ${progress.episode}` : 'Смотреть'}
              </Link>
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
                const watched = progress ? n < progress.episode : false
                return (
                  <Link key={n} to={`/watch/${anime.id}/${n}`} className="episode-card">
                    <div className="episode-card__img" style={{ background: anime.posterFill }}>
                      <span className="episode-card__num">{n}</span>
                      {watched && (
                        <div className="progress-track" style={{ background: 'transparent' }}>
                          <div className="progress-bar" style={{ width: '100%' }} />
                        </div>
                      )}
                    </div>
                    <div className="episode-card__meta">
                      <span>Серия {n}</span>
                      <span className="muted">{episodeLabel(n)}</span>
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
              <div>
                <dt>Серии</dt>
                <dd>
                  {anime.ongoing && anime.episodesAired
                    ? anime.episodes
                      ? `${anime.episodesAired} из ${anime.episodes}`
                      : `${anime.episodesAired} вышло`
                    : (anime.episodes ?? '?')}
                </dd>
              </div>
              {anime.episodeMinutes && (
                <div>
                  <dt>Длительность</dt>
                  <dd>{anime.episodeMinutes} мин</dd>
                </div>
              )}
              {anime.studio && (
                <div>
                  <dt>Студия</dt>
                  <dd>{anime.studio}</dd>
                </div>
              )}
              {(anime.season || anime.year) && (
                <div>
                  <dt>Сезон</dt>
                  <dd>{anime.season ?? anime.year}</dd>
                </div>
              )}
            </dl>
            {anime.description && (
              <div className="stack" style={{ gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 500 }}>Описание</h2>
                <p className="soft prewrap" style={{ margin: 0 }}>
                  {anime.description}
                </p>
              </div>
            )}
            {!result.value?.demo && (
              <p className="muted source-note">
                Данные:{' '}
                <a href={`https://shikimori.io/animes/${anime.id}`} target="_blank" rel="noreferrer">
                  Shikimori
                </a>
              </p>
            )}
          </aside>
        </div>
      </main>
    </>
  )
}

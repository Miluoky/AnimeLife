import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { loadAnime, loadCatalog, useAsync } from '../api'
import { useHistory } from '../data/history'
import CatalogSection from '../components/CatalogSection'
import Recommendations from '../components/Recommendations'
import { Poster } from '../components/PosterCard'
import { PlayIcon } from '../components/Icons'
import { useMorphLink } from '../components/morph'

const HERO_COUNT = 5
const HERO_INTERVAL = 8000

function Hero() {
  // «Сейчас в эфире»: пять самых популярных онгоингов сменяют друг друга, пауза при наведении.
  const list = useAsync(() => loadCatalog({ status: 'ongoing', limit: HERO_COUNT }), [])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const items = list.value?.data ?? []
  const current = items[index] ?? items[0]
  const details = useAsync(async () => (current ? (await loadAnime(current.id)).data : undefined), [current?.id])
  const anime = details.value ?? current
  const morph = useMorphLink(`/anime/${anime?.id}`)

  useEffect(() => {
    if (items.length < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), HERO_INTERVAL)
    return () => clearInterval(timer)
  }, [items.length, paused])

  if (!anime) {
    return <section className="hero skeleton hero--loading" aria-busy={list.loading} />
  }

  const meta = [anime.year, anime.kind, anime.episodes && `${anime.episodes} серий`, anime.studio].filter(Boolean)

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero__text" key={anime.id}>
        <div className="eyebrow">
          <span className="live-dot" aria-hidden="true" />
          Сейчас в эфире
        </div>
        <h1 className="hero__title">{anime.title}</h1>
        <div className="meta-line">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="meta-dot">·</span>}
              {m}
            </span>
          ))}
        </div>
        <div className="chips">
          {anime.genres.slice(0, 4).map((g) => (
            <span key={g} className="chip">
              {g}
            </span>
          ))}
        </div>
        {anime.description && <p className="hero__desc clamp-4">{anime.description}</p>}
        <div className="actions">
          <Link to={`/watch/${anime.id}/1`} className="btn btn--accent">
            <PlayIcon />
            Смотреть
          </Link>
          <Link to={`/anime/${anime.id}`} className="btn btn--ghost" onClick={morph}>
            Подробнее
          </Link>
        </div>
        {items.length > 1 && (
          <div className="hero__dots" role="tablist" aria-label="Онгоинги в эфире">
            {items.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={a.title}
                className={`hero__dot${i === index ? ' hero__dot--on' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="hero__art" style={{ background: anime.posterFill }}>
        {anime.posterUrl ? (
          <>
            <img key={`bg-${anime.id}`} className="hero__art-bg" src={anime.posterUrl} alt="" />
            <img
              key={anime.id}
              className="hero__art-poster"
              src={anime.posterUrl}
              alt={`Постер: ${anime.title}`}
              // @ts-expect-error fetchpriority ещё нет в типах React 18
              fetchpriority="high"
            />
          </>
        ) : (
          <span className="art-label">[Ключевой арт тайтла, 16:9]</span>
        )}
      </div>
    </section>
  )
}

function ContinueWatching() {
  const history = useHistory()
  if (!history.length) return null

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Продолжить просмотр</h2>
      </div>
      <div className="grid grid--wide">
        {history.slice(0, 4).map((h) => (
          <Link key={h.animeId} to={`/watch/${h.animeId}/${h.episode}`} className="continue-card">
            <div className="continue-card__img" style={{ background: h.posterFill }}>
              <Poster anime={h} className="poster-img--cover" />
              <span className="continue-card__play">
                <PlayIcon size={20} />
              </span>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${(h.episode / h.totalEpisodes) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="poster-card__title">{h.title}</div>
              <div className="poster-card__meta">
                Серия {h.episode} из {h.totalEpisodes}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim()

  // Старые ссылки на поиск вида /?q=… ведут в каталог.
  if (query) return <Navigate to={`/catalog?q=${encodeURIComponent(query)}`} replace />

  return (
    <main className="container home">
      <Hero />
      <ContinueWatching />
      <Recommendations />
      <CatalogSection title="Популярное" moreLink="/catalog" />
    </main>
  )
}

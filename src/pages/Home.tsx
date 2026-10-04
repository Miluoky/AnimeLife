import { type CSSProperties, Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { loadAnime, loadCatalog, useAsync } from '../api'
import { fetchScreenshots } from '../api/shikimori'
import { removeProgress, useHistory } from '../data/history'
import { getPosition } from '../data/positions'
import { formatTime } from '../components/together/time'
import { toast } from '../data/toast'
import CatalogSection from '../components/CatalogSection'
import { Poster } from '../components/PosterCard'
import { PlayIcon } from '../components/Icons'

// Рекомендации ниже первого экрана: отдельная часть, грузится следом.
const Recommendations = lazy(() => import('../components/Recommendations'))
// Полки «сезон», «скоро», «лучшее» тоже ниже баннера: своей частью, чтобы не утяжелять первый экран.
const SeasonShelf = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.SeasonShelf })))
const MoreShelves = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.MoreShelves })))

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
  // Кадр из аниме на фон. Кадр следующего тайтла запрашиваем заранее, чтобы смена была без пустого фона.
  const shots = useAsync(async () => (current ? (await fetchScreenshots(current.id).catch(() => []))[0] : undefined), [current?.id])
  const next = items[(index + 1) % items.length]
  useEffect(() => {
    if (!next || items.length < 2) return
    const t = setTimeout(() => {
      void fetchScreenshots(next.id)
        .then((list) => {
          if (list[0]) new Image().src = list[0]
        })
        .catch(() => undefined)
    }, 2000)
    return () => clearTimeout(t)
  }, [next?.id, items.length])
  const shot = shots.value && !shots.loading ? shots.value : undefined

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
      className={`hero${paused ? ' hero--paused' : ''}`}
      style={{ '--glow': anime.posterFill, '--hero-ms': `${HERO_INTERVAL}ms` } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero__backdrop" aria-hidden="true">
        {anime.posterUrl && <img key={`bg-${anime.id}`} className="hero__blur" src={anime.posterSmall2x ?? anime.posterUrl} alt="" />}
        {shot && <img key={shot} className="hero__shot" src={shot} alt="" onLoad={(e) => e.currentTarget.classList.add('is-on')} />}
      </div>
      <div className="hero__text" key={anime.id}>
        <div className="eyebrow">
          <span className="live-dot" aria-hidden="true" />
          Сейчас в эфире
        </div>
        <h2 className="hero__title">{anime.title}</h2>
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
          <Link to={`/anime/${anime.id}`} className="btn btn--ghost">
            Подробнее
          </Link>
        </div>
      </div>
      {/* Пока кадра нет (или у новинки его нет вовсе), справа стоит постер. */}
      {!shot && anime.posterUrl && (
        <img
          key={`poster-${anime.id}`}
          className="hero__art-poster"
          src={anime.posterSmall2x ?? anime.posterUrl}
          alt={`Постер: ${anime.title}`}
          // @ts-expect-error fetchpriority ещё нет в типах React 18
          fetchpriority="high"
        />
      )}
      {items.length > 1 && (
        <div className="hero__thumbs" role="tablist" aria-label="Онгоинги в эфире">
          {items.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={a.title}
              className={`hero__thumb${i === index ? ' hero__thumb--on' : ''}`}
              onClick={() => setIndex(i)}
            >
              {a.posterSmall && <img src={a.posterSmall} alt="" />}
            </button>
          ))}
        </div>
      )}
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
        {history.slice(0, 4).map((h) => {
          // Где остановились внутри серии — если плеер это запомнил.
          const at = getPosition(h.animeId, h.episode)
          return (
            <div key={h.animeId} className="continue-item">
              <Link to={`/watch/${h.animeId}/${h.episode}`} className="continue-card">
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
                    {at !== null && ` · с ${formatTime(at)}`}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                className="continue-item__remove"
                aria-label={`Убрать «${h.title}» из продолжения`}
                title="Убрать из списка"
                onClick={() => {
                  const undo = removeProgress(h.animeId)
                  if (undo) toast('Убрано из «Продолжить просмотр»', { label: 'Вернуть', onClick: undo })
                }}
              >
                ×
              </button>
            </div>
          )
        })}
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
      {/* Заголовок страницы — о сайте, а не о тайтле в баннере: баннер меняется каждые 8 секунд. */}
      <h1 className="home-title">Смотреть аниме онлайн</h1>
      <Hero />
      <ContinueWatching />
      <Suspense fallback={null}>
        <SeasonShelf />
        <Recommendations />
        <MoreShelves />
      </Suspense>
      <CatalogSection title="Популярное" moreLink="/catalog" />
    </main>
  )
}

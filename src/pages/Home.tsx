import { type CSSProperties, Suspense, lazy, useEffect, useRef, useState } from 'react'
import { saverOn, slowNetwork } from '../data/saver'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { loadAnime, loadCatalog, useAsync } from '../api'
import { SHIKIMORI_URL, fetchScreenshots, shotPreview } from '../api/shikimori'
import { removeProgress, useHistory } from '../data/history'
import type { HistoryEntry } from '../data/history'
import { useMyList } from '../data/myList'
import { getPosition } from '../data/positions'
import { formatTime } from '../components/together/time'
import { toast } from '../data/toast'
import { Poster } from '../components/PosterCard'
import { PauseIcon, PlayIcon } from '../components/Icons'
import { useAmbient } from '../components/ambient'

const shotSrc = (url: string) => (innerWidth <= 640 || slowNetwork() ? shotPreview(url) : url)

const Recommendations = lazy(() => import('../components/Recommendations'))
const Onboarding = lazy(() => import('../components/Onboarding'))
const SeasonShelf = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.SeasonShelf })))
const NewEpisodesShelf = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.NewEpisodesShelf })))
const HomeBento = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.HomeBento })))
const MoreShelves = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.MoreShelves })))
const CatalogSection = lazy(() => import('../components/CatalogSection'))

import './hero.css'
if (matchMedia('(min-width: 1101px)').matches) void import('./hero-ring.css')

const HERO_COUNT = 5
const ONGOING_TOP = { status: 'ongoing', order: 'popularity', limit: 10 } as const
const HERO_INTERVAL = 8000

function airsToday(at?: string) {
  return !!at && new Date(at).toDateString() === new Date().toDateString()
}

function heroLabel(at?: string) {
  if (!at) return 'Онгоинг'
  const when = new Date(at)
  if (airsToday(at)) return `Новая серия сегодня в ${when.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (when.toDateString() === tomorrow.toDateString()) return 'Новая серия завтра'
  return 'Онгоинг'
}

function Hero() {
  const list = useAsync(() => loadCatalog(ONGOING_TOP), [])
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const items = list.value?.data.slice(0, HERO_COUNT) ?? []
  const count = items.length || 1
  const index = ((step % count) + count) % count
  const setIndex = (i: number) => setStep((s) => s + ((((i - s) % count) + count + Math.floor(count / 2)) % count) - Math.floor(count / 2))
  const current = items[index] ?? items[0]
  const details = useAsync(async () => (current ? { of: current.id, data: (await loadAnime(current.id)).data } : undefined), [current?.id])
  const anime = (details.value?.of === current?.id && details.value?.data) || current
  // Кадры только на широком экране: на телефоне LCP — постер, а не поздний screenshot с Shikimori.
  const wideHero = typeof window !== 'undefined' && matchMedia('(min-width: 1101px)').matches
  const shots = useAsync(
    async () =>
      current && !saverOn() && wideHero ? (await fetchScreenshots(current.id).catch(() => []))[0] : undefined,
    [current?.id, wideHero],
  )
  const next = items[(index + 1) % items.length]
  useEffect(() => {
    if (!next || items.length < 2 || saverOn()) return
    const t = setTimeout(() => {
      new Image().src = `${SHIKIMORI_URL}/system/animes/x96/${next.id}.jpg`
      if (!wideHero) return
      void fetchScreenshots(next.id)
        .then((list) => {
          if (list[0]) new Image().src = shotSrc(list[0])
        })
        .catch(() => undefined)
    }, 2000)
    return () => clearTimeout(t)
  }, [next?.id, items.length, wideHero])
  const shot = wideHero && shots.value && !shots.loading ? shots.value : undefined
  // Ambient после первой отрисовки героя — не тянет второй постер в ту же очередь, что LCP.
  const [ambientSrc, setAmbientSrc] = useState<string | undefined>()
  useEffect(() => {
    if (!current?.posterSmall) {
      setAmbientSrc(undefined)
      return
    }
    const t = window.setTimeout(() => setAmbientSrc(current.posterSmall), 1200)
    return () => clearTimeout(t)
  }, [current?.posterSmall])
  useAmbient(ambientSrc)

  // Listen for media query change to ensure hero-ring.css is loaded on desktop
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1101px)')
    if (mql.matches) {
      void import('./hero-ring.css')
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) void import('./hero-ring.css')
    }
    mql.addEventListener?.('change', handler)
    return () => mql.removeEventListener?.('change', handler)
  }, [])

  const pausedNow = useRef(paused)
  pausedNow.current = paused
  useEffect(() => {
    if (items.length < 2 || paused) return
    const timer = setInterval(() => !document.hidden && !pausedNow.current && setStep((s) => s + 1), HERO_INTERVAL)
    return () => clearInterval(timer)
  }, [items.length, paused])

  if (!current) {
    return <section className="hero skeleton" style={{ minHeight: 460 }} aria-busy="true" />
  }

  const when = current.nextEpisodeAt
  return (
    <section
      className={`hero hero--ring${paused ? ' hero--paused' : ''}`}
      style={{ '--glow': anime.posterFill, '--hero-ms': `${HERO_INTERVAL}ms` } as CSSProperties}
      aria-label="Популярное аниме"
    >
      <div className="hero__backdrop" aria-hidden="true">
        {/* Сразу лёгкий постер (LCP), кадр подменит его после загрузки — без ожидания screenshots. */}
        {shot ? (
          <img
            key={shot}
            className="hero__art"
            src={shotSrc(shot)}
            alt=""
            aria-hidden="true"
            decoding="async"
            loading="eager"
          />
        ) : anime.posterUrl ? (
          <img
            key={`backdrop-poster-${anime.id}`}
            className="hero__art"
            src={anime.posterSmall ?? anime.posterUrl}
            alt=""
            aria-hidden="true"
            // На телефоне это LCP: sync + high, без гонки со вторым постером.
            decoding={wideHero ? 'async' : 'sync'}
            loading="eager"
            // @ts-expect-error fetchpriority
            fetchpriority={wideHero ? undefined : 'high'}
          />
        ) : null}
        <div className="hero__scrim" aria-hidden="true" />
      </div>
      {anime.japaneseTitle && /[\u3040-\u30ff\u4e00-\u9fff]/.test(anime.japaneseTitle) && (
        <span key={`jp-${anime.id}`} className="hero__jp" lang="ja" aria-hidden="true">
          {anime.japaneseTitle}
        </span>
      )}
      <div className="hero__content">
        <div className="hero__meta">
          <span className="hero__rec" aria-hidden="true">
            <i /> REC
          </span>
          <span className="eyebrow">
            {airsToday(when) && <span className="live-dot" aria-hidden="true" />}
            {heroLabel(when)}
          </span>
          {items.length > 1 && (
            <button
              type="button"
              className="hero__pause"
              aria-label={paused ? 'Продолжить смену тайтлов' : 'Поставить смену тайтлов на паузу'}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            </button>
          )}
        </div>
        <h2 className="hero__title">{anime.title}</h2>
        <div className="hero__info">
          {anime.episodes ? <span>EP {anime.episodes}</span> : null}
          {anime.score && !Number.isNaN(Number(anime.score)) ? (
            <span>★ {Number(anime.score).toFixed(1)}</span>
          ) : null}
          {anime.year ? <span>{anime.year}</span> : null}
          {anime.kind ? <span>{anime.kind.toUpperCase()}</span> : null}
          {anime.studio ? <span>{anime.studio}</span> : null}
        </div>
        {anime.genres && (
          <div className="hero__genres">
            {anime.genres.slice(0, 4).map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </div>
        )}
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
      {!shot && anime.posterUrl && (
        <img
          key={`poster-${anime.id}`}
          className="hero__art-poster"
          // Телефон: тот же лёгкий posterSmall, без fetchpriority — LCP уже у фона. Широкий экран: 2x + high.
          src={(saverOn() || !wideHero ? anime.posterSmall : anime.posterSmall2x) ?? anime.posterUrl}
          alt={`Постер: ${anime.title}`}
          decoding={wideHero ? 'sync' : 'async'}
          loading={wideHero ? 'eager' : 'lazy'}
          // @ts-expect-error fetchpriority
          fetchpriority={wideHero ? 'high' : undefined}
        />
      )}
      {items.length > 1 && (
        <div
          className="hero__thumbs"
          role="tablist"
          aria-label="Переключение баннеров"
          style={{ '--turn': `${(step * 360) / count}deg` } as CSSProperties}
        >
          {items.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={a.title}
              className={`hero__thumb${i === index ? ' hero__thumb--on' : ''}`}
              style={{ '--a': `${(i * 360) / count}deg`, '--depth': ((1 + Math.cos(((i - step) * 2 * Math.PI) / count)) / 2).toFixed(3) } as CSSProperties}
              onClick={() => setIndex(i)}
            >
              {a.posterSmall && (
                <img
                  src={a.posterSmall}
                  srcSet={a.posterSmall2x && !saverOn() && wideHero ? `${a.posterSmall} 225w, ${a.posterSmall2x} 450w` : undefined}
                  sizes="(min-width: 1101px) 132px, 44px"
                  alt=""
                  decoding="async"
                  loading="lazy"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ContinueWatching({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return null

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Продолжить просмотр</h2>
      </div>
      <div className="grid grid--wide">
        {history.slice(0, 6).map((h, i) => {
          const at = getPosition(h.animeId, h.episode)
          return (
            <div key={h.animeId} className="continue-item">
              <Link to={`/watch/${h.animeId}/${h.episode}`} className="continue-card">
                <div className="continue-card__img" style={{ background: h.posterFill }}>
                  <Poster anime={h} className="poster-img--cover" priority={i === 0} />
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
                    {at !== null && ` • на ${formatTime(at)}`}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                className="continue-item__remove"
                aria-label={`Убрать «${h.title}» из продолжить`}
                title="Убрать"
                onClick={() => {
                  const undo = removeProgress(h.animeId)
                  if (undo) toast('Убрано из «Продолжить просмотр»', { label: 'Вернуть', onClick: undo })
                }}
              >
                ✕
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
  const history = useHistory()
  const watching = useMyList().some((entry) => entry.status === 'watching')
  const hasPersonalContent = history.length > 0 || watching

  if (query) return <Navigate to={`/catalog?q=${encodeURIComponent(query)}`} replace />

  return (
    <main className="container home">
      <div className={hasPersonalContent ? 'home__intro home__intro--personal' : 'home__intro'}>
        <h1 className="home-title">Смотреть аниме онлайн</h1>
        {hasPersonalContent && (
          <div className="home__personal">
            <ContinueWatching history={history} />
            <Suspense fallback={null}>
              <NewEpisodesShelf />
            </Suspense>
          </div>
        )}
      </div>
      <Hero />
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
      <Suspense fallback={null}>
        <HomeBento />
        <SeasonShelf />
        <Recommendations />
        <MoreShelves />
        <CatalogSection title="Каталог аниме" moreLink="/catalog" />
      </Suspense>
    </main>
  )
}

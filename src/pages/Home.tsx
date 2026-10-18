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

// Рекомендации ниже первого экрана: отдельная часть, грузится следом.
// На телефоне и медленной сети кадр в фоне баннера уменьшенный: оригинал весит до 700 КБ и становился LCP на 11 с.
const shotSrc = (url: string) => (innerWidth <= 640 || slowNetwork() ? shotPreview(url) : url)

const Recommendations = lazy(() => import('../components/Recommendations'))
const Onboarding = lazy(() => import('../components/Onboarding'))
// Полки «сезон», «скоро», «лучшее» тоже ниже баннера: своей частью, чтобы не утяжелять первый экран.
const SeasonShelf = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.SeasonShelf })))
const NewEpisodesShelf = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.NewEpisodesShelf })))
const HomeBento = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.HomeBento })))
const MoreShelves = lazy(() => import('../components/HomeShelves').then((m) => ({ default: m.MoreShelves })))
// «Популярное» — в самом низу и в той же границе Suspense, что и полки выше: раньше оно отрисовывалось сразу
// под баннером, а потом догруженные полки вставали над ним и сдвигали страницу (CLS на телефоне до 0,3).
const CatalogSection = lazy(() => import('../components/CatalogSection'))

// 3D-кольцо постеров есть только на широком экране: его стили грузим только там.
if (matchMedia('(min-width: 1101px)').matches) void import('./hero-ring.css')

const HERO_COUNT = 5
const HERO_INTERVAL = 8000

function Hero() {
  // «Сейчас в эфире»: пять самых популярных онгоингов сменяют друг друга.
  const list = useAsync(() => loadCatalog({ status: 'ongoing', limit: HERO_COUNT }), [])
  // Шаг карусели растёт без сброса: так 3D-кольцо постеров всегда крутится вперёд, а не отматывается назад.
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const items = list.value?.data ?? []
  const count = items.length || 1
  const index = ((step % count) + count) % count
  const setIndex = (i: number) => setStep((s) => s + ((((i - s) % count) + count + Math.floor(count / 2)) % count) - Math.floor(count / 2))
  const current = items[index] ?? items[0]
  const details = useAsync(async () => (current ? { of: current.id, data: (await loadAnime(current.id)).data } : undefined), [current?.id])
  // Пока грузятся подробности нового тайтла, показываем его из списка, а не прошлый тайтл.
  const anime = (details.value?.of === current?.id && details.value?.data) || current
  // Кадр из аниме на фон. Кадр следующего тайтла запрашиваем заранее, чтобы смена была без пустого фона.
  // В экономии трафика баннер без кадра из серии: хватает постера.
  const shots = useAsync(
    async () => (current && !saverOn() ? (await fetchScreenshots(current.id).catch(() => []))[0] : undefined),
    [current?.id],
  )
  const next = items[(index + 1) % items.length]
  useEffect(() => {
    if (!next || items.length < 2 || saverOn()) return
    const t = setTimeout(() => {
      new Image().src = `${SHIKIMORI_URL}/system/animes/x96/${next.id}.jpg`
      void fetchScreenshots(next.id)
        .then((list) => {
          if (list[0]) new Image().src = shotSrc(list[0])
        })
        .catch(() => undefined)
    }, 2000)
    return () => clearTimeout(t)
  }, [next?.id, items.length])
  const shot = shots.value && !shots.loading ? shots.value : undefined
  // Страница подсвечивается постером тайтла из баннера.
  useAmbient(current?.posterSmall)

  // Пауза ставится сразу по нажатию: эффект снимет таймер только после отрисовки,
  // а шаг, пришедший в этот промежуток, не должен перелистнуть баннер.
  const pausedNow = useRef(paused)
  pausedNow.current = paused
  useEffect(() => {
    if (items.length < 2 || paused) return
    // Во вкладке в фоне баннер не листается: не грузим кадры, которых никто не увидит.
    const timer = setInterval(() => !document.hidden && !pausedNow.current && setStep((s) => s + 1), HERO_INTERVAL)
    return () => clearInterval(timer)
  }, [items.length, paused])

  if (!anime) {
    return <section className="hero skeleton hero--loading" aria-busy={list.loading} />
  }

  const meta = [
    anime.episodesAired ? `EP ${anime.episodesAired}${anime.episodes ? `/${anime.episodes}` : ''}` : anime.episodes && `${anime.episodes} серий`,
    anime.score && `★ ${anime.score.toFixed(2)}`,
    anime.year,
    anime.kind,
    anime.studio,
  ].filter(Boolean)

  return (
    <section
      className={`hero${paused ? ' hero--paused' : ''}${items.length > 1 ? ' hero--ring' : ''}`}
      style={{ '--glow': anime.posterFill, '--hero-ms': `${HERO_INTERVAL}ms` } as CSSProperties}
    >
      <div className="hero__backdrop" aria-hidden="true">
        {/* Фон размыт на 30 px: хватает лёгкого постера 1x, а он — самая крупная картинка экрана (LCP) и грузится первым. */}
        {anime.posterUrl && (
          <img
            key={`bg-${anime.id}`}
            // У следующих тайтлов под размытием хватает постера 96 px (~8 КБ). Он меньше первого, поэтому Chrome
            // не считает его новой «самой крупной картинкой», и LCP главной не уезжает на 8-ю секунду, когда баннер листается.
            className={`hero__blur${step > 0 ? ' hero__blur--next' : ''}`}
            src={step > 0 ? `${SHIKIMORI_URL}/system/animes/x96/${anime.id}.jpg` : (anime.posterSmall ?? anime.posterUrl)}
            alt=""
            // @ts-expect-error fetchpriority ещё нет в типах React 18
            fetchpriority="high"
          />
        )}
        {shot && <img key={shot} className="hero__shot" src={shotSrc(shot)} alt="" onLoad={(e) => e.currentTarget.classList.add('is-on')} />}
      </div>
      {items.length > 1 && (
        <button
          type="button"
          className="hero__toggle icon-btn"
          aria-label={paused ? 'Продолжить смену тайтлов' : 'Поставить смену тайтлов на паузу'}
          aria-pressed={paused}
          title={paused ? 'Продолжить смену тайтлов' : 'Поставить смену тайтлов на паузу'}
          onClick={() => {
            pausedNow.current = !paused
            setPaused(!paused)
          }}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      )}
      {anime.japaneseTitle && /[\u3040-\u30ff\u4e00-\u9fff]/.test(anime.japaneseTitle) && (
        <span key={`jp-${anime.id}`} className="hero__jp" lang="ja" aria-hidden="true">
          {anime.japaneseTitle}
        </span>
      )}
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
          src={(saverOn() ? anime.posterSmall : anime.posterSmall2x) ?? anime.posterUrl}
          alt={`Постер: ${anime.title}`}
          // @ts-expect-error fetchpriority ещё нет в типах React 18
          fetchpriority="high"
        />
      )}
      {items.length > 1 && (
        // На компьютере миниатюры собраны в объёмное кольцо (CSS 3D), на телефоне — обычная лента.
        <div
          className="hero__thumbs"
          role="tablist"
          aria-label="Онгоинги в эфире"
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
              // Насколько постер «впереди»: дальние темнее и прозрачнее.
              style={{ '--a': `${(i * 360) / count}deg`, '--depth': ((1 + Math.cos(((i - step) * 2 * Math.PI) / count)) / 2).toFixed(3) } as CSSProperties}
              onClick={() => setIndex(i)}
            >
              {a.posterSmall && (
                <img
                  src={a.posterSmall}
                  srcSet={a.posterSmall2x && !saverOn() ? `${a.posterSmall} 225w, ${a.posterSmall2x} 450w` : undefined}
                  sizes="(min-width: 1101px) 132px, 44px"
                  alt=""
                  decoding="async"
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
  const history = useHistory()
  const watching = useMyList().some((entry) => entry.status === 'watching')
  const hasPersonalContent = history.length > 0 || watching

  // Старые ссылки на поиск вида /?q=… ведут в каталог.
  if (query) return <Navigate to={`/catalog?q=${encodeURIComponent(query)}`} replace />

  return (
    <main className="container home">
      <div className={hasPersonalContent ? 'home__intro home__intro--personal' : 'home__intro'}>
        {/* Заголовок страницы — о сайте, а не о тайтле в баннере: баннер меняется каждые 8 секунд. */}
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
        <CatalogSection title="Популярное" moreLink="/catalog" />
      </Suspense>
    </main>
  )
}

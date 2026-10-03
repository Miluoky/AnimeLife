import { Link, useNavigate, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { loadAnime, useAsync } from '../api'
import { episodeCount } from '../data/catalog'
import { saveProgress } from '../data/history'
import { getEntry, setWatched, useMyList } from '../data/myList'
import NotFound from './NotFound'
import WatchTogetherButton from '../components/together/WatchTogetherButton'
import VideoPlayer from '../components/VideoPlayer'
import { markFlag } from '../data/flags'
import { usePageMeta } from '../data/pageMeta'
import { BackIcon, SkipIcon } from '../components/Icons'

// Комментарии тянут SDK Appwrite: грузим их отдельно, плеер появляется сразу.
const EpisodeComments = lazy(() => import('../components/EpisodeComments'))

export default function Player() {
  const { id = '', episode = '1' } = useParams()
  const navigate = useNavigate()
  const result = useAsync(() => loadAnime(id), [id])
  const anime = result.value?.data
  // Названия серий приходят от AniLibria, когда плеер нашёл релиз.
  const [names, setNames] = useState<Record<number, string>>({})
  const list = useMyList()
  const seen = (anime && list.find((e) => e.anime.id === anime.id)?.watched) || 0

  const total = anime ? episodeCount(anime) : 1
  const current = Math.min(Math.max(1, Number(episode) || 1), total)

  useEffect(() => {
    if (!anime) return
    saveProgress(anime, current, total)
    // Открыли серию N: предыдущие считаем просмотренными, если тайтл в списке.
    const entry = getEntry(anime.id)
    if (entry && (entry.watched ?? 0) < current - 1) setWatched(anime.id, current - 1)
    const hour = new Date().getHours()
    if (hour < 5) markFlag('nightOwl')
  }, [anime, current, total])

  usePageMeta(anime ? `${anime.title}, серия ${current}` : undefined)

  if (result.loading && !result.value) return <main className="container empty-page" aria-busy="true" />
  if (!anime) return <NotFound title="Тайтл не найден" />

  const goTo = (n: number) => navigate(`/watch/${anime.id}/${n}`)
  const name = names[current]

  return (
    <main className="container player-page">
      {/* Мульти-провайдерный плеер; если серию взять негде — трейлер */}
      <VideoPlayer
        title={anime.title}
        originalTitle={anime.originalTitle}
        englishTitle={anime.englishTitle}
        shikimoriId={anime.id}
        episode={current}
        totalEpisodes={total}
        onEpisodeChange={goTo}
        onEpisodes={(eps) => setNames(Object.fromEntries(eps.map((e) => [e.ordinal, e.name ?? ''])))}
        trailerUrl={anime.trailerUrl}
      />

      <EpisodePicker animeId={anime.id} total={total} current={current} seen={seen} names={names} />

      <div className="watch-head">
        <div className="watch-head__info">
          <Link to={`/anime/${anime.id}`} className="muted">
            {anime.title}
          </Link>
          <h1>Серия {current}</h1>
          {name && <p className="watch-head__name">{name}</p>}
        </div>
        <div className="watch-actions">
          <WatchTogetherButton anime={anime} episode={current} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={current <= 1}
            aria-label="Предыдущая серия"
            onClick={() => goTo(current - 1)}
          >
            <BackIcon size={18} />
            <span className="watch-prev__text">Предыдущая</span>
          </button>
          <button type="button" className="btn btn--accent" disabled={current >= total} onClick={() => goTo(current + 1)}>
            Следующая серия
            <SkipIcon />
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        <EpisodeComments animeId={anime.id} episode={current} />
      </Suspense>
    </main>
  )
}

const RANGE = 100

/**
 * Номера серий полосой (на телефоне листается вбок, на компьютере — сетка сбоку).
 * Текущая подсвечена, просмотренные по «Моему списку» отмечены точкой. У длинных сериалов — по сотне.
 */
function EpisodePicker({
  animeId,
  total,
  current,
  seen,
  names,
}: {
  animeId: string
  total: number
  current: number
  seen: number
  names: Record<number, string>
}) {
  const [range, setRange] = useState(Math.floor((current - 1) / RANGE))
  const strip = useRef<HTMLDivElement>(null)
  const ranges = Math.ceil(total / RANGE)
  const from = range * RANGE + 1
  const to = Math.min(total, from + RANGE - 1)

  // Текущая серия сразу на виду: прокручиваем только саму полосу, не страницу.
  useEffect(() => {
    const box = strip.current
    const chip = box?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!box || !chip) return
    box.scrollTo({
      left: chip.offsetLeft - box.clientWidth / 2 + chip.offsetWidth / 2,
      top: chip.offsetTop - box.clientHeight / 2,
    })
  }, [current, range])

  return (
    <aside className="episodes">
      <div className="episodes__head">
        <h2>Серии</h2>
        <span className="muted">{total}</span>
      </div>
      {ranges > 1 && (
        <div className="ep-ranges" role="group" aria-label="Диапазон серий">
          {Array.from({ length: ranges }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`pill${i === range ? ' active' : ''}`}
              aria-pressed={i === range}
              onClick={() => setRange(i)}
            >
              {i * RANGE + 1}–{Math.min(total, (i + 1) * RANGE)}
            </button>
          ))}
        </div>
      )}
      <nav className="ep-strip" ref={strip} aria-label="Серии">
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
          <Link
            key={n}
            to={`/watch/${animeId}/${n}`}
            className={`ep-chip${n <= seen && n !== current ? ' ep-chip--seen' : ''}`}
            aria-current={n === current ? 'page' : undefined}
            aria-label={`Серия ${n}${names[n] ? `: ${names[n]}` : ''}${n <= seen ? ', просмотрена' : ''}`}
            title={names[n] || undefined}
          >
            {n}
          </Link>
        ))}
      </nav>
      {names[current] && (
        <p className="ep-name">
          {current}. {names[current]}
        </p>
      )}
    </aside>
  )
}

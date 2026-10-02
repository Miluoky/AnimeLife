import { Link, useNavigate, useParams } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { loadAnime, useAsync } from '../api'
import { episodeCount } from '../data/catalog'
import { saveProgress } from '../data/history'
import { getEntry, setWatched } from '../data/myList'
import NotFound from './NotFound'
import WatchTogetherButton from '../components/together/WatchTogetherButton'
import VideoPlayer from '../components/VideoPlayer'
import { markFlag } from '../data/flags'
import { usePageMeta } from '../data/pageMeta'

// Комментарии тянут SDK Appwrite: грузим их отдельно, плеер появляется сразу.
const EpisodeComments = lazy(() => import('../components/EpisodeComments'))

export default function Player() {
  const { id = '', episode = '1' } = useParams()
  const navigate = useNavigate()
  const result = useAsync(() => loadAnime(id), [id])
  const anime = result.value?.data

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

  return (
    <main className="container player-page">
      <div className="stack player-main">
        {/* Мульти-провайдерный плеер; если серию взять негде — трейлер */}
        <VideoPlayer
          title={anime.title}
          originalTitle={anime.originalTitle}
          englishTitle={anime.englishTitle}
          shikimoriId={anime.id}
          episode={current}
          totalEpisodes={total}
          onEpisodeChange={goTo}
          trailerUrl={anime.trailerUrl}
        />

        <div className="section-head" style={{ alignItems: 'flex-start' }}>
          <div>
            <Link to={`/anime/${anime.id}`} className="muted">
              {anime.title}
            </Link>
            <h1 style={{ fontSize: 30 }}>Серия {current}</h1>
          </div>
          <div className="actions">
            <WatchTogetherButton anime={anime} episode={current} />
            <button type="button" className="btn btn--ghost" disabled={current <= 1} onClick={() => goTo(current - 1)}>
              Предыдущая
            </button>
            <button
              type="button"
              className="btn btn--accent"
              disabled={current >= total}
              onClick={() => goTo(current + 1)}
            >
              Следующая серия
            </button>
          </div>
        </div>

        <Suspense fallback={null}>
          <EpisodeComments animeId={anime.id} episode={current} />
        </Suspense>
      </div>

      <aside className="episode-list">
        <div className="section-head">
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Серии</h2>
          <span className="muted">{total}</span>
        </div>
        <div className="episode-list__items">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`episode-row${n === current ? ' active' : ''}`}
              aria-current={n === current ? 'true' : undefined}
              onClick={() => goTo(n)}
            >
              <span className="episode-row__num">{n}</span>
              <span style={{ flexGrow: 1, fontWeight: 600 }}>Серия {n}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {n === current ? 'Сейчас' : anime.episodeMinutes ? `${anime.episodeMinutes} мин` : ''}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </main>
  )
}

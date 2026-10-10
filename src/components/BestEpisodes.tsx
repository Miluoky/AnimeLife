import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { loadBestEpisodes } from '../data/social'
import './theme-songs.css'

/** «Лучшие серии» на странице тайтла: по оценкам зрителей под плеером (1–5 звёзд). */
export default function BestEpisodes({ animeId }: { animeId: string }) {
  const best = useAsync(() => loadBestEpisodes(animeId).catch(() => []), [animeId])
  const list = best.value ?? []
  if (!list.length) return null
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Лучшие серии по оценкам зрителей</h2>
      </div>
      <div className="best-episodes">
        {list.map((e) => (
          <Link key={e.episode} to={`/watch/${animeId}/${e.episode}`} className="chip best-episodes__item">
            Серия {e.episode} <b>★ {e.avg.toFixed(1)}</b> <span className="muted">({e.votes})</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

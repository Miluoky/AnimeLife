import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { reactionsForAnime, useEpisodeReactions } from '../data/episodeReactions'
import { loadBestEpisodes } from '../data/social'
import './theme-songs.css'

/** «Лучшие серии» на странице тайтла: оценки зрителей + ваши пометки (шедевр / плакал…). */
export default function BestEpisodes({ animeId }: { animeId: string }) {
  const best = useAsync(() => loadBestEpisodes(animeId).catch(() => []), [animeId])
  const mine = reactionsForAnime(animeId, useEpisodeReactions())
  const list = best.value ?? []
  if (!list.length && !mine.length) return null
  return (
    <section className="stack">
      {mine.length > 0 && (
        <>
          <div className="section-head">
            <h2>Ваши пометки серий</h2>
          </div>
          <div className="best-episodes">
            {mine.map((e) => (
              <Link key={`m-${e.episode}`} to={`/watch/${animeId}/${e.episode}`} className="chip best-episodes__item">
                Серия {e.episode} <b>{e.label}</b>
              </Link>
            ))}
          </div>
        </>
      )}
      {list.length > 0 && (
        <>
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
        </>
      )}
    </section>
  )
}

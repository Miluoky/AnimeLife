import { Link } from 'react-router-dom'
import type { Anime } from '../data/catalog'
import { Poster } from './PosterCard'

export default function HentaiCard({
  anime,
  priority,
  isManga,
}: {
  anime: Anime
  priority?: boolean
  isManga?: boolean
}) {
  const targetHref = isManga ? `/manga/${anime.id}` : `/anime/${anime.id}`

  const posterAlt = isManga ? `Обложка манги «${anime.title}»` : undefined

  return (
    <article className="poster-card hentai-card">
      <Link to={targetHref} className="poster-card__img" aria-label={anime.title}>
        <Poster anime={anime} priority={priority} alt={posterAlt} />
        <span className="hentai-card__badge" aria-hidden>
          18+
        </span>
        {anime.score !== undefined && anime.score > 0 && (
          <span className="poster-card__score" aria-label={`Рейтинг ${anime.score}`}>
            ★ {anime.score.toFixed(1)}
          </span>
        )}
      </Link>
      <div className="poster-card__info">
        <Link to={targetHref} className="poster-card__title">
          {anime.title}
        </Link>
        <div className="poster-card__meta">
          <span>{isManga ? 'Манга' : (anime.kind?.toUpperCase() ?? 'OVA')}</span>
          {anime.year ? <span>{anime.year}</span> : null}
          {!isManga && anime.episodes ? <span>{anime.episodes} эп.</span> : null}
          {isManga && anime.episodes ? <span>{anime.episodes} гл.</span> : null}
        </div>
      </div>
    </article>
  )
}

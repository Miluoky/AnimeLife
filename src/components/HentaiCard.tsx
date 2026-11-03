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

  return (
    <article className="poster-card hentai-card">
      <Link to={targetHref} className="poster-card__img" aria-label={anime.title}>
        <Poster anime={anime} priority={priority} />
        <span
          className="hentai-card__badge"
          aria-label="18 плюс"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 2,
            padding: '2px 6px',
            fontSize: '11px',
            fontWeight: 800,
            borderRadius: '4px',
            background: 'rgba(255, 84, 112, 0.9)',
            color: '#fff',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
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
          {anime.year && <span>{anime.year}</span>}
          {anime.episodes ? <span>{anime.episodes} эп.</span> : null}
        </div>
      </div>
    </article>
  )
}

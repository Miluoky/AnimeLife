import { Link } from 'react-router-dom'
import type { Anime, AnimeCard } from '../data/catalog'

export function Poster({ anime, className }: { anime: Pick<Anime, 'title' | 'posterUrl' | 'posterFill'>; className?: string }) {
  return anime.posterUrl ? (
    <img className={`poster-img ${className ?? ''}`} src={anime.posterUrl} alt="" loading="lazy" />
  ) : (
    <span className="placeholder-label">[Постер]</span>
  )
}

export default function PosterCard({ anime }: { anime: AnimeCard }) {
  const meta = [anime.year, anime.kind, anime.episodes && `${anime.episodes} эп.`].filter(Boolean).join(' · ')

  return (
    <Link to={`/anime/${anime.id}`} className="poster-card">
      <div className="poster-card__img" style={{ background: anime.posterFill }}>
        <Poster anime={anime} />
        {anime.ongoing && <span className="poster-card__badge">Онгоинг</span>}
        {anime.score ? <span className="poster-card__score">★ {anime.score.toFixed(1)}</span> : null}
      </div>
      <div>
        <div className="poster-card__title">{anime.title}</div>
        <div className="poster-card__meta">{meta}</div>
      </div>
    </Link>
  )
}

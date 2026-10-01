import { Link } from 'react-router-dom'
import type { Anime } from '../data/catalog'

export default function PosterCard({ anime }: { anime: Anime }) {
  const meta = [anime.year, anime.kind === 'Фильм' ? 'Фильм' : 'ТВ', anime.episodes && `${anime.episodes} эп.`]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link to={`/anime/${anime.id}`} className="poster-card">
      <div className="poster-card__img" style={{ background: anime.posterFill }}>
        {anime.ongoing && <span className="poster-card__badge">Онгоинг</span>}
        <span className="placeholder-label">[Постер]</span>
      </div>
      <div>
        <div className="poster-card__title">{anime.title}</div>
        <div className="poster-card__meta">{meta}</div>
      </div>
    </Link>
  )
}

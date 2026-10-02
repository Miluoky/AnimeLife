import { Link } from 'react-router-dom'
import { useMorphLink } from './morph'
import type { Anime, AnimeCard } from '../data/catalog'
import { prefetchTitle } from '../api/prefetch'

type PosterAnime = Pick<Anime, 'title' | 'posterUrl' | 'posterSmall' | 'posterSmall2x' | 'posterFill'>

/**
 * Постер в сетке: лёгкий webp (около 225 px), для экранов с высокой плотностью версия 2x.
 * Полный размер остаётся запасным, если лёгких версий у тайтла нет.
 */
export function Poster({
  anime,
  className,
  priority,
}: {
  anime: PosterAnime
  className?: string
  /** первый постер на экране грузим сразу и с высоким приоритетом, остальные лениво */
  priority?: boolean
}) {
  const src = anime.posterSmall ?? anime.posterUrl
  if (!src) return <span className="placeholder-label">[Постер]</span>
  return (
    <img
      className={`poster-img ${className ?? ''}`}
      src={src}
      srcSet={anime.posterSmall && anime.posterSmall2x ? `${anime.posterSmall} 1x, ${anime.posterSmall2x} 2x` : undefined}
      alt=""
      width={225}
      height={338}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // @ts-expect-error fetchpriority ещё нет в типах React 18
      fetchpriority={priority ? 'high' : undefined}
    />
  )
}

export default function PosterCard({ anime, priority }: { anime: AnimeCard; priority?: boolean }) {
  const meta = [anime.year, anime.kind, anime.episodes && `${anime.episodes} эп.`].filter(Boolean).join(' · ')
  const prefetch = () => prefetchTitle(anime.id)
  const to = `/anime/${anime.id}`
  // При переходе на страницу тайтла постер карточки «перелетает» в шапку страницы (View Transitions).
  const morph = useMorphLink(to, '.poster-card__img')

  return (
    <Link to={to} className="poster-card" onClick={morph} onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch}>
      <div className="poster-card__img" style={{ background: anime.posterFill }}>
        <Poster anime={anime} priority={priority} />
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

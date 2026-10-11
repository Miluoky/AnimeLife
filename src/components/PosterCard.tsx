import { Link } from 'react-router-dom'
import { srcset2x } from '../data/saver'
import type { SyntheticEvent } from 'react'
import type { Anime, AnimeCard } from '../data/catalog'
import { prefetchTitle } from '../api/prefetch'
import { listStatuses, setListStatus, totalEpisodes, useMyListEntry } from '../data/myList'
import { toast } from '../data/toast'
import { PlusIcon } from './Icons'
import { useHistoryEntry } from '../data/history'

/** Картинка проявляется, когда догрузилась, а не появляется построчно. */
export const fadeIn = (e: SyntheticEvent<HTMLImageElement>) => e.currentTarget.classList.add('is-loaded')

type PosterAnime = Pick<Anime, 'title' | 'posterUrl' | 'posterSmall' | 'posterSmall2x' | 'posterFill'>

/**
 * Постер в сетке: лёгкий webp (около 225 px), для экранов с высокой плотностью версия 2x.
 * Полный размер остаётся запасным, если лёгких версий у тайтла нет.
 */
export function Poster({
  anime,
  className,
  priority,
  alt = '',
}: {
  anime: PosterAnime
  className?: string
  /** в карточке название уже написано рядом, поэтому по умолчанию картинка без подписи */
  alt?: string
  /** первый постер на экране грузим сразу и с высоким приоритетом, остальные лениво */
  priority?: boolean
}) {
  const src = anime.posterSmall ?? anime.posterUrl
  if (!src) return <span className="placeholder-label">[Постер]</span>
  return (
    <img
      className={`poster-img poster-img--fade ${className ?? ''}`}
      onLoad={fadeIn}
      src={src}
      srcSet={srcset2x(anime.posterSmall, anime.posterSmall2x)}
      alt={alt}
      width={225}
      height={338}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // @ts-expect-error fetchpriority ещё нет в типах React 18
      fetchpriority={priority ? 'high' : undefined}
    />
  )
}

export default function PosterCard({
  anime,
  priority,
  tag,
  hideMine,
  href,
}: {
  anime: AnimeCard
  /** карточка ведёт не на аниме (например, на мангу): без быстрого добавления в список и без предзагрузки тайтла */
  href?: string
  priority?: boolean
  /** плашка внизу постера, например отношение к тайтлу («Продолжение») */
  tag?: { text: string; accent?: boolean }
  /** не показывать статус из списка (в самом «Моём списке» он и так виден по вкладке) */
  hideMine?: boolean
}) {
  const meta = [anime.year, anime.kind, anime.episodes && `${anime.episodes} эп.`].filter(Boolean).join(' · ')
  const prefetch = href ? undefined : () => prefetchTitle(anime.id)
  const to = href ?? `/anime/${anime.id}`
  // Свой статус видно прямо на постере: что уже в списке и сколько серий осталось.
  const entry = useMyListEntry(anime.id)
  const seen = useHistoryEntry(anime.id)
  const total = totalEpisodes(anime) || seen?.totalEpisodes || 0
  const watched = entry?.status === 'completed' ? total : Math.max(entry?.watched ?? 0, seen ? seen.episode - 1 : 0)
  const mine = !hideMine && entry && listStatuses.find((s) => s.id === entry.status)?.title

  // Быстрое «Буду смотреть» прямо с карточки, без перехода на страницу тайтла.
  // Кнопка стоит рядом со ссылкой, а не внутри неё: кнопка внутри ссылки недопустима.
  const quickAdd = !entry && !href && (
    <button
      type="button"
      className="poster-quick"
      aria-label={`«${anime.title}»: добавить в «Буду смотреть»`}
      title="Буду смотреть"
      onClick={() => {
        setListStatus(anime, 'planned')
        toast(`${anime.title}: «Буду смотреть»`, { label: 'Отменить', onClick: () => setListStatus(anime, undefined) })
      }}
    >
      <PlusIcon size={18} />
    </button>
  )

  return (
    <div className="poster-card-wrap">
      <Link to={to} className="poster-card" onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch}>
        {/* data-morph: при переходе на страницу тайтла постер «перелетает» в её шапку (см. morph.ts) */}
        <div className="poster-card__img" data-morph style={{ background: anime.posterFill }}>
          <Poster anime={anime} priority={priority} />
          {anime.ongoing && <span className="poster-card__badge">Онгоинг</span>}
          {anime.score ? <span className="poster-card__score">★ {anime.score.toFixed(1)}</span> : null}
          {tag ? (
            <span className={`poster-card__tag${tag.accent ? ' poster-card__tag--accent' : ''}`}>{tag.text}</span>
          ) : (
            mine &&
            entry && (
              <span className={`poster-card__tag poster-card__mine poster-card__mine--${entry.status}`}>
                {mine}
                {entry.status === 'watching' && total > 1 && watched > 0 ? ` · ${watched}/${total}` : ''}
              </span>
            )
          )}
          {total > 1 && watched > 0 && watched < total && (
            <span className="poster-card__progress" aria-hidden="true">
              <span style={{ width: `${(watched / total) * 100}%` }} />
            </span>
          )}
        </div>
        <div>
          <div className="poster-card__title">{anime.title}</div>
          <div className="poster-card__meta">{meta}</div>
        </div>
      </Link>
      {quickAdd}
    </div>
  )
}

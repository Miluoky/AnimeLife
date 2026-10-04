import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { loadAnime } from '../api'
import type { Anime } from '../data/catalog'
import { listStatuses, setListStatus, useMyList } from '../data/myList'
import { useHistory } from '../data/history'
import { toast } from '../data/toast'
import { PlayIcon, PlusIcon, CheckIcon } from './Icons'
import './hovercard.css'

const SHOW_DELAY = 550
const HIDE_DELAY = 140
const WIDTH = 320

interface Shown {
  id: string
  rect: DOMRect
}

/**
 * Карточка при наведении, как на AniLife: задержали курсор на постере в любой сетке или полке —
 * рядом появляется описание, жанры и кнопки «Смотреть» и «Буду смотреть».
 * Слушает весь документ, поэтому сами карточки ничего об этом не знают. Только для мыши.
 */
export default function HoverCards() {
  const [shown, setShown] = useState<Shown>()
  const [loaded, setLoaded] = useState<{ id: string; anime?: Anime }>()
  const showTimer = useRef<number>()
  const hideTimer = useRef<number>()
  const pop = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => setShown(undefined), [location.pathname])

  useEffect(() => {
    const cardOf = (t: EventTarget | null) =>
      t instanceof Element ? t.closest<HTMLAnchorElement>('a.poster-card[href*="/anime/"]') : null
    const inPop = (t: EventTarget | null) => t instanceof Node && !!pop.current?.contains(t)

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (inPop(e.target)) {
        clearTimeout(hideTimer.current)
        return
      }
      const card = cardOf(e.target)
      if (!card) return
      clearTimeout(hideTimer.current)
      clearTimeout(showTimer.current)
      const id = card.pathname.match(/\/anime\/(\d+)/)?.[1]
      if (!id) return
      showTimer.current = window.setTimeout(() => {
        const box = card.querySelector('.poster-card__img') ?? card
        setShown({ id, rect: box.getBoundingClientRect() })
      }, SHOW_DELAY)
    }
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const to = e.relatedTarget
      if (inPop(to) || (cardOf(e.target) && cardOf(e.target) === cardOf(to))) return
      clearTimeout(showTimer.current)
      hideTimer.current = window.setTimeout(() => setShown(undefined), HIDE_DELAY)
    }
    const hide = () => {
      clearTimeout(showTimer.current)
      setShown(undefined)
    }
    const onDown = (e: PointerEvent) => !inPop(e.target) && hide()
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', onDown)
    // В захвате: прокрутка полки вбок тоже сдвигает карточку.
    document.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('scroll', hide, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!shown) return setLoaded(undefined)
    let cancelled = false
    // Данные обычно уже в кэше: prefetchTitle запросил их, как только курсор оказался на карточке.
    const id = shown.id
    loadAnime(id).then((r) => !cancelled && setLoaded({ id, anime: r.data }))
    return () => {
      cancelled = true
    }
  }, [shown?.id])

  const anime = loaded?.id === shown?.id ? loaded?.anime : undefined
  if (!shown || !anime) return null

  const { rect } = shown
  const right = rect.right + 12 + WIDTH < window.innerWidth
  const left = right ? rect.right + 12 : Math.max(8, rect.left - 12 - WIDTH)
  const top = Math.min(Math.max(8, rect.top - 8), window.innerHeight - 380)

  return createPortal(
    <div
      ref={pop}
      className={`hovercard hovercard--${right ? 'right' : 'left'}`}
      style={{ left, top, width: WIDTH }}
      role="dialog"
      aria-label={anime.title}
    >
      <Content anime={anime} />
    </div>,
    document.body,
  )
}

function Content({ anime }: { anime: Anime }) {
  const entry = useMyList().find((e) => e.anime.id === anime.id)
  const progress = useHistory().find((h) => h.animeId === anime.id)
  const meta = [
    anime.year,
    anime.kind,
    anime.ongoing && anime.episodesAired
      ? `${anime.episodesAired} из ${anime.episodes ?? '?'} эп.`
      : anime.episodes && anime.episodes > 1 && `${anime.episodes} эп.`,
    anime.studio,
  ].filter(Boolean)
  const status = entry && listStatuses.find((s) => s.id === entry.status)?.title
  const episode = progress?.episode ?? 1

  return (
    <>
      <div className="hovercard__head">
        <Link to={`/anime/${anime.id}`} className="hovercard__title">
          {anime.title}
        </Link>
        {anime.score ? <span className="hovercard__score">★ {anime.score.toFixed(1)}</span> : null}
      </div>
      {anime.originalTitle && <p className="hovercard__orig">{anime.originalTitle}</p>}
      <p className="hovercard__meta">{meta.join(' · ')}</p>
      {anime.genres.length > 0 && (
        <div className="hovercard__genres">
          {anime.genres.slice(0, 4).map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
      )}
      {anime.description && <p className="hovercard__desc">{anime.description}</p>}
      <div className="hovercard__actions">
        {!anime.upcoming && (
          <Link to={`/watch/${anime.id}/${episode}`} className="btn btn--accent hovercard__btn">
            <PlayIcon size={16} />
            {progress ? `Серия ${episode}` : 'Смотреть'}
          </Link>
        )}
        {entry ? (
          <Link to="/my-list" className="btn btn--ghost hovercard__btn">
            <CheckIcon size={16} />
            {status}
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn--ghost hovercard__btn"
            onClick={() => {
              setListStatus(anime, 'planned')
              toast(`${anime.title}: «Буду смотреть»`, { label: 'Отменить', onClick: () => setListStatus(anime, undefined) })
            }}
          >
            <PlusIcon size={16} />
            Буду смотреть
          </button>
        )}
      </div>
    </>
  )
}

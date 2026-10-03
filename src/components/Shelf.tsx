import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  title: string
  /** короткая подпись под заголовком */
  subtitle?: string
  icon?: ReactNode
  /** ссылка «Все» справа от заголовка */
  more?: { to: string; label?: string }
  /** модификатор ряда: compact (персонажи), wide (видео) */
  variant?: 'compact' | 'wide'
  /** что-то между заголовком и рядом, например фильтр */
  extra?: ReactNode
  children: ReactNode
}

/** Полка с горизонтальной прокруткой: заголовок с подписью и стрелки для мыши по краям ряда. */
export default function Shelf({ title, subtitle, icon, more, variant, extra, children }: Props) {
  const row = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  useEffect(() => {
    const el = row.current
    if (!el) return
    const update = () =>
      setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [children])

  const scroll = (dir: 1 | -1) => {
    const el = row.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="stack shelf">
      <div className="shelf__head">
        {icon && (
          <span className="shelf__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="shelf__titles">
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {more && (
          <Link to={more.to} className="shelf__more">
            {more.label ?? 'Все'}
          </Link>
        )}
      </div>
      {extra}
      <div className="shelf__body">
        <div ref={row} className={`row-scroll${variant ? ` row-scroll--${variant}` : ''}`}>
          {children}
        </div>
        {!edges.start && (
          <button type="button" className="shelf__arrow shelf__arrow--prev" aria-label="Прокрутить назад" onClick={() => scroll(-1)}>
            <Chevron dir="left" />
          </button>
        )}
        {!edges.end && (
          <button type="button" className="shelf__arrow shelf__arrow--next" aria-label="Прокрутить дальше" onClick={() => scroll(1)}>
            <Chevron dir="right" />
          </button>
        )}
      </div>
    </section>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

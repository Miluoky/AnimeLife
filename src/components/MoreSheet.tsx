import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { CalendarIcon, ClockIcon, PeopleIcon, SparkIcon, TrophyIcon, UserIcon } from './Icons'
import './more-sheet.css'

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Svg = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d={d} />
  </svg>
)

/** Разделы, которым не хватило места в нижнем меню. */
const LINKS = [
  { to: '/schedule', title: 'График', hint: 'Когда серии', icon: <CalendarIcon /> },
  { to: '/together', title: 'Вместе', hint: 'Смотреть с друзьями', icon: <PeopleIcon /> },
  { to: '/ongoing', title: 'Онгоинги', hint: 'Выходят сейчас', icon: <ClockIcon size={22} /> },
  { to: '/top', title: 'Топ', hint: 'Лучшие тайтлы', icon: <TrophyIcon size={22} /> },
  { to: '/random', title: 'Случайное', hint: 'Испытать удачу', icon: <Svg d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /> },
  { to: '/collections', title: 'Подборки', hint: 'По настроению', icon: <Svg d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  { to: '/quiz', title: 'Викторина', hint: 'Угадай аниме', icon: <SparkIcon size={22} /> },
  { to: '/chat', title: 'Чат', hint: 'Общий разговор', icon: <Svg d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /> },
  { to: '/changelog', title: 'Что нового', hint: 'Обновления сайта', icon: <Svg d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /> },
]

/** Шторка «Ещё» снизу: профиль и остальные разделы сайта. Закрывается по фону, Esc и переходу. */
export default function MoreSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('sheet-open')
    sheet.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      root.classList.remove('sheet-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const name = user ? user.name || user.email : ''
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={sheet} id="more-sheet" className="sheet" role="dialog" aria-modal="true" aria-label="Ещё разделы">
        <span className="sheet__grip" aria-hidden="true" />
        <Link to="/account" className={`sheet__me${pathname === '/account' ? ' is-here' : ''}`}>
          <span className="sheet__avatar">{user ? <span className="avatar">{name.charAt(0).toUpperCase()}</span> : <UserIcon />}</span>
          <span className="sheet__me-text">
            <b>{user ? name : 'Войти'}</b>
            <span>{user ? 'Профиль, достижения, настройки' : 'Список и прогресс на всех устройствах'}</span>
          </span>
        </Link>
        <nav className="sheet__grid" aria-label="Ещё разделы">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={`sheet__tile${pathname.startsWith(l.to) ? ' is-here' : ''}`}>
              {l.icon}
              <b>{l.title}</b>
              <span>{l.hint}</span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}

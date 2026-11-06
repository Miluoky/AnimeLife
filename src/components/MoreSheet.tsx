import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { useCouch } from '../data/couchMode'
import { ClockIcon, PeopleIcon, SparkIcon, TrophyIcon, UserIcon } from './Icons'
import './more-sheet.css'

const COUCH_HIDE = /^\/(community|chat|club|duel|quiz|recap|hentai|hentai-manga|together)/

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Svg = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...line} aria-hidden="true">
    <path d={d} />
  </svg>
)

/** Разделы, которым не хватило места в нижнем меню. */
const LINKS = [
  { to: '/together', title: 'Вместе', hint: 'Смотреть с друзьями', icon: <PeopleIcon /> },
  { to: '/hentai', title: 'Хентай', hint: 'Аниме 18+', icon: <Svg d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /> },
  { to: '/hentai-manga', title: 'Хентай Манга', hint: 'Додзинси 18+', icon: <Svg d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /> },
  { to: '/season', title: 'Сезон', hint: 'Чарт сезона', icon: <Svg d="M12 3v2M12 19v2M5 12H3M21 12h-2M7 7 5.6 5.6M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8" /> },
  { to: '/ongoing', title: 'Онгоинги', hint: 'Выходят сейчас', icon: <ClockIcon size={22} /> },
  { to: '/top', title: 'Топ', hint: 'Лучшие тайтлы', icon: <TrophyIcon size={22} /> },
  { to: '/chronology/fate', title: 'Хронологии', hint: 'Порядок сезонов', icon: <ClockIcon size={22} /> },
  { to: '/trope/op-from-start', title: 'Тропы', hint: 'Темы и микро-жанры', icon: <SparkIcon size={22} /> },
  { to: '/voice/anilibria', title: 'Озвучка', hint: 'Студии дубляжа', icon: <Svg d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" /> },
  { to: '/random', title: 'Случайное', hint: 'Испытать удачу', icon: <Svg d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /> },
  { to: '/manga', title: 'Манга', hint: 'Читать онлайн', icon: <Svg d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /> },
  { to: '/collections', title: 'Подборки', hint: 'По настроению', icon: <Svg d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  { to: '/quiz', title: 'Викторина', hint: 'Угадай аниме', icon: <SparkIcon size={22} /> },
  { to: '/duel', title: 'Дуэль', hint: 'Чей вкус ближе', icon: <Svg d="M4 5h6v14H4zM14 5h6v14h-6z" /> },
  { to: '/community', title: 'Сообщество', hint: 'Лента, клубы, топ', icon: <PeopleIcon /> },
  { to: '/chat', title: 'Чат', hint: 'Общий разговор', icon: <Svg d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /> },
  { to: '/news', title: 'Новости', hint: 'Анонсы и премьеры', icon: <Svg d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" /> },
  { to: '/scene', title: 'По кадру', hint: 'Найти по скриншоту', icon: <Svg d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0" /> },
  { to: '/recap', title: 'Итоги года', hint: 'Мой год в аниме', icon: <TrophyIcon size={22} /> },
  { to: '/changelog', title: 'Что нового', hint: 'Обновления сайта', icon: <Svg d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /> },
]

/** Шторка «Ещё» снизу: профиль и остальные разделы сайта. Закрывается по фону, Esc и переходу. */
export default function MoreSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const couch = useCouch()
  const sheet = useRef<HTMLDivElement>(null)
  const links = couch ? LINKS.filter((l) => !COUCH_HIDE.test(l.to)) : LINKS
  const touchStartY = useRef(0)
  const touchCurrentY = useRef(0)
  const touchStartTime = useRef(0)
  const isDragging = useRef(false)

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const isGrip = target.classList.contains('sheet__grip') || target.closest('.sheet__grip')
    const sheetEl = sheet.current
    if (isGrip || (sheetEl && sheetEl.scrollTop <= 0)) {
      touchStartY.current = e.touches[0].clientY
      touchCurrentY.current = e.touches[0].clientY
      touchStartTime.current = Date.now()
      isDragging.current = true
      if (sheetEl) {
        sheetEl.style.transition = 'none'
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || !sheet.current) return
    const currentY = e.touches[0].clientY
    touchCurrentY.current = currentY
    const deltaY = currentY - touchStartY.current

    if (deltaY > 0) {
      sheet.current.style.transform = `translateY(${deltaY}px)`
    } else {
      sheet.current.style.transform = ''
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging.current || !sheet.current) return
    isDragging.current = false
    const sheetEl = sheet.current
    const deltaY = touchCurrentY.current - touchStartY.current
    const elapsed = Math.max(1, Date.now() - touchStartTime.current)
    const velocity = deltaY / elapsed

    if (deltaY > 80 || (deltaY > 30 && velocity > 0.4)) {
      sheetEl.style.transition = 'transform 0.22s var(--ease), opacity 0.2s ease'
      sheetEl.style.transform = 'translateY(100%)'
      sheetEl.style.opacity = '0'
      setTimeout(onClose, 200)
    } else {
      sheetEl.style.transition = 'transform 0.22s var(--ease)'
      sheetEl.style.transform = ''
    }
  }

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
      <div
        ref={sheet}
        id="more-sheet"
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Ещё разделы"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <span className="sheet__grip" aria-hidden="true" style={{ cursor: 'grab', touchAction: 'none' }} />
        <Link to="/account" className={`sheet__me${pathname === '/account' ? ' is-here' : ''}`}>
          <span className="sheet__avatar">{user ? <span className="avatar">{name.charAt(0).toUpperCase()}</span> : <UserIcon />}</span>
          <span className="sheet__me-text">
            <b>{user ? name : 'Войти'}</b>
            <span>{user ? 'Профиль, списки, настройки' : 'Войдите в аккаунт для синхронизации'}</span>
          </span>
        </Link>
        <nav className="sheet__grid" aria-label="Ещё разделы">
          {links.map((l) => (
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

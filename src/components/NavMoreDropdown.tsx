import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './nav-more.css'

interface DropdownItem {
  to: string
  title: string
  desc?: string
  icon?: string
}

interface DropdownCategory {
  title: string
  items: DropdownItem[]
}

const CATEGORIES: DropdownCategory[] = [
  {
    title: 'Интерактив',
    items: [
      { to: '/scene', title: 'Поиск по кадру', desc: 'Найти аниме по скриншоту', icon: '🔍' },
      { to: '/quiz', title: 'Аниме-квизы', desc: 'Тесты на знание тайтлов', icon: '🎯' },
      { to: '/duel', title: 'Битва вкусов', desc: 'Выбирай любимых героев', icon: '⚔️' },
      { to: '/random', title: 'Случайное аниме', desc: 'Не знаешь, что глянуть', icon: '🎲' },
    ],
  },
  {
    title: 'Медиа и Справочники',
    items: [
      { to: '/top', title: 'Топ-100 аниме', desc: 'Лучшие по рейтингу', icon: '🏆' },
      { to: '/chronology', title: 'Хронологии франшиз', desc: 'Порядок просмотра', icon: '⏳' },
      { to: '/trope', title: 'Коллекции тропов', desc: 'Сюжетные архетипы', icon: '🏷️' },
      { to: '/voice/anilibria', title: 'Студии озвучки', desc: 'AniLibria, Persona99...', icon: '🎙️' },
      { to: '/news', title: 'Новости аниме', desc: 'Свежие анонсы', icon: '📰' },
      { to: '/recap', title: 'Рекапы сезонов', desc: 'Краткие содержания', icon: '🎬' },
    ],
  },
  {
    title: 'Сообщество и Сервис',
    items: [
      { to: '/community', title: 'Сообщество', desc: 'Клубы и топ зрителей', icon: '👥' },
      { to: '/chat', title: 'Общий чат', desc: 'Живое обсуждение онлайн', icon: '💬' },
      { to: '/collections', title: 'Подборки пользователей', desc: 'Списки от зрителей', icon: '📚' },
      { to: '/changelog', title: 'История обновлений', desc: 'Что нового на сайте', icon: '⚡' },
    ],
  },
]

export default function NavMoreDropdown() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Закрывать при смене роута
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Закрывать при клике вне меню и по Esc
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={menuRef} className="nav-more-wrap">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Дополнительные разделы сайта"
        className={`nav-more-btn ${open ? 'is-open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <span>Ещё</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="nav-more-arrow"
          aria-hidden="true"
        >
          <polyline points="3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Меню дополнительных разделов"
          className="nav-more-dropdown frame-corners"
        >
          <div className="nav-more-scroll">
            {CATEGORIES.map((cat) => (
              <div key={cat.title} className="nav-more-group">
                <div className="nav-more-heading">{cat.title}</div>
                {cat.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className="nav-more-item"
                  >
                    <span className="nav-more-icon">{item.icon}</span>
                    <div className="nav-more-text">
                      <span className="nav-more-title">{item.title}</span>
                      {item.desc && <span className="nav-more-desc">{item.desc}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

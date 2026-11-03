import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

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
    <div ref={menuRef} className="nav-more-wrap" style={{ position: 'relative' }}>
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          color: open ? 'var(--accent)' : 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 'var(--radius-sm)',
          transition: 'color 0.15s ease',
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
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
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
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            zIndex: 1000,
            width: 'min(92vw, 680px)',
            maxHeight: '80vh',
            overflowY: 'auto',
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--glass-shadow), 0 0 30px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            animation: 'fade-scale 0.18s var(--ease)',
          }}
        >
          {CATEGORIES.map((cat) => (
            <div key={cat.title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--accent)',
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--line)',
                  marginBottom: 4,
                }}
              >
                {cat.title}
              </div>
              {cat.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 12%, transparent)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{item.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{item.title}</span>
                    {item.desc && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 2 }}>
                        {item.desc}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

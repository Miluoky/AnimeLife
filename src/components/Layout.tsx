import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { CloseIcon, MenuIcon, SearchIcon, UserIcon } from './Icons'

export function Logo() {
  return (
    <Link to="/" className="logo">
      аниме<span>.</span>
    </Link>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // При переходе на другую страницу: закрыть мобильное меню и вернуться наверх.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setMenuOpen(false)
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  const navLinks = (
    <>
      <NavLink to="/" end>
        Каталог
      </NavLink>
      <NavLink to="/ongoing">Онгоинги</NavLink>
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/my-list">Мой список</NavLink>
    </>
  )

  const searchForm = (id: string, className: string) => (
    <form className={className} role="search" onSubmit={onSearch}>
      <SearchIcon />
      <label htmlFor={id} className="sr-only">
        Поиск аниме
      </label>
      <input id={id} type="search" placeholder="Найти аниме" value={query} onChange={(e) => setQuery(e.target.value)} />
    </form>
  )

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Logo />
          <nav className="site-nav" aria-label="Основное меню">
            {navLinks}
          </nav>
          <div style={{ flexGrow: 1 }} />
          {searchForm('q', 'search')}
          <Link to="/my-list" className="icon-btn" aria-label="Мой список" title="Мой список">
            <UserIcon />
          </Link>
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
        {menuOpen && (
          <div id="mobile-menu" className="mobile-menu container">
            {searchForm('q-mobile', 'search search--mobile')}
            <nav className="mobile-menu__nav" aria-label="Основное меню">
              {navLinks}
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <Logo />
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <a href="#">О проекте</a>
            <a href="#">Правообладателям</a>
            <a href="#">Контакты</a>
          </div>
        </div>
      </footer>
    </>
  )
}

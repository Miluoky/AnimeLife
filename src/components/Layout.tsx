import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import SearchBox from './SearchBox'
import InstallBanner from './InstallBanner'
import { useAuth } from '../data/auth'

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Anime Life, на главную">
      Anime<span>Life</span>
    </Link>
  )
}

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // При переходе на другую страницу: закрыть мобильное меню и вернуться наверх.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  const navLinks = (
    <>
      <NavLink to="/" end>
        Главная
      </NavLink>
      <NavLink to="/catalog">Каталог</NavLink>
      <NavLink to="/ongoing">Онгоинги</NavLink>
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/my-list">Мой список</NavLink>
    </>
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
          <SearchBox className="search" />
          <Link
            to="/account"
            className={`icon-btn${user ? ' icon-btn--active' : ''}`}
            aria-label={user ? `Аккаунт: ${user.name || user.email}` : 'Войти'}
            title={user ? user.name || user.email : 'Войти'}
          >
            {user ? <span className="avatar">{(user.name || user.email).charAt(0).toUpperCase()}</span> : <UserIcon />}
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
            <SearchBox className="search search--mobile" onDone={() => setMenuOpen(false)} />
            <nav className="mobile-menu__nav" aria-label="Основное меню">
              {navLinks}
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <InstallBanner />

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

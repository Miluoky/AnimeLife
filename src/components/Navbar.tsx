import { forwardRef, Suspense, lazy, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import SearchBox from './SearchBox'
import type { User } from '../data/auth'

const NavMoreDropdown = lazy(() => import('./NavMoreDropdown'))
const NotificationBell = lazy(() => import('./NotificationBell'))

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Anime Life, на главную">
      Anime <span>Life</span>
    </Link>
  )
}

export interface NavbarProps {
  user?: User | null
  fresh?: number
  menuOpen: boolean
  menuClosing: boolean
  onToggleMenu: (open: boolean) => void
  onMenuClosingEnd: () => void
  navExtra?: ReactNode
}

/**
 * Верхняя навигационная панель AnimeLife («Кино-кадр»).
 * Учитывает безопасную зону Dynamic Island / notch через env(safe-area-inset-top),
 * поддерживает компактную высоту 60px на мобильных устройствах и отзывчивые touch-цели >= 44px.
 */
export const Navbar = forwardRef<HTMLElement, NavbarProps>(function Navbar(
  { user, fresh = 0, menuOpen, menuClosing, onToggleMenu, onMenuClosingEnd, navExtra },
  ref,
) {
  const { pathname } = useLocation()
  const libraryActive = pathname === '/library' || pathname === '/watching' || pathname === '/my-list'
  const navLinks = (
    <>
      <NavLink to="/" end>
        Главная
      </NavLink>
      <NavLink to="/catalog">Каталог</NavLink>
      <NavLink
        to={fresh ? '/library?tab=new' : '/library'}
        className={() => [libraryActive ? 'active' : '', fresh ? 'has-fresh' : ''].filter(Boolean).join(' ') || undefined}
        aria-label={fresh ? `Библиотека: новых серий ${fresh}` : 'Библиотека'}
      >
        Библиотека
      </NavLink>
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/manga">Манга</NavLink>
      <Suspense fallback={null}>
        <NavMoreDropdown />
      </Suspense>
      {navExtra}
    </>
  )

  return (
    <header ref={ref} className="site-header">
      <div className="container site-header__inner">
        <Logo />
        <nav className="site-nav" aria-label="Основное меню">
          {navLinks}
        </nav>
        <div style={{ flexGrow: 1 }} />
        <SearchBox className="search" />
        {user && (
          <Suspense fallback={<span className="icon-btn" aria-hidden="true" />}>
            <NotificationBell />
          </Suspense>
        )}
        <Link
          to="/account"
          className={`icon-btn${user ? ' icon-btn--active' : ''}`}
          aria-label={user ? `Профиль: ${user.name || user.email}` : 'Войти'}
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
          onClick={() => onToggleMenu(!menuOpen)}
        >
          <span className="menu-btn__icon" key={String(menuOpen)}>
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </span>
        </button>
      </div>
      {(menuOpen || menuClosing) && (
        <div
          id="mobile-menu"
          className={`mobile-menu container${menuOpen ? '' : ' mobile-menu--closing'}`}
          onAnimationEnd={(e) => e.target === e.currentTarget && !menuOpen && onMenuClosingEnd()}
        >
          <SearchBox className="search search--mobile" onDone={() => onToggleMenu(false)} />
          <nav className="mobile-menu__nav" aria-label="Основное меню">
            {navLinks}
          </nav>
        </div>
      )}
    </header>
  )
})

export default Navbar

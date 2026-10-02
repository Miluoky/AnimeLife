import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import SearchBox from './SearchBox'
import BottomNav from './BottomNav'
import Toasts from './Toasts'
import { useAuth } from '../data/auth'
import { applyAppearance } from '../data/theme'

// Баннер установки нужен не всем и не сразу: отдельная маленькая часть.
const InstallBanner = lazy(() => import('./InstallBanner'))

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
  const [scrolled, setScrolled] = useState(false)
  const header = useRef<HTMLElement>(null)

  // При переходе на другую страницу: закрыть мобильное меню и вернуться наверх.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Достижения и открытый профиль не нужны для первого экрана: подключаем, когда браузер свободен.
  const publicProfile = !!(user?.prefs as { publicProfile?: boolean } | undefined)?.publicProfile
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    idle(() => void import('../data/achievements').then((m) => m.watchAchievements()))
  }, [])
  useEffect(() => {
    if (publicProfile) void import('../data/profile').then((m) => m.autoPublish())
  }, [publicProfile])

  // Оформление из настроек (тема, акцент) и шапка, которая становится полупрозрачной при прокрутке.
  useEffect(() => {
    applyAppearance()
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ctrl+K (⌘K на Mac) или «/» вне поля ввода: курсор в поиск из любого места сайта.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')
      const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (!combo && (e.key !== '/' || typing)) return
      e.preventDefault()
      const desktop = header.current?.querySelector<HTMLInputElement>('.search:not(.search--mobile) input')
      if (desktop && desktop.offsetParent) return desktop.focus()
      setMenuOpen(true)
      setTimeout(() => header.current?.querySelector<HTMLInputElement>('.search--mobile input')?.focus(), 50)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const navLinks = (
    <>
      <NavLink to="/" end>
        Главная
      </NavLink>
      <NavLink to="/catalog">Каталог</NavLink>
      <NavLink to="/ongoing">Онгоинги</NavLink>
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/together">Вместе</NavLink>
      <NavLink to="/my-list">Мой список</NavLink>
    </>
  )

  return (
    <>
      <header ref={header} className={`site-header${scrolled ? ' site-header--scrolled' : ''}`}>
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

      <div className="page" key={location.pathname}>
        <Outlet />
      </div>

      <Suspense fallback={null}>
        <InstallBanner />
      </Suspense>
      <Toasts />
      <BottomNav />

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

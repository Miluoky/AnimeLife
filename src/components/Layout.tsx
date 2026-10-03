import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import SearchBox from './SearchBox'
import BottomNav from './BottomNav'
import Toasts from './Toasts'
import PageErrorBoundary from './PageErrorBoundary'
import { useAuth } from '../data/auth'
import { applyAppearance } from '../data/theme'
import { useViewTransitions } from './morph'
import { useCanonical } from '../data/pageMeta'

// Баннер установки нужен не всем и не сразу: отдельная маленькая часть.
const InstallBanner = lazy(() => import('./InstallBanner'))
// Ссылки на жанры и годы в подвале тоже не нужны для первого экрана.
const FooterLinks = lazy(() => import('./FooterLinks'))

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
  // Меню закрывается с анимацией: пока она идёт, оно ещё на экране.
  const [menuClosing, setMenuClosing] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const header = useRef<HTMLElement>(null)

  useViewTransitions()
  useCanonical()

  const toggleMenu = (open: boolean) => {
    if (open === menuOpen) return
    setMenuOpen(open)
    setMenuClosing(!open)
  }

  // При переходе на другую страницу: закрыть мобильное меню и вернуться наверх.
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Пока меню открыто, страница под ним не прокручивается; Esc закрывает меню.
  useEffect(() => {
    document.documentElement.classList.toggle('scroll-lock', menuOpen)
    if (!menuOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && toggleMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
      toggleMenu(true)
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
            onClick={() => toggleMenu(!menuOpen)}
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
            onAnimationEnd={(e) => e.target === e.currentTarget && !menuOpen && setMenuClosing(false)}
          >
            <SearchBox className="search search--mobile" onDone={() => toggleMenu(false)} />
            <nav className="mobile-menu__nav" aria-label="Основное меню">
              {navLinks}
            </nav>
          </div>
        )}
      </header>
      {(menuOpen || menuClosing) && (
        <div className={`menu-backdrop${menuOpen ? '' : ' menu-backdrop--closing'}`} onClick={() => toggleMenu(false)} />
      )}

      <div className="page" key={location.pathname}>
        <PageErrorBoundary>
          {/* Пока код страницы едет по сети, шапка и меню остаются на месте. */}
          <Suspense fallback={<main className="container page-fallback" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
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
          <Suspense fallback={null}>
            <FooterLinks />
          </Suspense>
        </div>
      </footer>
    </>
  )
}

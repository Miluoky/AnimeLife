import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import { useInboxCount } from '../data/inbox'
import SearchBox from './SearchBox'
import BottomNav from './BottomNav'
import Toasts from './Toasts'
import NetworkStatus from './NetworkStatus'
import PageErrorBoundary from './PageErrorBoundary'
import { useAuth } from '../data/auth'
import { applyAppearance } from '../data/theme'
import { pageScope, useViewTransitions } from './morph'
import { useScrollRestore } from './scrollRestore'
import { useCanonical } from '../data/pageMeta'
import { trackPage } from '../data/analytics'
import { useAmbientSrc } from './ambient'
import NavMoreDropdown from './NavMoreDropdown'

const InstallBanner = lazy(() => import('./InstallBanner'))
const FooterLinks = lazy(() => import('./FooterLinks'))
const BackToTop = lazy(() => import('./BackToTop'))
const HoverCards = lazy(() => import('./HoverCards'))
const NotificationBell = lazy(() => import('./NotificationBell'))

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Anime Life, на главную">
      Anime <span>Life</span>
    </Link>
  )
}

function Ambient() {
  const src = useAmbientSrc()
  return <div className="ambient" aria-hidden="true">{src && <img key={src} src={src} alt="" decoding="async" />}</div>
}

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const fresh = useInboxCount()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const header = useRef<HTMLElement>(null)
  const [hoverCards, setHoverCards] = useState(false)

  useViewTransitions()
  useCanonical()
  useEffect(() => trackPage(`${location.pathname}${location.search}`), [location.pathname, location.search])

  const toggleMenu = (open: boolean) => {
    if (open === menuOpen) return
    setMenuOpen(open)
    setMenuClosing(!open)
  }

  useScrollRestore()
  useEffect(() => setMenuOpen(false), [location.pathname])

  useEffect(() => {
    document.documentElement.classList.toggle('scroll-lock', menuOpen)
    if (!menuOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && toggleMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const publicProfile = !!(user?.prefs as { publicProfile?: boolean } | undefined)?.publicProfile
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    idle(() => {
      void import('../data/achievements').then((m) => m.watchAchievements())
      setHoverCards(matchMedia('(hover: hover) and (pointer: fine)').matches)
      void import('./tilt').then((m) => m.startTilt())
    })
  }, [])
  useEffect(() => {
    if (publicProfile) void import('../data/profile').then((m) => m.autoPublish())
  }, [publicProfile])
  useEffect(() => {
    try {
      if (localStorage.getItem('anime.shiki.v1')?.startsWith('{')) void import('../data/shikiSync').then((m) => m.autoSync())
    } catch {
      // без хранилища связи нет
    }
  }, [])

  useEffect(() => {
    applyAppearance()
    let last = window.scrollY
    let hidden = false
    const onScroll = () => {
      const y = window.scrollY
      header.current?.classList.toggle('site-header--scrolled', y > 8)
      if (Math.abs(y - last) < 8) return
      const hide = y > last && y > 240
      last = y
      if (hide === hidden) return
      hidden = hide
      header.current?.classList.toggle('site-header--hidden', hide)
      document.documentElement.classList.toggle('scroll-down', hide)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      <NavLink to="/library" className={fresh ? 'has-fresh' : undefined} aria-label={fresh ? `Библиотека: новые серии ${fresh}` : undefined}>
        Моя библиотека
      </NavLink>
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/together">Вместе</NavLink>
      <NavLink to="/manga">Манга</NavLink>
      <NavLink to="/hentai">Хентай</NavLink>
      <NavLink to="/hentai-manga">Хентай Манга</NavLink>
      <NavMoreDropdown />
    </>
  )

  return (
    <>
      <Ambient />
      <header ref={header} className="site-header">
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

      <div className="page" key={pageScope(location.pathname)}>
        <PageErrorBoundary>
          <Suspense fallback={<main className="container page-fallback" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </div>

      <Suspense fallback={null}>
        <InstallBanner />
        {hoverCards && <HoverCards />}
      </Suspense>
      <Toasts />
      <NetworkStatus />
      {!/^\/(watch|together)\//.test(location.pathname) && (
        <Suspense fallback={null}>
          <BackToTop />
        </Suspense>
      )}
      <BottomNav />
      <FooterLinks />
    </>
  )
}

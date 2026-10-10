import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { CloseIcon, MenuIcon, UserIcon } from './Icons'
import { useInboxCount } from '../data/inbox'
import SearchBox from './SearchBox'
import BottomNav from './BottomNav'
import Toasts from './Toasts'
import PageErrorBoundary from './PageErrorBoundary'
import { useAuth } from '../data/auth'
import { applyAppearance } from '../data/theme'
import { useViewTransitions } from './morph'
import { useScrollRestore } from './scrollRestore'
import { useCanonical } from '../data/pageMeta'
import { trackPage } from '../data/analytics'
import { useAmbientSrc } from './ambient'

// Баннер установки нужен не всем и не сразу: отдельная маленькая часть.
const InstallBanner = lazy(() => import('./InstallBanner'))
// Ссылки на документы, жанры и годы в подвале тоже не нужны для первого экрана.
const FooterLinks = lazy(() => import('./FooterLinks'))
// Кнопка «Наверх» нужна только на длинных страницах и после прокрутки.
const BackToTop = lazy(() => import('./BackToTop'))
// Карточки при наведении на постер нужны только мыши: грузим, когда браузер свободен.
const HoverCards = lazy(() => import('./HoverCards'))

export function Logo() {
  return (
    // Пробел настоящий, а не отступ: так видимый текст входит в название ссылки для экранного диктора.
    <Link to="/" className="logo" aria-label="Anime Life, на главную">
      Anime <span>Life</span>
    </Link>
  )
}

/** Свет постера под всей страницей (см. ambient.ts). Новый постер проявляется поверх старого. */
function Ambient() {
  const src = useAmbientSrc()
  return <div className="ambient" aria-hidden="true">{src && <img key={src} src={src} alt="" decoding="async" />}</div>
}

/** «Смотрю» в меню шапки: красная точка, если у тайтлов из «Смотрю» вышли новые серии. */
function WatchingLink() {
  const fresh = useInboxCount()
  return (
    <NavLink to="/watching" className={fresh ? 'has-fresh' : undefined} aria-label={fresh ? `Смотрю: новых серий ${fresh}` : undefined}>
      Смотрю
    </NavLink>
  )
}

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  // Меню закрывается с анимацией: пока она идёт, оно ещё на экране.
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

  // При переходе на другую страницу: закрыть мобильное меню. Прокрутку (наверх или, по «назад»,
  // туда, где зритель был) ведёт useScrollRestore.
  useScrollRestore()
  useEffect(() => setMenuOpen(false), [location.pathname])

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
    // Список связан с Shikimori: изменения уходят туда сами.
    try {
      if (localStorage.getItem('anime.shiki.v1')?.startsWith('{')) void import('../data/shikiSync').then((m) => m.autoSync())
    } catch {
      // без хранилища связи нет
    }
  }, [])

  // Оформление из настроек (тема, акцент) и шапка, которая становится полупрозрачной при прокрутке.
  // Как на AniLife, при прокрутке вниз шапка и нижнее меню уезжают и возвращаются, стоит прокрутить чуть вверх.
  // Классы ставим прямо на элементы, без состояния React: иначе каждая смена направления прокрутки
  // перерисовывала бы шапку, меню и подвал посреди жеста, и на слабых телефонах прокрутка дёргалась.
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
      <WatchingLink />
      <NavLink to="/schedule">Расписание</NavLink>
      <NavLink to="/together">Вместе</NavLink>
      <NavLink to="/community">Сообщество</NavLink>
      <NavLink to="/my-list">Мой список</NavLink>
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
        {hoverCards && <HoverCards />}
      </Suspense>
      <Toasts />
      {/* В плеере и комнатах своя прокрутка и свои кнопки в углу. */}
      {!/^\/(watch|together)\//.test(location.pathname) && (
        <Suspense fallback={null}>
          <BackToTop />
        </Suspense>
      )}
      <BottomNav />

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <Logo />
          <Suspense fallback={null}>
            <FooterLinks />
          </Suspense>
        </div>
      </footer>
    </>
  )
}

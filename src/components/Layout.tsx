import { Outlet, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useInboxCount } from '../data/inbox'
import BottomNav from './BottomNav'
import Navbar, { Logo } from './Navbar'
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
import { applyCouch } from '../data/couchMode'

export { Logo }

const InstallBanner = lazy(() => import('./InstallBanner'))
const FooterLinks = lazy(() => import('./FooterLinks'))
const BackToTop = lazy(() => import('./BackToTop'))
const HoverCards = lazy(() => import('./HoverCards'))
const BurnoutNotice = lazy(() => import('./BurnoutNotice'))

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
    applyCouch()
  }, [])

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
      const hide = y > last && y > 80
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
      const desktop = (header.current ?? document).querySelector<HTMLInputElement>('.search:not(.search--mobile) input')
      if (desktop && (desktop.offsetWidth > 0 || desktop.offsetParent !== null)) return desktop.focus()
      toggleMenu(true)
      setTimeout(() => (header.current ?? document).querySelector<HTMLInputElement>('.search--mobile input')?.focus(), 50)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Ambient />
      <Navbar
        ref={header}
        user={user}
        fresh={fresh}
        menuOpen={menuOpen}
        menuClosing={menuClosing}
        onToggleMenu={toggleMenu}
        onMenuClosingEnd={() => setMenuClosing(false)}
      />
      {(menuOpen || menuClosing) && (
        <div className={`menu-backdrop${menuOpen ? '' : ' menu-backdrop--closing'}`} onClick={() => toggleMenu(false)} />
      )}

      <div className="page" key={pageScope(location.pathname)}>
        <PageErrorBoundary>
          <Suspense
            fallback={
              <main className="container page-fallback" aria-busy="true" aria-label="Загрузка страницы">
                <div className="stack" style={{ paddingTop: 24, gap: 14 }}>
                  <div
                    className="skeleton"
                    style={{ width: 112, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 22%, var(--surface-2))' }}
                  />
                  <div className="skeleton skeleton--line" style={{ width: 200, height: 28, borderRadius: 8 }} />
                  <div className="skeleton skeleton--line" style={{ width: '42%', maxWidth: 280, height: 12, borderRadius: 6 }} />
                  <div
                    className="grid grid--posters"
                    style={{ marginTop: 8 }}
                    aria-hidden="true"
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <div
                        key={i}
                        className="skeleton"
                        style={{ aspectRatio: '2 / 3', borderRadius: 'var(--radius-md)' }}
                      />
                    ))}
                  </div>
                </div>
              </main>
            }
          >
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </div>

      <Suspense fallback={null}>
        <BurnoutNotice />
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

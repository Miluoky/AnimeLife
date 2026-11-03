import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CompassIcon, HomeIcon, ListIcon, MoreIcon, ScreenPlayIcon } from './Icons'
import { useInboxCount } from '../data/inbox'
import { listStore } from '../data/myList'

const MoreSheet = lazy(() => import('./MoreSheet'))

const IN_MORE = /^\/(schedule|together|account|top|random|collections|quiz|duel|chat|ongoing|changelog|u\/|community|club\/|c\/|recap|scene|news|manga|chronology|trope|voice|hentai|hentai-manga)/

function useInboxCheck() {
  useEffect(() => {
    const check = () => {
      if (document.hidden || !listStore.get().some((e) => e.status === 'watching')) return
      void import('../data/inboxCheck').then((m) => m.checkInbox()).catch(() => undefined)
    }
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 3000))
    idle(check)
    const timer = setInterval(check, 20 * 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const fresh = useInboxCount()
  const [more, setMore] = useState(false)
  useInboxCheck()
  useEffect(() => setMore(false), [pathname])

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> }
    nav.setAppBadge?.(fresh).catch(() => {})
  }, [fresh])

  const items = [
    { to: '/', title: 'Главная', icon: <HomeIcon />, end: true },
    { to: '/catalog', title: 'Каталог', icon: <CompassIcon /> },
    { to: '/library', title: 'Библиотека', icon: <ListIcon />, main: true },
    { to: '/together', title: 'Вместе', icon: <ScreenPlayIcon /> },
  ]

  let active = more ? 4 : items.findIndex((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
  if (active < 0 && IN_MORE.test(pathname)) active = 4

  return (
    <>
      <nav className="dock" aria-label="Нижнее меню" style={{ '--i': active } as CSSProperties}>
        {active >= 0 && <span className="dock__glider" aria-hidden="true" />}
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={`dock__item${i.main ? ' dock__item--main' : ''}`}
            aria-label={i.main && fresh ? `${i.title}: новые серии ${fresh}` : i.title}
          >
            <span className="dock__icon">
              {i.icon}
              {i.main && fresh > 0 && (
                <span className="dock__badge" key={fresh} aria-hidden="true">
                  {fresh > 9 ? '9+' : fresh}
                </span>
              )}
            </span>
            <span>{i.title}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`dock__item dock__item--more${more || (active === 4 && !items.some((i) => pathname === i.to)) ? ' is-active' : ''}`}
          aria-label="Ещё разделы"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <span className="dock__icon">
            <MoreIcon />
          </span>
          <span>Ещё</span>
        </button>
      </nav>
      {more && (
        <Suspense fallback={null}>
          <MoreSheet onClose={() => setMore(false)} />
        </Suspense>
      )}
    </>
  )
}

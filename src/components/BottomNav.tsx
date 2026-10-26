import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CompassIcon, HomeIcon, ListIcon, MoreIcon, ScreenPlayIcon } from './Icons'
import { useInboxCount } from '../data/inbox'
import { listStore } from '../data/myList'

// Шторка «Ещё» с остальными разделами нужна по нажатию: отдельная маленькая часть.
const MoreSheet = lazy(() => import('./MoreSheet'))

/** Разделы, которые живут в шторке «Ещё»: на них подсвечивается пункт «Ещё». */
const IN_MORE = /^\/(schedule|together|account|top|random|collections|quiz|chat|ongoing|changelog|u\/|community|club\/|c\/|recap|scene|news|manga)/

/** Раз в 20 минут (и когда вкладку снова открыли) проверяем новые серии тайтлов из «Смотрю». */
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

/**
 * Нижнее меню на телефоне: пять пунктов под большим пальцем, «Смотрю» в центре со счётчиком
 * вышедших серий, остальные разделы в шторке «Ещё». На компьютере скрыто стилями.
 */
export default function BottomNav() {
  const { pathname } = useLocation()
  const fresh = useInboxCount()
  const [more, setMore] = useState(false)
  useInboxCheck()
  useEffect(() => setMore(false), [pathname])
  // Установленное приложение: число тайтлов с новыми сериями — на значке на рабочем столе (Android, Windows, macOS).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> }
    nav.setAppBadge?.(fresh).catch(() => {})
  }, [fresh])

  const items = [
    { to: '/', title: 'Главная', icon: <HomeIcon />, end: true },
    { to: '/catalog', title: 'Каталог', icon: <CompassIcon /> },
    { to: '/watching', title: 'Смотрю', icon: <ScreenPlayIcon />, main: true },
    { to: '/my-list', title: 'Список', label: 'Мой список', icon: <ListIcon /> },
  ]
  // Уголки активного раздела переезжают от пункта к пункту (--i — номер пункта, 4 — «Ещё»).
  let active = more ? 4 : items.findIndex((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
  if (active < 0 && IN_MORE.test(pathname)) active = 4

  return (
    <>
      <nav className="dock" aria-label="Разделы сайта" style={{ '--i': active } as CSSProperties}>
        {active >= 0 && <span className="dock__glider" aria-hidden="true" />}
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={`dock__item${i.main ? ' dock__item--main' : ''}`}
            aria-label={i.main && fresh ? `${i.title}: новых серий ${fresh}` : i.label}
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
          className={`dock__item${!more && active === 4 ? ' active' : ''}`}
          aria-expanded={more}
          aria-controls="more-sheet"
          onClick={() => setMore(!more)}
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

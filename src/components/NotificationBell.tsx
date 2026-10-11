import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadNotifications, markNotificationsRead, notificationText, type SiteNotification } from '../data/notifications'
import { useInboxCount } from '../data/inbox'
import './notification-bell.css'

/** Как часто спрашивать сервер, пока вкладка открыта. */
const REFRESH = 5 * 60_000

const when = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })
function ago(t: number) {
  const min = Math.round((t - Date.now()) / 60_000)
  if (min > -60) return when.format(min, 'minute')
  const h = Math.round(min / 60)
  if (h > -24) return when.format(h, 'hour')
  return when.format(Math.round(h / 24), 'day')
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

/**
 * Колокольчик в шапке: ответы на комментарии, лайки отзывов и подборок, новые подписчики,
 * а первой строкой — новые серии из «Смотрю». Открыли список — всё отмечается прочитанным.
 */
export default function NotificationBell() {
  const [items, setItems] = useState<SiteNotification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const fresh = useInboxCount()
  const box = useRef<HTMLDivElement>(null)

  const refresh = () =>
    loadNotifications()
      .then((r) => {
        setItems(r.items)
        setUnread(r.unread)
      })
      .catch(() => setItems((list) => list ?? []))

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread) {
      setUnread(0)
      void markNotificationsRead().catch(() => undefined)
    }
  }
  const count = unread + (fresh ? 1 : 0)

  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="icon-btn bell__btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Уведомления: новых ${unread}` : 'Уведомления'}
        title="Уведомления"
        onClick={toggle}
      >
        <BellIcon />
        {count > 0 && (
          <span className="bell__badge" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="bell__panel" role="dialog" aria-label="Уведомления">
          <p className="bell__title">Уведомления</p>
          {fresh > 0 && (
            <Link to="/watching" className="bell__item bell__item--new" onClick={() => setOpen(false)}>
              <span>Вышли новые серии в «Смотрю»: {fresh}</span>
            </Link>
          )}
          {items === null ? (
            <div className="skeleton skeleton--line" style={{ height: 48 }} aria-busy="true" />
          ) : items.length === 0 && !fresh ? (
            <p className="muted bell__empty">Пока тихо. Здесь появятся ответы на ваши комментарии, лайки и новые подписчики.</p>
          ) : (
            <ul className="bell__list">
              {items.map((n) => (
                <li key={n.$id}>
                  <Link to={n.link} className={`bell__item${n.read ? '' : ' bell__item--new'}`} onClick={() => setOpen(false)}>
                    <span>{notificationText(n)}</span>
                    {n.kind === 'reply' && n.text && <span className="bell__quote">{n.text}</span>}
                    <span className="muted bell__when">{ago(n.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

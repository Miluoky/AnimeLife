import type { CSSProperties } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CalendarIcon, CompassIcon, HomeIcon, ListIcon, PeopleIcon, UserIcon } from './Icons'
import { useAuth } from '../data/auth'

/** Нижнее меню на телефоне: шесть главных разделов под большим пальцем. На компьютере скрыто стилями. */
export default function BottomNav() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const items: { to: string; title: string; short?: string; icon: JSX.Element; end?: boolean }[] = [
    { to: '/', title: 'Главная', icon: <HomeIcon />, end: true },
    { to: '/catalog', title: 'Каталог', icon: <CompassIcon /> },
    { to: '/schedule', title: 'График', icon: <CalendarIcon /> },
    { to: '/together', title: 'Вместе', icon: <PeopleIcon /> },
    // На узком телефоне «Мой список» не влезает в шестую часть экрана: подпись короче, полное имя — для экранных чтецов.
    { to: '/my-list', title: 'Мой список', short: 'Список', icon: <ListIcon /> },
    { to: '/account', title: user ? 'Профиль' : 'Войти', icon: <UserIcon size={22} /> },
  ]
  // Подложка активного раздела переезжает от пункта к пункту (--i — номер пункта).
  const active = items.findIndex((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
  return (
    <nav className="bottom-nav" aria-label="Разделы сайта" style={{ '--i': active } as CSSProperties}>
      {active >= 0 && <span className="bottom-nav__glider" aria-hidden="true" />}
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="bottom-nav__item" aria-label={i.short && i.title}>
          {i.icon}
          <span>{i.short ?? i.title}</span>
        </NavLink>
      ))}
    </nav>
  )
}

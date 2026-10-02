import { NavLink } from 'react-router-dom'
import { CalendarIcon, CompassIcon, HomeIcon, ListIcon, PeopleIcon, UserIcon } from './Icons'
import { useAuth } from '../data/auth'

/** Нижнее меню на телефоне: шесть главных разделов под большим пальцем. На компьютере скрыто стилями. */
export default function BottomNav() {
  const { user } = useAuth()
  const items = [
    { to: '/', title: 'Главная', icon: <HomeIcon />, end: true },
    { to: '/catalog', title: 'Каталог', icon: <CompassIcon /> },
    { to: '/schedule', title: 'График', icon: <CalendarIcon /> },
    { to: '/together', title: 'Вместе', icon: <PeopleIcon /> },
    { to: '/my-list', title: 'Мой список', icon: <ListIcon /> },
    { to: '/account', title: user ? 'Профиль' : 'Войти', icon: <UserIcon size={22} /> },
  ]
  return (
    <nav className="bottom-nav" aria-label="Разделы сайта">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="bottom-nav__item">
          {i.icon}
          <span>{i.title}</span>
        </NavLink>
      ))}
    </nav>
  )
}

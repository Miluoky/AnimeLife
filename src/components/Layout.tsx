import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { SearchIcon, UserIcon } from './Icons'

export function Logo() {
  return (
    <Link to="/" className="logo">
      аниме<span>.</span>
    </Link>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function onSearch(e: FormEvent) {
    e.preventDefault()
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Logo />
          <nav className="site-nav" aria-label="Основное меню">
            <NavLink to="/" end>
              Каталог
            </NavLink>
            <NavLink to="/ongoing">Онгоинги</NavLink>
            <NavLink to="/schedule">Расписание</NavLink>
            <NavLink to="/my-list">Мой список</NavLink>
          </nav>
          <div style={{ flexGrow: 1 }} />
          <form className="search" role="search" onSubmit={onSearch}>
            <SearchIcon />
            <label htmlFor="q" className="sr-only">
              Поиск аниме
            </label>
            <input
              id="q"
              type="search"
              placeholder="Найти аниме"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <button type="button" className="icon-btn" aria-label="Профиль">
            <UserIcon />
          </button>
        </div>
      </header>

      <Outlet />

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

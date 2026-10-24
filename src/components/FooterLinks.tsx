import { Link } from 'react-router-dom'
import { ABOUT_LINKS, DISCLAIMER, GENRES, KINDS, LEGAL_LINKS } from '../data/seo'

/**
 * Подвал: о проекте, приложение, документы (правообладателям, контакты, политика, соглашение), ссылки на жанры, типы и годы —
 * с любой страницы видно, что ещё есть на сайте. Отдельная часть, грузится следом.
 */
export default function FooterLinks() {
  const year = new Date().getFullYear()
  return (
    <>
      <nav className="footer-legal" aria-label="Документы">
        {[...ABOUT_LINKS, ...LEGAL_LINKS].map(([name, to]) => (
          <Link key={to} to={to}>
            {name}
          </Link>
        ))}
      </nav>
      <nav className="footer-links" aria-label="Подборки">
        <Link to="/top">Топ-100 аниме</Link>
        <Link to="/collections">Подборки</Link>
        <Link to="/random">Случайное аниме</Link>
        <Link to="/quiz">Угадай аниме по кадру</Link>
        <Link to="/scene">Найти аниме по скриншоту</Link>
        <Link to="/news">Новости аниме</Link>
        <Link to="/season">Аниме сезона</Link>
        <Link to="/community">Сообщество и клубы</Link>
        <Link to="/recap">Итоги года</Link>
        <Link to="/changelog">Что нового</Link>
        <Link to="/en" hrefLang="en" lang="en">
          English
        </Link>
        {GENRES.slice(0, 12).map((g) => (
          <Link key={g.slug} to={`/genre/${g.slug}`}>
            {g.name}
          </Link>
        ))}
        {Object.entries(KINDS).map(([id, h1]) => (
          <Link key={id} to={`/type/${id}`}>
            {h1}
          </Link>
        ))}
        {[year, year - 1].map((y) => (
          <Link key={y} to={`/year/${y}`}>
            Аниме {y} года
          </Link>
        ))}
      </nav>
      <p className="footer-note">{DISCLAIMER}</p>
    </>
  )
}

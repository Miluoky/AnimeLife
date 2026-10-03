import { Link } from 'react-router-dom'
import { DISCLAIMER, GENRES, KINDS, LEGAL_LINKS } from '../data/seo'

/**
 * Подвал: документы (правообладателям, контакты, политика, соглашение), ссылки на жанры, типы и годы —
 * с любой страницы видно, что ещё есть на сайте. Отдельная часть, грузится следом.
 */
export default function FooterLinks() {
  const year = new Date().getFullYear()
  return (
    <>
      <nav className="footer-legal" aria-label="Документы">
        {LEGAL_LINKS.map(([name, to]) => (
          <Link key={to} to={to}>
            {name}
          </Link>
        ))}
      </nav>
      <nav className="footer-links" aria-label="Подборки">
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

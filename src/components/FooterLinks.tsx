import { Link } from 'react-router-dom'
import { GENRES, KINDS } from '../data/seo'

/** Ссылки на жанры, типы и годы в подвале: с любой страницы видно, что ещё есть на сайте. Отдельная часть, грузится следом. */
export default function FooterLinks() {
  const year = new Date().getFullYear()
  return (
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
  )
}

import { Link } from 'react-router-dom'
import { MAX_PAGES } from '../data/seo'

interface Props {
  page: number
  /** первая загруженная страница была полной: дальше есть ещё */
  hasNext: boolean
  href: (page: number) => string
}

/**
 * Ссылки на соседние страницы списка (?page=N). Прокрутка и так подгружает следующие тайтлы,
 * а по этим ссылкам поисковик обходит список целиком. Worker рисует такие же (pager в worker/index.js).
 */
export default function Pager({ page, hasNext, href }: Props) {
  const next = hasNext && page < MAX_PAGES
  if (page === 1 && !next) return null
  const numbers: number[] = []
  for (let n = Math.max(1, page - 2); n <= Math.min(MAX_PAGES, page + (next ? 2 : 0)); n++) numbers.push(n)
  return (
    <nav className="chips pager" aria-label="Страницы">
      {page > 1 && (
        <Link className="pill pill--link" to={href(page - 1)} rel="prev">
          ← Назад
        </Link>
      )}
      {numbers.map((n) =>
        n === page ? (
          <span key={n} className="pill active" aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} className="pill" to={href(n)}>
            {n}
          </Link>
        ),
      )}
      {next && (
        <Link className="pill pill--link" to={href(page + 1)} rel="next">
          Дальше →
        </Link>
      )}
    </nav>
  )
}

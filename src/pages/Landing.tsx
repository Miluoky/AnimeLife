import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import CatalogGrid from '../components/CatalogGrid'
import CatalogSection from '../components/CatalogSection'
import Pager from '../components/Pager'
import { usePageMeta } from '../data/pageMeta'
import { landingFor } from '../data/landings'
import { PAGE_SIZE, pageParam } from '../data/seo'
import NotFound from './NotFound'

/**
 * Посадочная страница: жанр, год, сезон, тип или онгоинги. Заголовок, вводный текст и ссылки те же,
 * что Worker отдаёт поисковикам без JavaScript (общие тексты в src/data/seo.ts).
 */
export default function Landing() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const path = pathname.replace(/\/+$/, '')
  const landing = landingFor(path)
  const page = landing?.paged ? pageParam(params.get('page')) : 1
  // Сколько пришло на первой странице: [страница, число тайтлов]. Полная — значит, есть следующая.
  const [first, setFirst] = useState<[number, number]>()
  const suffix = page > 1 ? `, страница ${page}` : ''
  usePageMeta(landing && `${landing.title}${suffix}`, landing?.description)

  // Переход по ссылке на другую страницу списка начинается сверху.
  useEffect(() => window.scrollTo(0, 0), [page])

  if (!landing) return <NotFound />

  return (
    <main className="container home">
      <section className="stack">
        <nav className="crumbs muted" aria-label="Хлебные крошки">
          <Link to="/">Главная</Link>
          {landing.crumbs.map(([name, to]) => (
            <Fragment key={to}>
              {' › '}
              <Link to={to}>{name}</Link>
            </Fragment>
          ))}
        </nav>
        <h1 className="page-title">
          {landing.h1}
          {suffix}
        </h1>
        {page === 1 && <p className="soft landing-intro">{landing.intro}</p>}
        {landing.paged && (
          <>
            <CatalogGrid key={`${path}?${page}`} query={landing.query} start={page} onFirst={(n) => setFirst([page, n])} />
            {first?.[0] === page && (
              <Pager page={page} hasNext={first[1] === PAGE_SIZE} href={(n) => (n > 1 ? `${path}?page=${n}` : path)} />
            )}
          </>
        )}
      </section>
      {!landing.paged && <CatalogSection title="Выходят сейчас" status="ongoing" moreLink="/catalog?status=ongoing" />}
      <section className="stack">
        <h2>Смотрите также</h2>
        <div className="chips">
          {landing.related.map(([name, to]) => (
            <Link key={to} to={to} className="pill pill--link">
              {name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

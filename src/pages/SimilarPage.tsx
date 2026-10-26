import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchAnime, fetchSimilar } from '../api/shikimori'
import PosterCard from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import { SIMILAR_LIMIT, SIMILAR_MIN, animeHref, animeIdFromParam, similarPageDescription, similarPageTitle } from '../data/seo'
import NotFound from './NotFound'

/**
 * «Аниме, похожие на …»: все похожие тайтлы Shikimori сеткой. Тот же текст, что Worker отдаёт поисковикам
 * (similarPage в worker/index.js). Ссылка сюда — «Все» у полки «Похожее» на странице тайтла.
 */
export default function SimilarPage() {
  const { id: param = '' } = useParams()
  const { pathname } = useLocation()
  const id = animeIdFromParam(param)
  const [attempt, setAttempt] = useState(0)
  // null — тайтла нет (404), 'error' — Shikimori не ответил.
  const state = useAsync(
    () =>
      Promise.all([fetchAnime(id), fetchSimilar(id, SIMILAR_LIMIT)])
        .then(([anime, similar]) => ({ id, anime, similar }))
        .catch((e: Error) => (/ 404:/.test(e.message) ? null : ('error' as const))),
    [id, attempt],
  )
  const data = state.value && state.value !== 'error' && state.value.id === id ? state.value : undefined
  const title = data?.anime.title
  usePageMeta(
    title && similarPageTitle(title),
    title && similarPageDescription(title, data.similar.map((a) => a.title)),
  )

  useEffect(() => window.scrollTo(0, 0), [id])

  if ((state.value === null || (data && data.similar.length < SIMILAR_MIN)) && !state.loading) return <NotFound />
  if (state.value === 'error' && !state.loading)
    return (
      <main className="container empty-page">
        <h1>Не удалось загрузить похожие аниме</h1>
        <p className="muted">Shikimori сейчас не отвечает. Попробуйте ещё раз через минуту.</p>
        <button type="button" className="btn btn--accent" onClick={() => setAttempt(attempt + 1)}>
          Повторить
        </button>
      </main>
    )
  if (!data) return <main className="container empty-page" aria-busy="true" />

  const { anime, similar } = data
  // Адрес с латинским названием, как у Worker: /similar/52991 → /similar/52991-sousou-no-frieren.
  const href = animeHref(anime)
  const canonical = href.replace(/^\/anime\//, '/similar/')
  if (/^\d+$/.test(anime.id) && pathname.replace(/\/+$/, '') !== canonical) return <Navigate replace to={canonical} />
  const about = [anime.kind, anime.year, anime.genres.slice(0, 3).join(', ').toLowerCase()].filter(Boolean).join(', ')

  return (
    <main className="container home">
      <section className="stack">
        <nav className="crumbs muted" aria-label="Хлебные крошки">
          <Link to="/">Главная</Link>
          {' › '}
          <Link to={href}>{anime.title}</Link>
          {' › '}
          <span>Похожие аниме</span>
        </nav>
        <h1 className="page-title">Аниме, похожие на «{anime.title}»</h1>
        <p className="soft landing-intro">
          Понравилось «{anime.title}»{about ? ` (${about})` : ''}? Эти аниме зрители Shikimori чаще всего называют похожими:
          близкие по жанру, настроению и сюжету. Сначала самые похожие.
        </p>
        <div className="grid grid--posters">
          {similar.map((a, i) => (
            <PosterCard key={a.id} anime={a} priority={i < 6} />
          ))}
        </div>
        <p>
          <Link to={href}>
            ← Вернуться к «{anime.title}»
          </Link>
        </p>
      </section>
    </main>
  )
}

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchManga, type MangaPage as Manga } from '../api/manga'
import PosterCard from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import NotFound from './NotFound'
import './character.css'
import './manga.css'

/** Описание короче этого показываем целиком, длиннее — сворачиваем до «Показать полностью». */
const SHORT = 700

function Description({ parts }: { parts: Manga['description'] }) {
  const [open, setOpen] = useState(false)
  const length = parts.reduce((n, p) => n + p.text.length, 0)
  const folded = !open && length > SHORT
  return (
    <section className="stack">
      <h2>О чём</h2>
      <div className={`character__text${folded ? ' character__text--folded' : ''}`}>
        {parts.map((p, i) =>
          p.kind === 'heading' ? (
            <h3 key={i}>{p.text}</h3>
          ) : p.kind === 'spoiler' ? (
            <details key={i} className="character__spoiler">
              <summary>Спойлер</summary>
              <p>{p.text}</p>
            </details>
          ) : (
            <p key={i}>{p.text}</p>
          ),
        )}
      </div>
      {length > SHORT && (
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </section>
  )
}

/** Страница манги или ранобэ: описание, тома и главы, экранизации и другие части, официальные сайты. */
export default function MangaPage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState(0)
  // null — такой манги нет (404), 'error' — Shikimori не ответил: тогда предлагаем повторить, а не «не найдено».
  const state = useAsync(
    () => fetchManga(id).catch((e: Error) => (/ 404:/.test(e.message) ? null : ('error' as const))),
    [id, attempt],
  )
  const m = state.value && state.value !== 'error' && state.value.id === id ? state.value : undefined
  usePageMeta(
    m ? `${m.title}: ${m.kind.toLowerCase()}` : 'Манга',
    m ? `${m.title}${m.originalTitle ? ` (${m.originalTitle})` : ''}: описание, тома и главы, аниме-экранизации.` : '',
  )

  if (state.value === null && !state.loading) return <NotFound />
  if (state.value === 'error' && !state.loading)
    return (
      <main className="container empty-page">
        <h1>Не удалось загрузить мангу</h1>
        <p className="muted">Shikimori сейчас не отвечает. Попробуйте ещё раз через минуту.</p>
        <button type="button" className="btn btn--accent" onClick={() => setAttempt(attempt + 1)}>
          Повторить
        </button>
      </main>
    )
  if (!m) return <main className="container empty-page" aria-busy="true" />

  const facts = [
    m.kind,
    m.year,
    m.status,
    m.volumes && `${m.volumes} т.`,
    m.chapters && `${m.chapters} гл.`,
    m.score && `★ ${m.score.toFixed(1)}`,
  ].filter(Boolean)
  // Сначала экранизации: ради них сюда и приходят со страницы аниме.
  const animes = m.related.filter((r) => !r.href)
  const mangas = m.related.filter((r) => r.href)

  return (
    <main className="container character">
      <section className="character__head">
        <div className="character__photo">{m.image && <img src={m.image} alt={m.title} width={225} height={350} />}</div>
        <div className="stack character__names">
          <h1 className="page-title">{m.title}</h1>
          {m.originalTitle && <div className="muted">{m.originalTitle}</div>}
          {m.japanese && <div className="muted">{m.japanese}</div>}
          <ul className="manga__facts">
            {facts.map((f) => (
              <li key={String(f)}>{f}</li>
            ))}
          </ul>
          {m.genres.length > 0 && <div className="muted">{m.genres.join(', ')}</div>}
          {m.publishers.length > 0 && <div className="muted">Издатель: {m.publishers.join(', ')}</div>}
        </div>
      </section>

      {m.description.length > 0 && <Description parts={m.description} />}

      {m.links.length > 0 && (
        <section className="stack">
          <h2>Читать официально</h2>
          <div className="manga__links">
            {m.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn">
                {l.title}
              </a>
            ))}
          </div>
        </section>
      )}

      {animes.length > 0 && (
        <section className="stack">
          <h2>Аниме</h2>
          <div className="grid grid--posters">
            {animes.map((r) => (
              <PosterCard key={r.anime.id} anime={r.anime} tag={{ text: r.relation }} />
            ))}
          </div>
        </section>
      )}

      {mangas.length > 0 && (
        <section className="stack">
          <h2>Другие части</h2>
          <div className="grid grid--posters">
            {mangas.map((r) => (
              <PosterCard key={r.anime.id} anime={r.anime} href={r.href} tag={{ text: r.relation }} />
            ))}
          </div>
        </section>
      )}

      <p className="muted">
        Данные:{' '}
        <a href={`https://shikimori.io/mangas/${m.id}`} target="_blank" rel="noopener noreferrer">
          Shikimori
        </a>
      </p>
    </main>
  )
}

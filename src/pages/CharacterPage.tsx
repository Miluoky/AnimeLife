import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchCharacter, type CharacterPage as Character } from '../api/character'
import PosterCard from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import NotFound from './NotFound'
import './character.css'

/** Описание короче этого показываем целиком, длиннее — сворачиваем до «Показать полностью». */
const SHORT = 700

function Description({ parts }: { parts: Character['description'] }) {
  const [open, setOpen] = useState(false)
  const length = parts.reduce((n, p) => n + p.text.length, 0)
  const folded = !open && length > SHORT
  return (
    <section className="stack character__about">
      <h2>О персонаже</h2>
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

/** Страница персонажа: имя, описание со скрытыми спойлерами, сэйю и аниме с его участием. */
export default function CharacterPage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState(0)
  // null — такого персонажа нет (404), 'error' — Shikimori не ответил: тогда предлагаем повторить, а не «не найдено».
  const state = useAsync(
    () => fetchCharacter(id).catch((e: Error) => (/ 404:/.test(e.message) ? null : ('error' as const))),
    [id, attempt],
  )
  // Прежний персонаж, пока грузится новый, не показываем.
  const c = state.value && state.value !== 'error' && state.value.id === id ? state.value : undefined
  usePageMeta(
    c ? `${c.name}: персонаж аниме` : 'Персонаж',
    c ? `${c.name}${c.originalName ? ` (${c.originalName})` : ''}: описание, кто озвучивает и в каких аниме появляется.` : '',
  )

  if (state.value === null && !state.loading) return <NotFound />
  if (state.value === 'error' && !state.loading)
    return (
      <main className="container empty-page">
        <h1>Не удалось загрузить персонажа</h1>
        <p className="muted">Shikimori сейчас не отвечает. Попробуйте ещё раз через минуту.</p>
        <button type="button" className="btn btn--accent" onClick={() => setAttempt(attempt + 1)}>
          Повторить
        </button>
      </main>
    )
  if (!c) return <main className="container empty-page" aria-busy="true" />

  return (
    <main className="container character">
      <section className="character__head">
        <div className="character__photo">{c.image && <img src={c.image} alt={c.name} width={225} height={350} />}</div>
        <div className="stack character__names">
          <h1 className="page-title">{c.name}</h1>
          {c.originalName && <div className="muted">{c.originalName}</div>}
          {c.japanese && <div className="muted">{c.japanese}</div>}
          {c.altName && <div className="muted">Также: {c.altName}</div>}
        </div>
      </section>

      {c.description.length > 0 && <Description parts={c.description} />}

      {c.voices.length > 0 && (
        <section className="stack">
          <h2>Озвучивают</h2>
          <ul className="character__voices">
            {c.voices.map((v) => (
              <li key={v.id}>
                <Link to={`/person/${v.id}`} className="character__voice">
                  <span className="character__voice-img">{v.image && <img src={v.image} alt="" loading="lazy" />}</span>
                  <span>{v.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.animes.length > 0 && (
        <section className="stack">
          <h2>Аниме с персонажем</h2>
          <div className="grid grid--posters">
            {c.animes.map((a) => (
              <PosterCard key={a.id} anime={a} tag={{ text: a.main ? 'Главная роль' : 'Второстепенная', accent: a.main }} />
            ))}
          </div>
        </section>
      )}

      <p className="muted">
        Данные:{' '}
        <a href={`https://shikimori.io/characters/${c.id}`} target="_blank" rel="noopener noreferrer">
          Shikimori
        </a>
      </p>
    </main>
  )
}

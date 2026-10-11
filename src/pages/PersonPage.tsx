import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchPerson, type PersonRole } from '../api/person'
import PosterCard from '../components/PosterCard'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import NotFound from './NotFound'
import './character.css'
import './person.css'

const ROLES_SHOWN = 24
const WORKS_SHOWN = 18

const plural = (n: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('ru').select(n)
  return form === 'one' ? one : form === 'few' ? few : many
}

type RoleSort = 'score' | 'new' | 'mine'

function sortRoles(roles: PersonRole[], sort: RoleSort, mine: Set<string>) {
  const copy = [...roles]
  if (sort === 'score') copy.sort((a, b) => (b.anime.score ?? 0) - (a.anime.score ?? 0))
  if (sort === 'new') copy.sort((a, b) => (b.anime.year ?? 0) - (a.anime.year ?? 0))
  if (sort === 'mine') copy.sort((a, b) => Number(mine.has(b.anime.id)) - Number(mine.has(a.anime.id)) || (b.anime.score ?? 0) - (a.anime.score ?? 0))
  return copy
}

/**
 * Страница сэйю или автора, как на AniList: кого озвучивал (персонаж + тайтл) и над чем работал.
 * Сэйю сразу видно в знакомых тайтлах: сортировка «Из моего списка» поднимает их наверх.
 */
export default function PersonPage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<RoleSort>('score')
  const [allRoles, setAllRoles] = useState(false)
  const [allWorks, setAllWorks] = useState(false)
  const list = useMyList()
  const mine = new Set(list.map((e) => e.anime.id))
  const state = useAsync(
    () => fetchPerson(id).catch((e: Error) => (/ 404:/.test(e.message) ? null : ('error' as const))),
    [id, attempt],
  )
  const p = state.value && state.value !== 'error' && state.value.id === id ? state.value : undefined
  usePageMeta(
    p ? `${p.name}${p.job ? `: ${p.job.toLowerCase()}` : ''}` : 'Сэйю и авторы',
    p ? `${p.name}${p.originalName ? ` (${p.originalName})` : ''}: роли в аниме, персонажи и работы.` : '',
  )

  if (state.value === null && !state.loading) return <NotFound />
  if (state.value === 'error' && !state.loading)
    return (
      <main className="container empty-page">
        <h1>Не удалось загрузить страницу</h1>
        <p className="muted">Shikimori сейчас не отвечает. Попробуйте ещё раз через минуту.</p>
        <button type="button" className="btn btn--accent" onClick={() => setAttempt(attempt + 1)}>
          Повторить
        </button>
      </main>
    )
  if (!p) return <main className="container empty-page" aria-busy="true" />

  const familiar = p.roles.filter((r) => mine.has(r.anime.id)).length
  const roles = sortRoles(p.roles, sort, mine)
  const shownRoles = allRoles ? roles : roles.slice(0, ROLES_SHOWN)
  const shownWorks = allWorks ? p.works : p.works.slice(0, WORKS_SHOWN)

  return (
    <main className="container character person">
      <section className="character__head">
        <div className="character__photo">{p.image && <img src={p.image} alt={p.name} width={225} height={350} />}</div>
        <div className="stack character__names">
          {p.job && <p className="person__job">{p.job}</p>}
          <h1 className="page-title">{p.name}</h1>
          {p.originalName && <div className="muted">{p.originalName}</div>}
          {p.japanese && <div className="muted">{p.japanese}</div>}
          {p.birthday && (
            <div className="muted">
              {p.deceased ? `${p.birthday} — ${p.deceased}` : `День рождения: ${p.birthday}`}
              {p.age ? ` · ${p.age} ${plural(p.age, 'год', 'года', 'лет')}` : ''}
            </div>
          )}
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="person__site">
              {p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          )}
          {p.jobs.length > 0 && (
            <ul className="person__jobs" aria-label="Чем занимались">
              {p.jobs.map(([job, n]) => (
                <li key={job}>
                  {job} <b>{n}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {p.roles.length > 0 && (
        <section className="stack">
          <div className="person__bar">
            <h2>
              Роли <span className="muted">{p.roles.length}</span>
            </h2>
            <div className="chips" role="group" aria-label="Порядок ролей">
              {(
                [
                  ['score', 'Лучшие тайтлы'],
                  ['new', 'Новые'],
                  ...(familiar ? [['mine', `Из моего списка · ${familiar}`]] : []),
                ] as [RoleSort, string][]
              ).map(([id, title]) => (
                <button key={id} type="button" className={`pill${sort === id ? ' active' : ''}`} aria-pressed={sort === id} onClick={() => setSort(id)}>
                  {title}
                </button>
              ))}
            </div>
          </div>
          <ul className="person__roles">
            {shownRoles.map((r) => (
              <li key={`${r.character.id}-${r.anime.id}`} className={`person-role${mine.has(r.anime.id) ? ' person-role--mine' : ''}`}>
                <Link to={`/character/${r.character.id}`} className="person-role__img" tabIndex={-1} aria-hidden="true">
                  {r.character.image && <img src={r.character.image} alt="" loading="lazy" width={72} height={112} />}
                </Link>
                <div className="person-role__text">
                  <Link to={`/character/${r.character.id}`} className="person-role__name">
                    {r.character.name}
                  </Link>
                  <Link to={`/anime/${r.anime.id}`} className="person-role__anime">
                    {r.anime.title}
                  </Link>
                  <span className="muted person-role__meta">
                    {[r.anime.year, r.more > 0 ? `ещё ${r.more} ${plural(r.more, 'тайтл', 'тайтла', 'тайтлов')}` : undefined].filter(Boolean).join(' · ')}
                    {mine.has(r.anime.id) && <span className="person-role__badge">в списке</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {roles.length > ROLES_SHOWN && (
            <button type="button" className="link-btn" onClick={() => setAllRoles(!allRoles)}>
              {allRoles ? 'Свернуть' : `Показать все ${roles.length}`}
            </button>
          )}
        </section>
      )}

      {p.works.length > 0 && (
        <section className="stack">
          <h2>
            Работы <span className="muted">{p.works.length}</span>
          </h2>
          <div className="grid grid--posters">
            {shownWorks.map((w) => (
              <PosterCard key={w.anime.id} anime={w.anime} tag={{ text: w.roles.slice(0, 2).join(', ') }} />
            ))}
          </div>
          {p.works.length > WORKS_SHOWN && (
            <button type="button" className="link-btn" onClick={() => setAllWorks(!allWorks)}>
              {allWorks ? 'Свернуть' : `Показать все ${p.works.length}`}
            </button>
          )}
        </section>
      )}
    </main>
  )
}

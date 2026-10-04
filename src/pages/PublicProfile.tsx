import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { loadProfile } from '../data/profile'
import { listStatuses } from '../data/myList'
import PosterCard from '../components/PosterCard'
import Achievements from '../components/Achievements'
import Mascot from '../components/Mascot'
import { usePageMeta } from '../data/pageMeta'

/** Открытый профиль зрителя: что смотрит, любимое, оценки, достижения. */
export default function PublicProfile() {
  const { id = '' } = useParams()
  const result = useAsync(() => loadProfile(id), [id])
  const p = result.value
  usePageMeta(p ? `${p.name}: профиль` : result.loading ? undefined : 'Профиль скрыт', p?.about)

  if (result.loading && !p) return <main className="container page-fallback" aria-busy="true" />
  if (!p)
    return (
      <main className="container empty-page">
        <Mascot mood="lost" />
        <h1>Профиль скрыт</h1>
        <p className="muted">Владелец закрыл профиль или ссылка набрана с ошибкой.</p>
        <Link to="/" className="btn btn--accent">
          На главную
        </Link>
      </main>
    )

  const s = p.summary
  const stats = [
    ...listStatuses.map((st) => ({ label: st.title, value: s.counts[st.id] ?? 0 })),
    { label: 'Серий', value: s.facts.episodes },
    ...(s.meanRating ? [{ label: 'Средняя оценка', value: s.meanRating }] : []),
  ]

  return (
    <main className="container stack public-profile">
      <section className="profile-hero">
        <span className="profile-hero__avatar" aria-hidden="true">
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{p.name}</h1>
          {p.about && <p className="muted">{p.about}</p>}
          <span className="muted" style={{ fontSize: 13 }}>
            Обновлено {new Date(p.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
          </span>
        </div>
      </section>

      <dl className="profile-stats">
        {stats.map((x) => (
          <div key={x.label}>
            <dt className="muted">{x.label}</dt>
            <dd>{x.value}</dd>
          </div>
        ))}
      </dl>

      {s.watching.length > 0 && (
        <Shelf title="Смотрит сейчас">
          {s.watching.map((a) => (
            <div key={a.id} className="list-item">
              <PosterCard anime={a} />
              {a.watched ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  {a.watched}
                  {a.episodes ? ` / ${a.episodes}` : ''} эп.
                </span>
              ) : null}
            </div>
          ))}
        </Shelf>
      )}
      {s.favorites.length > 0 && (
        <Shelf title="Любимое">
          {s.favorites.map((a) => (
            <PosterCard key={a.id} anime={a} />
          ))}
        </Shelf>
      )}
      {s.recent.length > 0 && (
        <Shelf title="Недавно просмотрено">
          {s.recent.map((a) => (
            <PosterCard key={a.id} anime={a} />
          ))}
        </Shelf>
      )}
      <Achievements unlocked={s.achievements} />
    </main>
  )
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      <div className="grid grid--posters">{children}</div>
    </section>
  )
}

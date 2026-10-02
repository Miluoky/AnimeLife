import { Link } from 'react-router-dom'
import { useState } from 'react'
import { listStatuses, useMyList, type ListStatus } from '../data/myList'
import { useAuth } from '../data/auth'
import PosterCard from '../components/PosterCard'
import EpisodeProgress from '../components/EpisodeProgress'
import ListTools from '../components/ListTools'
import CalendarExport from '../components/CalendarExport'
import { usePageMeta } from '../data/pageMeta'

export default function MyList() {
  usePageMeta('Мой список')
  const list = useMyList()
  const { user } = useAuth()
  const [tab, setTab] = useState<ListStatus>('watching')
  const items = list.filter((e) => e.status === tab)

  return (
    <main className="container home">
      <section className="stack">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <h1 className="page-title">Мой список</h1>
          <div className="chips" role="tablist" aria-label="Статус">
            {listStatuses.map((s) => {
              const count = list.filter((e) => e.status === s.id).length
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === tab}
                  className={`pill${s.id === tab ? ' active' : ''}`}
                  onClick={() => setTab(s.id)}
                >
                  {s.title}
                  {count > 0 && <span className="pill__count">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {items.length ? (
          <div className="grid grid--posters">
            {items.map((e) => (
              <div key={e.anime.id} className="list-item">
                <PosterCard anime={e.anime} />
                {(e.status === 'watching' || (e.watched ?? 0) > 0) && <EpisodeProgress entry={e} compact />}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="muted">
              {list.length
                ? 'В этом разделе пока пусто.'
                : 'Здесь будут тайтлы, которые вы отметили. Откройте любой тайтл и выберите статус в кнопке «В мой список».'}
            </p>
            <Link to="/catalog" className="btn btn--accent">
              Перейти в каталог
            </Link>
          </div>
        )}
        <div className="actions">
          <CalendarExport />
        </div>
        <ListTools />
        <p className="muted source-note">
          {user ? (
            'Список сохраняется в вашем аккаунте и одинаков на всех устройствах.'
          ) : (
            <>
              Список хранится в этом браузере. <Link to="/account">Войдите</Link>, чтобы он был на всех устройствах.
            </>
          )}
        </p>
      </section>
    </main>
  )
}

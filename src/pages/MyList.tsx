import { Link } from 'react-router-dom'
import { useState } from 'react'
import { listStatuses, useMyList, type ListStatus } from '../data/myList'
import { useAuth } from '../data/auth'
import PosterCard from '../components/PosterCard'

export default function MyList() {
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
              <PosterCard key={e.anime.id} anime={e.anime} />
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

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { listStatuses, setListStatus, useMyList, type ListStatus } from '../data/myList'
import { useAuth } from '../data/auth'
import PosterCard from '../components/PosterCard'
import EpisodeProgress from '../components/EpisodeProgress'
import ListTools from '../components/ListTools'
import CalendarExport from '../components/CalendarExport'
import { usePageMeta } from '../data/pageMeta'
import { loadCatalog, useAsync } from '../api'
import { PlusIcon, CheckIcon, SparkIcon } from '../components/Icons'
import Shelf from '../components/Shelf'
import './my-list.css'

export default function MyList() {
  usePageMeta('Мой список')
  const list = useMyList()
  const { user } = useAuth()
  // Открываем первый непустой раздел: если всё в «Буду смотреть», пустая вкладка «Смотрю» только путает.
  const [picked, setTab] = useState<ListStatus>()
  const tab = picked ?? listStatuses.find((s) => list.some((e) => e.status === s.id))?.id ?? 'watching'
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
          list.length ? (
            <div className="empty-state">
              <p className="muted">В этом разделе пока пусто.</p>
            </div>
          ) : (
            <EmptyList />
          )
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

/** Пустой список: объясняем, как он работает, и сразу даём, что добавить. */
function EmptyList() {
  const popular = useAsync(() => loadCatalog({ order: 'popularity', status: 'ongoing', limit: 12 }), [])
  const list = useMyList()
  const picks = popular.value?.data ?? []
  return (
    <div className="list-empty">
      <div className="list-empty__intro">
        <span className="list-empty__icon" aria-hidden="true">
          <PlusIcon size={26} />
        </span>
        <h2 className="list-empty__title">Список пока пуст</h2>
        <p className="muted">
          Отмечайте тайтлы кнопкой «В мой список»: здесь будет видно, что вы смотрите, на какой серии остановились и что
          отложили на потом.
        </p>
        <div className="list-empty__actions">
          <Link to="/catalog" className="btn btn--accent">
            Перейти в каталог
          </Link>
          <Link to="/random" className="btn btn--ghost">
            🎲 Что посмотреть?
          </Link>
        </div>
      </div>
      {picks.length > 0 && (
        <Shelf title="Популярно сейчас" subtitle="Добавьте в «Буду смотреть» одним нажатием" icon={<SparkIcon size={18} />}>
          {picks.map((a) => {
            const added = list.some((e) => e.anime.id === a.id)
            return (
              <div key={a.id} className="row-scroll__item">
                <PosterCard anime={a} />
                <button
                  type="button"
                  className="btn btn--small btn--ghost list-empty__add"
                  onClick={() => setListStatus(a, added ? undefined : 'planned')}
                  aria-pressed={added}
                >
                  {added ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
                  {added ? 'В списке' : 'Буду смотреть'}
                </button>
              </div>
            )
          })}
        </Shelf>
      )}
    </div>
  )
}

import { Suspense, lazy, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Poster } from '../components/PosterCard'
import { PlayIcon } from '../components/Icons'
import { useInboxCount } from '../data/inbox'
import { useMyList, type ListStatus } from '../data/myList'
import { removeProgress, useHistory, type HistoryEntry } from '../data/history'
import { getPosition } from '../data/positions'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import './library.css'

const MyListView = lazy(() => import('./MyList'))
const WatchingView = lazy(() => import('./Watching'))

const TABS = [
  { id: 'new', title: 'Новые серии' },
  { id: 'history', title: 'Продолжить' },
  { id: 'watching', title: 'Смотрю', status: 'watching' as ListStatus },
  { id: 'planned', title: 'В планах', status: 'planned' as ListStatus },
  { id: 'completed', title: 'Просмотрено', status: 'completed' as ListStatus },
  { id: 'on_hold', title: 'Отложено', status: 'on_hold' as ListStatus },
  { id: 'dropped', title: 'Брошено', status: 'dropped' as ListStatus },
] as const

type TabId = (typeof TABS)[number]['id']

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function ContinueShelf({ history }: { history: HistoryEntry[] }) {
  if (!history.length) {
    return (
      <section className="library-empty" aria-label="Продолжить просмотр пуст">
        <h2 className="library-empty__title">Пока нечего продолжать</h2>
        <p className="muted">Откройте любую серию — она появится здесь с местом, на котором вы остановились.</p>
        <div className="library-empty__actions">
          <Link to="/library?tab=new" className="btn btn--ghost">
            Новые серии из «Смотрю»
          </Link>
          <Link to="/catalog" className="btn btn--accent">
            В каталог
          </Link>
        </div>
      </section>
    )
  }
  return (
    <section className="stack">
      <div className="grid grid--wide">
        {history.slice(0, 12).map((h) => {
          const at = getPosition(h.animeId, h.episode)
          return (
            <div key={h.animeId} className="continue-item">
              <Link to={`/watch/${h.animeId}/${h.episode}`} className="continue-card">
                <div className="continue-card__img" style={{ background: h.posterFill }}>
                  <Poster anime={h} className="poster-img--cover" />
                  <span className="continue-card__play">
                    <PlayIcon size={20} />
                  </span>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${(h.episode / Math.max(1, h.totalEpisodes)) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="poster-card__title">{h.title}</div>
                  <div className="poster-card__meta">
                    Серия {h.episode} из {h.totalEpisodes}
                    {at !== null && ` • на ${formatTime(at)}`}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                className="continue-item__remove"
                aria-label={`Убрать «${h.title}» из продолжить`}
                title="Убрать"
                onClick={() => {
                  const undo = removeProgress(h.animeId)
                  if (undo) toast('Убрано из «Продолжить просмотр»', { label: 'Вернуть', onClick: undo })
                }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <p className="muted">
        Новые вышедшие серии — во вкладке{' '}
        <Link to="/library?tab=new">Новые серии</Link>.
      </p>
    </section>
  )
}

export default function LibraryPage() {
  usePageMeta('Моя библиотека — AnimeLife', 'Все ваши аниме в одном месте: новые серии, история просмотров, списки «Смотрю», «В планах» и «Просмотрено».')
  const [params, setParams] = useSearchParams()
  const fresh = useInboxCount()
  const myList = useMyList()
  const history = useHistory()

  const rawTab = params.get('tab') as TabId | null
  const currentTab: TabId = rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : 'history'

  const active = useMemo(() => TABS.find((t) => t.id === currentTab) ?? TABS[0], [currentTab])

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params)
    if (id === 'history') next.delete('tab')
    else next.set('tab', id)
    setParams(next, { replace: true })
  }

  const getCount = (tab: (typeof TABS)[number]) => {
    if (tab.id === 'new') return fresh > 0 ? String(fresh) : null
    if (tab.id === 'history') return history.length ? String(history.length) : null
    if (tab.status) {
      const cnt = myList.filter((e) => e.status === tab.status).length
      return cnt > 0 ? String(cnt) : null
    }
    return null
  }

  return (
    <main className="container home library-page">
      <header className="section-head library-page__head">
        <div>
          <h1 className="page-title">Библиотека</h1>
          <p className="muted library-page__lede">Новые серии, история и ваши списки</p>
        </div>
      </header>

      <nav className="library-nav" role="tablist" aria-label="Разделы библиотеки">
        {TABS.map((tab) => {
          const count = getCount(tab)
          const isActive = currentTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`library-tab ${isActive ? 'is-active' : ''}${tab.id === 'new' && fresh ? ' has-fresh' : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.title}
              {count && <span className="library-tab__count">{count}</span>}
            </button>
          )
        })}
      </nav>

      {currentTab === 'new' ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-md)' }} />}>
          <WatchingView embedded />
        </Suspense>
      ) : currentTab === 'history' ? (
        <ContinueShelf history={history} />
      ) : (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-md)' }} />}>
          <MyListView embedded status={'status' in active ? active.status : undefined} />
        </Suspense>
      )}
    </main>
  )
}

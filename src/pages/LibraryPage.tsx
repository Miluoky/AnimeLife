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

const TABS = [
  { id: 'history', title: 'Продолжить просмотр' },
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
      <section className="stack">
        <p className="muted">Пока нечего продолжать. Откройте серию — она появится здесь.</p>
        <Link to="/watching" className="btn btn--ghost">
          Новые серии из «Смотрю»
        </Link>
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
        Новые вышедшие серии — на вкладке{' '}
        <Link to="/watching">Смотрю</Link>.
      </p>
    </section>
  )
}

export default function LibraryPage() {
  usePageMeta('Моя библиотека — AnimeLife', 'Все ваши аниме в одном месте: история просмотров, новые серии, списки «Смотрю», «В планах» и «Просмотрено».')
  const [params, setParams] = useSearchParams()
  const currentTab = (params.get('tab') as TabId) || 'history'
  const fresh = useInboxCount()
  const myList = useMyList()
  const history = useHistory()

  const active = useMemo(() => TABS.find((t) => t.id === currentTab) ?? TABS[0], [currentTab])

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params)
    if (id === 'history') next.delete('tab')
    else next.set('tab', id)
    setParams(next)
  }

  const getCount = (tab: (typeof TABS)[number]) => {
    if (tab.id === 'history') return history.length ? String(history.length) : fresh ? `+${fresh}` : null
    if (tab.status) {
      const cnt = myList.filter((e) => e.status === tab.status).length
      return cnt > 0 ? String(cnt) : null
    }
    return null
  }

  return (
    <main className="container home library-page">
      <header className="section-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Моя библиотека</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            История просмотров и списки в одном месте
          </p>
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
              className={`library-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.title}
              {count && <span className="library-tab__count">{count}</span>}
            </button>
          )
        })}
      </nav>

      {currentTab === 'history' ? (
        <ContinueShelf history={history} />
      ) : (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-md)' }} />}>
          <MyListView embedded status={'status' in active ? active.status : undefined} />
        </Suspense>
      )}
    </main>
  )
}

import { Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInboxCount } from '../data/inbox'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import './library.css'

const WatchingView = lazy(() => import('./Watching'))
const MyListView = lazy(() => import('./MyList'))

const TABS = [
  { id: 'history', title: 'Продолжить просмотр' },
  { id: 'watching', title: 'Смотрю', status: 'watching' },
  { id: 'planned', title: 'В планах', status: 'planned' },
  { id: 'completed', title: 'Просмотрено', status: 'completed' },
  { id: 'on_hold', title: 'Отложено', status: 'on_hold' },
  { id: 'dropped', title: 'Брошено', status: 'dropped' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function LibraryPage() {
  usePageMeta('Моя библиотека — AnimeLife', 'Все ваши аниме в одном месте: история просмотров, новые серии, списки «Смотрю», «В планах» и «Просмотрено».')
  const [params, setParams] = useSearchParams()
  const currentTab = (params.get('tab') as TabId) || 'history'

  const fresh = useInboxCount()
  const myList = useMyList()

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params)
    if (id === 'history') next.delete('tab')
    else next.set('tab', id)
    setParams(next)
  }

  const getCount = (tab: (typeof TABS)[number]) => {
    if (tab.id === 'history') return fresh ? `+${fresh}` : null
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
            История просмотров, список отслеживания и новые вышедшие серии
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

      <Suspense fallback={<div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-md)' }} />}>
        {currentTab === 'history' ? <WatchingView /> : <MyListView />}
      </Suspense>
    </main>
  )
}

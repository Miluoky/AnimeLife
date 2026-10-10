import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Poster } from '../components/PosterCard'
import { CheckIcon, PlayIcon } from '../components/Icons'
import { usePageMeta } from '../data/pageMeta'
import { inboxStore, isFresh, markInboxSeen, type InboxItem } from '../data/inbox'
import { checkInbox } from '../data/inboxCheck'
import { setWatched, useMyList } from '../data/myList'
import { followStore, muteStore, watchingIds } from '../data/push'
import './watching.css'

// Переключатель пушей — тот же, что в профиле.
const PushSettings = lazy(() => import('../components/PushSettings'))

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** «через 3 ч», «через 2 дн», «сегодня в 18:30». */
function whenLabel(at: number) {
  const ms = at - Date.now()
  if (ms <= 0) return 'вот-вот'
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return `через ${Math.max(1, Math.round(ms / 60_000))} мин`
  if (h < 24) return `через ${h} ч, в ${timeFormat.format(at)}`
  return `${dayFormat.format(at)}, ${timeFormat.format(at)}`
}

function Card({ item, watched, fresh }: { item: InboxItem; watched: number; fresh: boolean }) {
  const ep = Math.max(1, Math.min(watched + 1, item.aired))
  const behind = item.aired - watched
  return (
    <li className={`ep-card${fresh ? ' ep-card--fresh' : ''}`}>
      <Link to={`/watch/${item.id}/${ep}`} className="ep-card__main" aria-label={`${item.title}: смотреть ${ep} серию`}>
        <span className="ep-card__poster" style={{ background: item.posterFill }}>
          <Poster anime={{ title: item.title, posterSmall: item.poster, posterFill: item.posterFill }} />
          <span className="ep-card__play">
            <PlayIcon size={16} />
          </span>
        </span>
        <span className="ep-card__text">
          {fresh && <span className="ep-card__tag">Новая серия</span>}
          <span className="ep-card__title">{item.title}</span>
          <span className="ep-card__meta">
            Серия {ep}
            {behind > 1 ? ` · ещё ${behind - 1} после неё` : item.total && ep === item.total ? ' · финал' : ''}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="ep-card__done"
        aria-label={`Отметить ${ep} серию «${item.title}» просмотренной`}
        title="Уже посмотрел"
        onClick={() => setWatched(item.id, ep)}
      >
        <CheckIcon />
      </button>
    </li>
  )
}

/** Вкладка «Смотрю»: вышедшие и ещё не просмотренные серии, ближайшие серии онгоингов и уведомления. */
export default function Watching() {
  usePageMeta('Смотрю: новые серии', 'Новые серии тайтлов из вашего списка «Смотрю»: одно касание, и серия уже идёт.')
  const state = inboxStore.use()
  const list = useMyList()
  followStore.use()
  muteStore.use()
  // Что было новым, пока вкладка открыта: подсветка остаётся, хотя счётчик в меню уже сброшен.
  const [fresh] = useState(() => new Set<string>())
  const seeFresh = () => {
    for (const i of inboxStore.get().items) if (isFresh(i)) fresh.add(i.id)
    markInboxSeen()
  }
  const [loading, setLoading] = useState(!state.checkedAt)
  const [error, setError] = useState(false)

  const refresh = (force: boolean) => {
    setLoading(true)
    setError(false)
    checkInbox(force)
      .catch(() => setError(true))
      .finally(() => {
        seeFresh()
        setLoading(false)
      })
  }
  useEffect(() => {
    seeFresh()
    refresh(true)
  }, [])

  const tracked = new Set(watchingIds())
  const watched = new Map(list.map((e) => [e.anime.id, e.watched ?? 0]))
  const items = state.items.filter((i) => tracked.has(i.id))
  const ready = items
    .filter((i) => i.aired > (watched.get(i.id) ?? 0))
    .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)))
  const soon = items.filter((i) => i.nextAt && i.nextAt > Date.now()).sort((a, b) => a.nextAt! - b.nextAt!)

  return (
    <main className="container watching">
      <header className="watching__head">
        <div>
          <h1 className="page-title">Смотрю</h1>
          <p className="muted">Новые серии из «Смотрю» и тайтлов с колокольчиком. Нажмите, и серия сразу включится.</p>
        </div>
        <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => refresh(true)}>
          {loading ? 'Проверяю…' : 'Обновить'}
        </button>
      </header>

      {error && (
        <p className="notice notice--error" role="alert">
          Не получилось проверить новые серии. Попробуйте обновить чуть позже.
        </p>
      )}

      {!tracked.size ? (
        <section className="watching__empty">
          <h2>Пока не за чем следить</h2>
          <p className="muted">
            Отметьте тайтл как «Смотрю» или нажмите колокольчик на его странице: сюда будут приходить новые серии.
          </p>
          <Link to="/ongoing" className="btn btn--accent">
            Выбрать онгоинг
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="w-ready">
            <h2 id="w-ready" className="watching__h">
              Можно смотреть <span className="watching__count">{ready.length}</span>
            </h2>
            {ready.length ? (
              <ul className="ep-list">
                {ready.map((i) => (
                  <Card key={i.id} item={i} watched={watched.get(i.id) ?? 0} fresh={fresh.has(i.id)} />
                ))}
              </ul>
            ) : (
              <p className="muted watching__none">{loading && !state.checkedAt ? 'Проверяю серии…' : 'Всё вышедшее уже просмотрено. Ждём новые серии.'}</p>
            )}
          </section>

          {soon.length > 0 && (
            <section aria-labelledby="w-soon">
              <h2 id="w-soon" className="watching__h">
                Скоро выйдут
              </h2>
              <ul className="soon-list">
                {soon.map((i) => (
                  <li key={i.id}>
                    <Link to={`/anime/${i.id}`}>
                      <span className="soon-list__title">{i.title}</span>
                      <span className="soon-list__ep">Серия {i.nextEp}</span>
                      <span className="soon-list__at">{whenLabel(i.nextAt!)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Suspense fallback={null}>
        <PushSettings />
      </Suspense>
    </main>
  )
}

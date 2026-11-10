import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadRecommendations, useAsync } from '../api'
import { Poster } from '../components/PosterCard'
import { CheckIcon, PlayIcon } from '../components/Icons'
import { animeHref } from '../data/animeUrl'
import { useHistory } from '../data/history'
import { inboxStore, isFresh, markInboxSeen, WEEK_MS, type EpisodeArrival, type InboxItem } from '../data/inbox'
import { checkInbox } from '../data/inboxCheck'
import { effectiveWatched, setWatched, todayIso, useMyList, type ListEntry } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { followStore, muteStore, watchingIds } from '../data/push'
import { GENRES } from '../data/seo'
import { tasteStore } from '../data/taste'
import { watchLogStore, type LogEntry } from '../data/watchLog'
import './watching.css'

// Переключатель пушей — тот же, что в профиле.
const PushSettings = lazy(() => import('../components/PushSettings'))

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function ru(n: number, one: string, few: string, many: string) {
  const r = new Intl.PluralRules('ru').select(n)
  return r === 'one' ? one : r === 'few' ? few : many
}

function seriesLabel(eps: number[]) {
  const unique = [...new Set(eps)].sort((a, b) => a - b)
  if (unique.length > 4) return `${unique.length} ${ru(unique.length, 'серия', 'серии', 'серий')}: ${unique[0]}–${unique[unique.length - 1]}`
  if (unique.length === 1) return `серия ${unique[0]}`
  const last = unique[unique.length - 1]
  return `серии ${unique.slice(0, -1).join(', ')} и ${last}`
}

function daysAgoIso(days: number, now = Date.now()) {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return todayIso(d)
}

/** Досмотрели за последние 7 дней: дата в списке или серия в журнале просмотра. */
function recentlyCompleted(list: ListEntry[], entries: LogEntry[], now = Date.now()) {
  const from = daysAgoIso(7, now)
  const logged = new Set(entries.filter((e) => e.at >= now - WEEK_MS).map((e) => e.a))
  return list
    .filter((e) => e.status === 'completed' && ((e.finishedOn != null && e.finishedOn >= from) || logged.has(e.anime.id)))
    .slice(0, 2)
}

function groupArrivals(arrivals: EpisodeArrival[], titles: Map<string, string>) {
  const groups: { id: string; title: string; eps: number[] }[] = []
  const index = new Map<string, number>()
  for (const arrival of arrivals) {
    let at = index.get(arrival.id)
    if (at == null) {
      at = groups.length
      index.set(arrival.id, at)
      groups.push({ id: arrival.id, title: titles.get(arrival.id) ?? arrival.title, eps: [] })
    }
    groups[at].eps.push(arrival.ep)
  }
  return groups
}

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

/** Сводка за 7 дней: что вышло, что не досмотрено, и пара похожих, если что-то недавно досмотрели. */
function WeekDigest({
  tracked,
  items,
  watched,
}: {
  tracked: Set<string>
  items: InboxItem[]
  watched: Map<string, number>
}) {
  const inbox = inboxStore.use()
  const log = watchLogStore.use()
  const list = useMyList()
  const history = useHistory()
  const taste = tasteStore.use()
  const now = Date.now()
  const titles = new Map(items.map((item) => [item.id, item.title]))
  const arrivals = groupArrivals(
    (inbox.arrived ?? []).filter((a) => tracked.has(a.id) && a.at >= now - WEEK_MS && a.at <= now),
    titles,
  )
  const behind = items
    .map((item) => ({ item, left: item.aired - (watched.get(item.id) ?? 0) }))
    .filter((row) => row.left > 0)
    .sort((a, b) => b.left - a.left)
  const done = recentlyCompleted(list, log.entries, now)
  const seeds = done.map((e) => ({ id: e.anime.id, title: e.anime.title, weight: 2 }))
  const genreKey = taste.genres.join(',')
  const genres = taste.genres.map((id) => GENRES.find((g) => g.id === id)?.name).filter((g): g is string => !!g)
  const seen = new Set([...list.map((e) => e.anime.id), ...history.map((h) => h.animeId)])
  const recs = useAsync(
    () =>
      seeds.length
        ? loadRecommendations(seeds, seen, 2, genres).catch(() => ({ items: [], used: [] }))
        : Promise.resolve({ items: [], used: [] }),
    [seeds.map((s) => s.id).join(','), genreKey],
  )
  const partial = !inbox.trackingSince || now - inbox.trackingSince < WEEK_MS
  const shownBehind = behind.slice(0, 6)
  const finishedNames = done.map((e) => `«${e.anime.title}»`).join(' и ')

  return (
    <section className="week-digest" aria-labelledby="w-week">
      <h2 id="w-week" className="watching__h">
        За неделю
      </h2>

      <div className="week-digest__block">
        <h3 className="week-digest__label">Новые серии</h3>
        {arrivals.length ? (
          <ul className="week-digest__list">
            {arrivals.map((group) => {
              const seenEp = watched.get(group.id) ?? 0
              const unread = group.eps.some((ep) => ep > seenEp)
              const next = [...group.eps].sort((a, b) => a - b).find((ep) => ep > seenEp) ?? Math.max(...group.eps)
              return (
                <li key={group.id}>
                  <Link to={`/watch/${group.id}/${next}`}>
                    <span className="week-digest__name">{group.title}</span>
                    <span className="week-digest__meta">
                      {seriesLabel(group.eps)}
                      {unread ? ' · не смотрели' : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted week-digest__note">
            {partial ? 'Пока запоминаем, какие серии выходят. Полная неделя соберётся после нескольких проверок.' : 'За семь дней новых серий не выходило.'}
          </p>
        )}
        {partial && arrivals.length > 0 && inbox.trackingSince && (
          <p className="muted week-digest__note">Считаем с {dayFormat.format(inbox.trackingSince)}.</p>
        )}
      </div>

      <div className="week-digest__block">
        <h3 className="week-digest__label">Не досмотрено</h3>
        {shownBehind.length ? (
          <ul className="week-digest__list">
            {shownBehind.map(({ item, left }) => {
              const ep = Math.max(1, Math.min((watched.get(item.id) ?? 0) + 1, item.aired))
              return (
                <li key={item.id}>
                  <Link to={`/watch/${item.id}/${ep}`}>
                    <span className="week-digest__name">{item.title}</span>
                    <span className="week-digest__meta">
                      {left} {ru(left, 'серия', 'серии', 'серий')}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted week-digest__note">Всё вышедшее уже отмечено просмотренным.</p>
        )}
        {behind.length > shownBehind.length && (
          <p className="muted week-digest__note">И ещё {behind.length - shownBehind.length}.</p>
        )}
      </div>

      {done.length > 0 && (
        <div className="week-digest__block">
          <h3 className="week-digest__label">Если понравилось</h3>
          <p className="muted week-digest__note">
            Недавно досмотрели {finishedNames}. <Link to="/#recs">Вам понравится</Link>
          </p>
          {recs.loading && !recs.value?.items.length ? (
            <p className="muted week-digest__note">Подбираем похожее…</p>
          ) : (
            !!recs.value?.items.length && (
              <ul className="week-digest__recs">
                {recs.value.items.slice(0, 2).map((rec) => (
                  <li key={rec.anime.id}>
                    <Link to={animeHref(rec.anime)}>
                      <span className="week-digest__poster" style={{ background: rec.anime.posterFill }}>
                        <Poster anime={rec.anime} />
                      </span>
                      <span className="week-digest__text">
                        <span className="week-digest__name">{rec.anime.title}</span>
                        <span className="week-digest__meta">Похоже на «{rec.because.title}»</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </section>
  )
}

/** Новые серии из «Смотрю» и с колокольчиком. `embedded` — вкладка внутри /library. */
export default function Watching({ embedded = false }: { embedded?: boolean } = {}) {
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
  const history = useHistory()
  const watched = new Map(
    list.map((e) => {
      const seen = history.find((h) => h.animeId === e.anime.id)
      return [e.anime.id, effectiveWatched(e.watched, seen?.episode)] as const
    }),
  )
  const items = state.items.filter((i) => tracked.has(i.id))
  const ready = items
    .filter((i) => i.aired > (watched.get(i.id) ?? 0))
    .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)))
  const soon = items.filter((i) => i.nextAt && i.nextAt > Date.now()).sort((a, b) => a.nextAt! - b.nextAt!)

  const Wrap = embedded ? 'section' : 'main'
  return (
    <Wrap className={embedded ? 'watching watching--embedded' : 'container watching'}>
      <header className="watching__head">
        <div>
          {!embedded && <h1 className="page-title">Смотрю</h1>}
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
          <div className="actions">
            <Link to="/ongoing" className="btn btn--accent">
              Выбрать онгоинг
            </Link>
            {embedded && (
              <Link to="/library?tab=planned" className="btn btn--ghost">
                Из «В планах»
              </Link>
            )}
          </div>
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

          <WeekDigest tracked={tracked} items={items} watched={watched} />
        </>
      )}

      <Suspense fallback={null}>
        <PushSettings />
      </Suspense>
    </Wrap>
  )
}

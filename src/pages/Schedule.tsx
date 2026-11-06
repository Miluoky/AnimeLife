import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadSchedule, useAsync, type ScheduleItem } from '../api'
import Mascot from '../components/Mascot'
import '../components/empty-card.css'
import { Poster } from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import { useMyList } from '../data/myList'
import './schedule.css'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const chipFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric' })
const OUT_SHOWN = 2

function untilLabel(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  const h = Math.floor(min / 60)
  return `через ${h ? `${h} ч ` : ''}${min % 60 ? `${min % 60} мин` : ''}`.trim()
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayTitle(d: Date) {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const label = dayFormat.format(d)
  if (dayKey(d) === dayKey(today)) return `Сегодня, ${label}`
  if (dayKey(d) === dayKey(tomorrow)) return `Завтра, ${label}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function groupByDay(items: ScheduleItem[]) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const days = new Map<string, { date: Date; items: ScheduleItem[] }>()
  for (const item of [...items].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (item.at < start || item.at >= end) continue
    const key = dayKey(item.at)
    if (!days.has(key)) days.set(key, { date: item.at, items: [] })
    days.get(key)!.items.push(item)
  }
  return [...days.values()]
}

export default function Schedule() {
  usePageMeta('Расписание выхода серий онгоингов — AnimeLife', 'Точное расписание выхода новых серий аниме на неделю по вашему местному времени. Отслеживайте релизы из вашего списка.')
  const result = useAsync(loadSchedule, [])
  const [params, setParams] = useSearchParams()

  const mine = new Set(useMyList().filter((e) => e.status !== 'dropped' && e.status !== 'completed').map((e) => e.anime.id))
  const all = useMemo(() => (result.value ? groupByDay(result.value.data) : []), [result.value])
  const mineCount = useMemo(() => all.reduce((n, d) => n + d.items.filter((i) => mine.has(i.anime.id)).length, 0), [all, mine])

  const onlyMine = params.get('mine') === '1' && mineCount > 0
  const days = useMemo(() => {
    return onlyMine
      ? all.map((d) => ({ ...d, items: d.items.filter((i) => mine.has(i.anime.id)) })).filter((d) => d.items.length)
      : all
  }, [all, onlyMine, mine])

  const now = Date.now()
  const next = days.flatMap((d) => d.items).find((i) => i.at.getTime() >= now)
  const [showOut, setShowOut] = useState(false)

  return (
    <main className="container home schedule-page">
      <section className="stack">
        <header className="schedule-hero">
          <div className="section-head">
            <div>
              <h1 className="page-title">Расписание выхода серий</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Новые серии онгоингов на неделю, время ваше местное · <Link to="/season" className="link-accent">весь сезон</Link>
              </p>
            </div>
          </div>
        </header>

        {mineCount > 0 && (
          <div className="schedule-filter" role="group" aria-label="Какие серии показать">
            <button
              type="button"
              className={`pill${onlyMine ? '' : ' active'}`}
              aria-pressed={!onlyMine}
              onClick={() => setParams({}, { replace: true })}
            >
              Все онгоинги
            </button>
            <button
              type="button"
              className={`pill${onlyMine ? ' active' : ''}`}
              aria-pressed={onlyMine}
              onClick={() => setParams({ mine: '1' }, { replace: true })}
            >
              Из моего списка <span className="pill__count">{mineCount}</span>
            </button>
          </div>
        )}

        {result.loading && !result.value && <div className="schedule-days skeleton" style={{ height: 42 }} aria-hidden="true" />}

        {days.length > 1 && (
          <div className="schedule-days-wrap">
            <nav className="schedule-days" aria-label="Дни недели">
              {days.map((day) => {
                const k = dayKey(day.date)
                const isToday = k === dayKey(new Date())
                return (
                  <a
                    key={k}
                    href={`#day-${k}`}
                    className={`pill schedule-day-tab${isToday ? ' schedule-day-tab--today' : ''}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(`day-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    {isToday ? 'Сегодня' : chipFormat.format(day.date)}
                    <span className="pill__count schedule-day-tab__count">{day.items.length}</span>
                  </a>
                )
              })}
            </nav>
          </div>
        )}

        {result.loading && !result.value ? (
          <div className="schedule" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="schedule-day skeleton" style={{ height: 180 }} />
            ))}
          </div>
        ) : result.value?.demo ? (
          <p className="notice" role="status">
            Не получилось загрузить расписание Shikimori. Попробуйте обновить страницу позже.
          </p>
        ) : days.length ? (
          <div className="schedule">
            {days.map((day) => {
              const out = day.items.filter((i) => i.at.getTime() < now)
              const hidden = !showOut && out.length > OUT_SHOWN ? out.length - OUT_SHOWN : 0
              const items = day.items.slice(hidden)

              return (
                <section
                  key={dayKey(day.date)}
                  id={`day-${dayKey(day.date)}`}
                  className="schedule-day"
                  aria-label={dayTitle(day.date)}
                >
                  <div className="schedule-day__head">
                    <h2 className="schedule-day__title">{dayTitle(day.date)}</h2>
                    <span className="schedule-day__badge">{day.items.length} релизов</span>
                  </div>

                  {hidden > 0 && (
                    <button type="button" className="schedule-more" onClick={() => setShowOut(true)}>
                      Уже вышли сегодня: {out.length} · показать все
                    </button>
                  )}

                  <ul className="schedule-list">
                    {items.map((item) => {
                      const isPast = item.at.getTime() < now
                      const isMine = mine.has(item.anime.id)
                      const isNext = item === next

                      return (
                        <li key={`${item.anime.id}-${item.episode}`}>
                          <Link
                            to={`/anime/${item.anime.id}`}
                            className={`schedule-row${isMine ? ' schedule-row--mine' : ''}${isPast ? ' schedule-row--out' : ''}`}
                          >
                            <time className="schedule-row__time" dateTime={item.at.toISOString()}>
                              {timeFormat.format(item.at)}
                            </time>
                            <span className="schedule-row__poster" style={{ background: item.anime.posterFill }}>
                              <Poster anime={item.anime} />
                            </span>
                            <span className="schedule-row__info">
                              <span className="schedule-row__title">{item.anime.title}</span>
                              <span className="schedule-row__meta muted">
                                Серия {item.episode}
                                {item.anime.episodes ? ` из ${item.anime.episodes}` : ''}
                                {isPast ? ' · вышла' : ''}
                              </span>
                            </span>
                            {isNext ? (
                              <span className="schedule-row__soon">{untilLabel(item.at.getTime() - now)}</span>
                            ) : (
                              isMine && <span className="schedule-row__mine">В списке</span>
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="empty-card schedule-empty">
            <Mascot />
            <p className="schedule-empty__eyebrow">Эфирная пауза</p>
            <h2 className="schedule-empty__title">На неделе тихо — новых серий не запланировано</h2>
            <p className="muted schedule-empty__text">
              Похоже, онгоинги на перерыве: сетка расписания пустая, как ночной эфир без сигнала. Загляните в каталог или
              доберите давно откладываемое целиком.
            </p>
            <div className="actions">
              <Link to="/catalog" className="btn btn--accent">
                Открыть каталог
              </Link>
              <Link to="/random" className="btn btn--ghost">
                Что посмотреть?
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

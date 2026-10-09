import { useState } from 'react'
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
/** Сколько вышедших сегодня серий показывать сразу; остальные под кнопкой, чтобы ближайшие были наверху. */
const OUT_SHOWN = 2

/** «через 25 мин», «через 3 ч 10 мин». */
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

/** Группирует серии по дням (в часовом поясе зрителя), только ближайшая неделя. */
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
  usePageMeta('Расписание выхода серий аниме на неделю', 'Когда выйдет новая серия: расписание онгоингов на ближайшую неделю с днём и временем выхода каждой серии.')
  const result = useAsync(loadSchedule, [])
  const [params, setParams] = useSearchParams()
  // Свои тайтлы: всё, что в списке, кроме брошенного и просмотренного.
  const mine = new Set(useMyList().filter((e) => e.status !== 'dropped' && e.status !== 'completed').map((e) => e.anime.id))
  const all = result.value ? groupByDay(result.value.data) : []
  const mineCount = all.reduce((n, d) => n + d.items.filter((i) => mine.has(i.anime.id)).length, 0)
  const onlyMine = params.get('mine') === '1' && mineCount > 0
  const days = onlyMine
    ? all.map((d) => ({ ...d, items: d.items.filter((i) => mine.has(i.anime.id)) })).filter((d) => d.items.length)
    : all
  const now = Date.now()
  // Ближайшая серия, которая ещё не вышла: у неё отсчёт «через …».
  const next = days.flatMap((d) => d.items).find((i) => i.at.getTime() >= now)
  const [showOut, setShowOut] = useState(false)

  return (
    <main className="container home">
      <section className="stack">
        <div className="section-head">
          <h1 className="page-title">Расписание выхода серий</h1>
          <span className="muted">Новые серии онгоингов на неделю, время ваше местное</span>
        </div>

        {mineCount > 0 && (
          <div className="schedule-filter" role="group" aria-label="Какие серии показать">
            <button type="button" className={`pill${onlyMine ? '' : ' active'}`} aria-pressed={!onlyMine} onClick={() => setParams({}, { replace: true })}>
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

        {days.length > 1 && (
          <nav className="schedule-days" aria-label="Дни недели">
            {days.map((day) => (
              <a
                key={dayKey(day.date)}
                href={`#day-${dayKey(day.date)}`}
                className="pill"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`day-${dayKey(day.date)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {dayKey(day.date) === dayKey(new Date()) ? 'Сегодня' : chipFormat.format(day.date)}
                <span className="pill__count">{day.items.length}</span>
              </a>
            ))}
          </nav>
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
                <section key={dayKey(day.date)} id={`day-${dayKey(day.date)}`} className="schedule-day" aria-label={dayTitle(day.date)}>
                  <h2 className="schedule-day__title">{dayTitle(day.date)}</h2>
                  {hidden > 0 && (
                    <button type="button" className="schedule-more" onClick={() => setShowOut(true)}>
                      Уже вышли сегодня: {out.length} · показать все
                    </button>
                  )}
                  <ul className="schedule-list">
                    {items.map((item) => (
                      <li key={`${item.anime.id}-${item.episode}`}>
                        <Link
                          to={`/anime/${item.anime.id}`}
                          className={`schedule-row${mine.has(item.anime.id) ? ' schedule-row--mine' : ''}${item.at.getTime() < now ? ' schedule-row--out' : ''}`}
                        >
                          <time className="schedule-row__time" dateTime={item.at.toISOString()}>
                            {timeFormat.format(item.at)}
                          </time>
                          <span className="schedule-row__poster" style={{ background: item.anime.posterFill }}>
                            <Poster anime={item.anime} />
                          </span>
                          <span className="schedule-row__info">
                            <span className="schedule-row__title">{item.anime.title}</span>
                            <span className="muted">
                              Серия {item.episode}
                              {item.anime.episodes ? ` из ${item.anime.episodes}` : ''}
                              {item.at.getTime() < now ? ' · вышла' : ''}
                            </span>
                          </span>
                          {item === next ? (
                            <span className="schedule-row__soon">{untilLabel(item.at.getTime() - now)}</span>
                          ) : (
                            mine.has(item.anime.id) && <span className="schedule-row__mine">В списке</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="empty-card">
            <Mascot />
            <h2>На этой неделе новых серий нет</h2>
            <p className="muted">Онгоинги на перерыве. Загляните в каталог или посмотрите, что уже вышло целиком.</p>
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

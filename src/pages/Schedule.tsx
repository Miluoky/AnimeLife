import { Link } from 'react-router-dom'
import { loadSchedule, useAsync, type ScheduleItem } from '../api'
import { Poster } from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

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
  const days = result.value ? groupByDay(result.value.data) : []

  return (
    <main className="container home">
      <section className="stack">
        <div className="section-head">
          <h1 className="page-title">Расписание выхода серий</h1>
          <span className="muted">Новые серии онгоингов на неделю, время ваше местное</span>
        </div>

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
            {days.map((day) => (
              <section key={dayKey(day.date)} className="schedule-day" aria-label={dayTitle(day.date)}>
                <h2 className="schedule-day__title">{dayTitle(day.date)}</h2>
                <ul className="schedule-list">
                  {day.items.map((item) => (
                    <li key={`${item.anime.id}-${item.episode}`}>
                      <Link to={`/anime/${item.anime.id}`} className="schedule-row">
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
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="muted">На этой неделе новых серий нет.</p>
        )}
      </section>
    </main>
  )
}

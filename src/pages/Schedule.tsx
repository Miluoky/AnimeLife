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
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const dateShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

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

  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [selectedDayKey, setSelectedDayKey] = useState<string>('')

  const mine = new Set(useMyList().filter((e) => e.status !== 'dropped' && e.status !== 'completed').map((e) => e.anime.id))
  const all = useMemo(() => (result.value ? groupByDay(result.value.data) : []), [result.value])
  const mineCount = useMemo(() => all.reduce((n, d) => n + d.items.filter((i) => mine.has(i.anime.id)).length, 0), [all, mine])

  const onlyMine = params.get('mine') === '1' && mineCount > 0
  const days = useMemo(() => {
    return onlyMine
      ? all.map((d) => ({ ...d, items: d.items.filter((i) => mine.has(i.anime.id)) })).filter((d) => d.items.length)
      : all
  }, [all, onlyMine, mine])

  const todayKey = dayKey(new Date())
  const activeDayKey = selectedDayKey || (days.some((d) => dayKey(d.date) === todayKey) ? todayKey : dayKey(days[0]?.date || new Date()))
  const activeDay = days.find((d) => dayKey(d.date) === activeDayKey) || days[0]

  const now = Date.now()

  return (
    <main className="container home">
      <section className="stack">
        <header className="schedule-hero">
          <div className="section-head">
            <div>
              <h1 className="page-title">Расписание выхода серий</h1>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Время указано по вашему местному часовому поясу • Смотрите также <Link to="/season" className="link-accent">аниме сезона</Link>
              </p>
            </div>
          </div>
        </header>

        <div className="schedule-controls">
          <div className="schedule-filter" role="group" aria-label="Фильтрация">
            <button
              type="button"
              className={`pill${onlyMine ? '' : ' active'}`}
              aria-pressed={!onlyMine}
              onClick={() => setParams({}, { replace: true })}
            >
              Все онгоинги
            </button>
            {mineCount > 0 && (
              <button
                type="button"
                className={`pill${onlyMine ? ' active' : ''}`}
                aria-pressed={onlyMine}
                onClick={() => setParams({ mine: '1' }, { replace: true })}
              >
                Из моего списка <span className="pill__count">{mineCount}</span>
              </button>
            )}
          </div>

          <div className="schedule-view-mode" role="group" aria-label="Режим отображения">
            <button
              type="button"
              className={viewMode === 'day' ? 'is-active' : ''}
              onClick={() => setViewMode('day')}
            >
              По дням
            </button>
            <button
              type="button"
              className={viewMode === 'week' ? 'is-active' : ''}
              onClick={() => setViewMode('week')}
            >
              Вся неделя
            </button>
          </div>
        </div>

        {days.length > 1 && (
          <nav className="schedule-tabs" aria-label="Выбор дня недели">
            {days.map((day) => {
              const k = dayKey(day.date)
              const isToday = k === todayKey
              const isActive = k === activeDayKey
              return (
                <button
                  key={k}
                  type="button"
                  className={`schedule-tab ${isToday ? 'is-today' : ''} ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedDayKey(k)
                    if (viewMode === 'week') {
                      document.getElementById(`day-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                >
                  <span className="schedule-tab__weekday">
                    {isToday ? 'Сегодня' : weekdayShort.format(day.date)}
                  </span>
                  <span className="schedule-tab__date">{dateShort.format(day.date)}</span>
                  <span className="schedule-tab__badge">{day.items.length}</span>
                </button>
              )
            })}
          </nav>
        )}

        {result.loading && !result.value ? (
          <div className="schedule-grid" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : result.value?.demo ? (
          <p className="notice" role="status">
            Не удалось загрузить живые данные Shikimori. Используются резервные данные расписания.
          </p>
        ) : days.length === 0 ? (
          <div className="empty-card">
            <Mascot />
            <h2>В выбранные дни релизов нет</h2>
            <p className="muted">Попробуйте отключить фильтр «Из моего списка» или проверьте каталог.</p>
            <div className="actions">
              <button type="button" className="btn btn--accent" onClick={() => setParams({}, { replace: true })}>
                Показать все онгоинги
              </button>
              <Link to="/catalog" className="btn btn--ghost">
                Каталог
              </Link>
            </div>
          </div>
        ) : viewMode === 'day' && activeDay ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                {dayTitle(activeDay.date)}
              </h2>
              <span className="muted" style={{ fontSize: '13px' }}>
                {activeDay.items.length} релизов
              </span>
            </div>

            <div className="schedule-grid">
              {activeDay.items.map((item) => {
                const isPast = item.at.getTime() < now
                const isSoon = !isPast && item.at.getTime() - now < 3 * 3600_000
                const isMine = mine.has(item.anime.id)

                return (
                  <Link
                    key={`${item.anime.id}-${item.episode}`}
                    to={`/anime/${item.anime.id}`}
                    className={`schedule-card ${isMine ? 'schedule-card--mine' : ''}`}
                  >
                    <div className="schedule-card__art" style={{ background: item.anime.posterFill }}>
                      <Poster anime={item.anime} />
                    </div>
                    <div className="schedule-card__body">
                      <div>
                        <div className="schedule-card__top">
                          <span className="schedule-card__time">
                            ⏱ {timeFormat.format(item.at)}
                          </span>
                          <span className={`schedule-card__status ${isSoon ? 'schedule-card__status--soon' : ''}`}>
                            {isPast ? 'Вышла' : isSoon ? untilLabel(item.at.getTime() - now) : 'Ожидается'}
                          </span>
                        </div>
                        <h3 className="schedule-card__title">{item.anime.title}</h3>
                      </div>
                      <div className="schedule-card__bottom">
                        <span className="schedule-card__episode">
                          Серия {item.episode}
                          {item.anime.episodes ? ` из ${item.anime.episodes}` : ''}
                        </span>
                        {isMine && (
                          <span className="schedule-card__mine-tag">
                            ✓ В списке
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="schedule-week">
            {days.map((day) => (
              <section key={dayKey(day.date)} id={`day-${dayKey(day.date)}`} className="schedule-week-day">
                <h2 className="schedule-week-day__title">
                  <span>{dayTitle(day.date)}</span>
                  <span className="schedule-week-day__badge">{day.items.length}</span>
                </h2>
                <div className="schedule-grid">
                  {day.items.map((item) => {
                    const isPast = item.at.getTime() < now
                    const isSoon = !isPast && item.at.getTime() - now < 3 * 3600_000
                    const isMine = mine.has(item.anime.id)

                    return (
                      <Link
                        key={`${item.anime.id}-${item.episode}`}
                        to={`/anime/${item.anime.id}`}
                        className={`schedule-card ${isMine ? 'schedule-card--mine' : ''}`}
                      >
                        <div className="schedule-card__art" style={{ background: item.anime.posterFill }}>
                          <Poster anime={item.anime} />
                        </div>
                        <div className="schedule-card__body">
                          <div>
                            <div className="schedule-card__top">
                              <span className="schedule-card__time">
                                ⏱ {timeFormat.format(item.at)}
                              </span>
                              <span className={`schedule-card__status ${isSoon ? 'schedule-card__status--soon' : ''}`}>
                                {isPast ? 'Вышла' : isSoon ? untilLabel(item.at.getTime() - now) : 'Ожидается'}
                              </span>
                            </div>
                            <h3 className="schedule-card__title">{item.anime.title}</h3>
                          </div>
                          <div className="schedule-card__bottom">
                            <span className="schedule-card__episode">
                              Серия {item.episode}
                              {item.anime.episodes ? ` из ${item.anime.episodes}` : ''}
                            </span>
                            {isMine && (
                              <span className="schedule-card__mine-tag">
                                ✓ В списке
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

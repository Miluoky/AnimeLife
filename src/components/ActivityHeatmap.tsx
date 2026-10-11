import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { dayKey, watchLogStore } from '../data/watchLog'
import './activity-heatmap.css'

const WEEKS = 53
const DAY = 86_400_000
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short' })
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const plural = (n: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('ru').select(n)
  return form === 'one' ? one : form === 'few' ? few : many
}

/** Уровень клетки 0–4: 1 серия, 2–3, 4–6, 7 и больше. */
const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4)

/** Серии подряд по дням: текущая серия (сегодня или вчера) и лучшая. */
function streaks(days: Set<string>, today: Date) {
  let best = 0
  let run = 0
  const sorted = [...days].sort()
  let prev: number | undefined
  for (const d of sorted) {
    const t = Date.parse(`${d}T12:00:00`)
    run = prev !== undefined && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  let current = 0
  const cursor = new Date(today)
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor.getTime()))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { current, best }
}

/**
 * Карта активности за год, как на AniList и GitHub: клетка — день, цвет — сколько серий посмотрено.
 * Данные из журнала просмотра в браузере (anime.watchlog.v1), тот же, что у «Итогов года».
 */
export default function ActivityHeatmap() {
  const log = watchLogStore.use()
  const scroller = useRef<HTMLDivElement>(null)

  // На узком экране сразу видно последние недели, а не прошлогодние.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const counts = new Map<string, number>()
  for (const e of log.entries) counts.set(e.d, (counts.get(e.d) ?? 0) + 1)

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  // Неделя с понедельника: последняя колонка — текущая неделя.
  const weekday = (today.getDay() + 6) % 7
  const start = new Date(today.getTime() - (weekday + (WEEKS - 1) * 7) * DAY)
  const cells: { key: string; date: Date; count: number; future: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const date = new Date(start.getTime() + i * DAY)
    const key = dayKey(date.getTime())
    cells.push({ key, date, count: counts.get(key) ?? 0, future: date > today })
  }
  const months: { col: number; label: string }[] = []
  for (let w = 0; w < WEEKS; w++) {
    const d = cells[w * 7].date
    if (d.getDate() <= 7 && w > 0) months.push({ col: w, label: monthFormat.format(d).replace('.', '') })
  }

  const yearCells = cells.filter((c) => !c.future)
  const total = yearCells.reduce((n, c) => n + c.count, 0)
  const active = new Set(log.entries.map((e) => e.d))
  const { current, best } = streaks(active, today)

  return (
    <section className="stack heatmap" aria-label="Активность за год">
      <div className="heatmap__head">
        <h3>Активность за год</h3>
        <p className="muted heatmap__sum">
          {total} {plural(total, 'серия', 'серии', 'серий')} · подряд {current} {plural(current, 'день', 'дня', 'дней')}
          {best > current ? ` · рекорд ${best}` : ''}
        </p>
      </div>
      <div className="heatmap__scroll" ref={scroller}>
        <div className="heatmap__grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, var(--hm-cell))` }}>
          {months.map((m) => (
            <span key={m.col} className="heatmap__month" style={{ gridColumn: m.col + 1 }}>
              {m.label}
            </span>
          ))}
          {cells.map((c, i) => (
            <span
              key={c.key}
              className={`heatmap__cell heatmap__cell--${c.future ? 'none' : level(c.count)}`}
              style={{ gridColumn: Math.floor(i / 7) + 1, gridRow: (i % 7) + 2 }}
              title={c.future ? undefined : `${dateFormat.format(c.date)}: ${c.count ? `${c.count} ${plural(c.count, 'серия', 'серии', 'серий')}` : 'ничего'}`}
            />
          ))}
        </div>
      </div>
      <div className="heatmap__foot muted">
        {total === 0 ? (
          <span>
            Клетки закрасятся, когда начнёте смотреть. <Link to="/watching">Что посмотреть сейчас</Link>
          </span>
        ) : (
          <Link to="/recap">Итоги года</Link>
        )}
        <span className="heatmap__legend" aria-hidden="true">
          меньше
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heatmap__cell heatmap__cell--${l}`} />
          ))}
          больше
        </span>
      </div>
    </section>
  )
}

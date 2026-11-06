import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { dayKey, watchLogStore, type LogEntry } from '../data/watchLog'
import { useMyList } from '../data/myList'
import { useSeasonPlan } from '../data/seasonPlan'
import { currentSeason, SEASON_LABELS, seasonCode } from '../api/season'

const DAY_MS = 86_400_000

export interface StreakStats {
  current: number
  best: number
  totalDays: number
  totalEpisodes: number
  todayWatched: boolean
  last7Days: { date: string; dayName: string; watched: boolean; count: number }[]
}

/**
 * Подсчет активного и рекордного стрика просмотров по дням из watchLog.
 */
export function calculateStreaks(entries: LogEntry[], now = new Date()): StreakStats {
  const countsByDay = new Map<string, number>()
  for (const e of entries) {
    countsByDay.set(e.d, (countsByDay.get(e.d) ?? 0) + 1)
  }

  const daysSet = new Set(countsByDay.keys())
  const sortedDays = [...daysSet].sort()

  let best = 0
  let run = 0
  let prevTime: number | undefined

  for (const d of sortedDays) {
    const t = Date.parse(`${d}T12:00:00`)
    run = prevTime !== undefined && Math.round((t - prevTime) / DAY_MS) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prevTime = t
  }

  const todayKey = dayKey(now.getTime())
  const todayWatched = daysSet.has(todayKey)

  let current = 0
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)

  // Если сегодня еще ничего не смотрели, проверяем, был ли просмотр вчера (чтобы не сбрасывать стрик преждевременно)
  if (!todayWatched) {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (daysSet.has(dayKey(cursor.getTime()))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  // Трекер последних 7 дней
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const last7Days: StreakStats['last7Days'] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS)
    const k = dayKey(d.getTime())
    const cnt = countsByDay.get(k) ?? 0
    last7Days.push({
      date: k,
      dayName: dayNames[d.getDay()],
      watched: cnt > 0,
      count: cnt,
    })
  }

  return {
    current,
    best,
    totalDays: daysSet.size,
    totalEpisodes: entries.length,
    todayWatched,
    last7Days,
  }
}

export interface WatchStreakProps {
  currentAnimeId?: string
  className?: string
  compact?: boolean
  showSeasonProgress?: boolean
}

export default function WatchStreak({
  currentAnimeId,
  className = '',
  compact = false,
  showSeasonProgress = true,
}: WatchStreakProps) {
  const log = watchLogStore.use()
  const myList = useMyList()
  const seasonPlans = useSeasonPlan()

  const stats = useMemo(() => calculateStreaks(log.entries), [log.entries])

  const isCurrentWatched = useMemo(() => {
    return Boolean(currentAnimeId && log.entries.some((e) => e.a === currentAnimeId))
  }, [currentAnimeId, log.entries])

  // Расчет прогресса просмотра текущего сезона
  const seasonInfo = useMemo(() => {
    const season = currentSeason()
    const code = seasonCode(season)
    const label = `${SEASON_LABELS[season.name]} ${season.year}`

    const plannedTitles = seasonPlans[code] ?? []
    const plannedIds = new Set(plannedTitles.map((p) => p.id))
    const byId = new Map(myList.map((item) => [item.anime.id, item]))

    // Тайтлы того же года в «Смотрю» / «Просмотрено», которых нет в сетке, тоже входят в прогресс.
    const extras = myList.filter(
      (item) =>
        !plannedIds.has(item.anime.id) &&
        item.anime.year === season.year &&
        (item.status === 'watching' || item.status === 'completed'),
    )

    let totalEpisodes = 0
    let watchedEpisodes = 0

    for (const plan of plannedTitles) {
      const entry = byId.get(plan.id)
      const epTotal = plan.episodes || entry?.anime.episodes || 12
      totalEpisodes += epTotal
      const seen = entry?.status === 'completed' ? epTotal : entry?.watched || 0
      watchedEpisodes += Math.min(seen, epTotal)
    }

    for (const item of extras) {
      const epTotal = item.anime.episodes || 12
      totalEpisodes += epTotal
      const seen = item.status === 'completed' ? epTotal : item.watched || 0
      watchedEpisodes += Math.min(seen, epTotal)
    }

    const pct = totalEpisodes > 0 ? Math.round((watchedEpisodes / totalEpisodes) * 100) : 0

    return {
      label,
      code,
      titleCount: plannedTitles.length > 0 ? plannedTitles.length : extras.length,
      watchedEpisodes,
      totalEpisodes,
      percentage: Math.min(100, pct),
    }
  }, [myList, seasonPlans])

  const pluralDays = (n: number) => {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod100 >= 11 && mod100 <= 19) return 'дней'
    if (mod10 === 1) return 'день'
    if (mod10 >= 2 && mod10 <= 4) return 'дня'
    return 'дней'
  }

  if (compact) {
    return (
      <div
        className={`watch-streak-compact ${className}`}
        title={`Стрик просмотров: ${stats.current} ${pluralDays(stats.current)} подряд (Рекорд: ${stats.best})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: stats.current > 0 ? 'color-mix(in srgb, var(--accent) 15%, var(--surface))' : 'var(--surface-2)',
          border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--line))',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: stats.current > 0 ? 'var(--accent)' : 'var(--text-soft)',
        }}
      >
        <span aria-hidden="true">🔥</span>
        <span>{stats.current} {pluralDays(stats.current)}</span>
      </div>
    )
  }

  return (
    <section
      className={`watch-streak-card ${className}`}
      aria-label="Удержание и стрик просмотров"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
            aria-hidden="true"
          >
            🔥
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
              Стрик просмотров:{' '}
              <span style={{ color: 'var(--accent)' }}>
                {stats.current} {pluralDays(stats.current)}
              </span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              {stats.best > stats.current ? `Лучший рекорд: ${stats.best} ${pluralDays(stats.best)}` : 'Ваш персональный рекорд!'}
            </span>
          </div>
        </div>

        <div
          style={{
            fontSize: '0.8rem',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            background: stats.todayWatched ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 146, 60, 0.15)',
            color: stats.todayWatched ? '#4ade80' : '#fb923c',
            fontWeight: 500,
          }}
        >
          {stats.todayWatched ? '✓ Серия сегодня зачтена' : 'Смотрите сегодня, чтобы продлить!'}
        </div>
      </div>

      {currentAnimeId && (
        <div style={{ fontSize: '0.8rem', color: isCurrentWatched ? 'var(--accent)' : 'var(--text-soft)' }}>
          {isCurrentWatched ? '✨ Этот тайтл уже отмечен в вашей активности' : '🎬 Серия пополнит ваш стрик просмотров'}
        </div>
      )}

      {/* Мини-трекер активности за последние 7 дней */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
        {stats.last7Days.map((day, idx) => {
          const isToday = idx === 6
          return (
            <div
              key={day.date}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 2px',
                borderRadius: 'var(--radius-sm)',
                background: day.watched
                  ? 'color-mix(in srgb, var(--accent) 22%, var(--surface-2))'
                  : 'var(--surface-2)',
                border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
              }}
              title={`${day.date}: ${day.count} серий`}
            >
              <span style={{ fontSize: '0.7rem', color: isToday ? 'var(--accent)' : 'var(--text-soft)', fontWeight: isToday ? 700 : 500 }}>
                {isToday ? 'Сегодня' : day.dayName}
              </span>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: day.watched ? 'var(--accent)' : 'var(--line)',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Прогресс просмотра тайтлов текущего сезона */}
      {showSeasonProgress && seasonInfo.titleCount > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-soft)' }}>
              Прогресс сезона: <strong style={{ color: 'var(--text)' }}>{seasonInfo.label}</strong>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)' }}>
              {seasonInfo.watchedEpisodes} / {seasonInfo.totalEpisodes} ({seasonInfo.percentage}%)
            </span>
          </div>

          <div
            style={{
              height: '6px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${seasonInfo.percentage}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--accent-soft))',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s var(--ease)',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)' }}>
              В вашей сетке: {seasonInfo.titleCount} тайтл{seasonInfo.titleCount === 1 ? '' : seasonInfo.titleCount < 5 ? 'а' : 'ов'}
            </span>
            <Link
              to={`/season?s=${seasonInfo.code}`}
              style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
            >
              Чарт сезона →
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

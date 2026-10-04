import { useEffect, useState } from 'react'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Таймер до следующей серии онгоинга: дни, часы, минуты и секунды плюс дата по местному времени.
 * Время берём из расписания Shikimori; если оно давно прошло (расписание не обновили), блок не показываем.
 */
export default function NextEpisode({ at, episode }: { at: string; episode: number }) {
  const target = new Date(at).getTime()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!Number.isFinite(target) || now - target > 24 * 3600 * 1000) return null
  const left = Math.max(0, Math.floor((target - now) / 1000))
  const parts: [number, string][] = [
    [Math.floor(left / 86400), 'дн'],
    [Math.floor((left % 86400) / 3600), 'ч'],
    [Math.floor((left % 3600) / 60), 'мин'],
    [left % 60, 'сек'],
  ]

  return (
    <div className="next-ep" role="timer" aria-label={`Серия ${episode}: ${dateFormat.format(target)}`}>
      <div className="next-ep__head">
        <span className="next-ep__dot" aria-hidden="true" />
        {left ? `Серия ${episode} выйдет через` : `Серия ${episode} вот-вот выйдет`}
      </div>
      {left > 0 && (
        <div className="next-ep__clock" aria-hidden="true">
          {parts.map(([value, unit], i) => (
            <span key={unit} className="next-ep__part">
              <b>{i ? pad(value) : value}</b>
              <small>{unit}</small>
            </span>
          ))}
        </div>
      )}
      <div className="next-ep__date muted">{dateFormat.format(target)}</div>
    </div>
  )
}

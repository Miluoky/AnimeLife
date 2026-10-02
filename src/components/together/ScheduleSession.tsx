import { useEffect, useState } from 'react'
import { serverNow, type Room } from '../../data/rooms'
import { CalendarIcon } from '../Icons'
import { download, icsFile } from './ics'

const timeFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function untilText(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `через ${min} мин`
  const h = Math.floor(min / 60)
  if (h < 24) return `через ${h} ч ${min % 60} мин`
  return `через ${Math.round(h / 24)} дн`
}

/** Значение для <input type="datetime-local"> в местном времени. */
const localInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

/** Сеанс по расписанию: ведущий назначает время, остальные видят обратный отсчёт и добавляют в календарь. */
export default function ScheduleSession({
  room,
  isHost,
  onChange,
}: {
  room: Room
  isHost: boolean
  onChange: (startsAt: number | null) => void
}) {
  const [, tick] = useState(0)
  const [value, setValue] = useState(() => localInput(room.startsAt ?? Date.now() + 3600_000))
  const upcoming = !!room.startsAt && room.startsAt > serverNow()

  useEffect(() => {
    if (!upcoming) return
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [upcoming])

  const addToCalendar = () =>
    download(
      icsFile({
        title: `Смотрим вместе: ${room.title || room.animeTitle}`,
        start: room.startsAt!,
        minutes: 30,
        url: `${location.origin}${import.meta.env.BASE_URL}together/${room.$id}`,
        description: `${room.animeTitle}, серия ${room.episode}. Комната ${room.$id} на Anime Life.`,
      }),
      `anime-life-${room.$id}.ics`,
    )

  if (!upcoming && !isHost) return null
  return (
    <div className={`schedule-card${upcoming ? ' schedule-card--on' : ''}`}>
      <CalendarIcon size={22} />
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 200 }}>
        {upcoming ? (
          <>
            <strong>Сеанс {timeFmt.format(room.startsAt!)}</strong>
            <span className="muted">{untilText(room.startsAt! - serverNow())}. Заходите заранее, чат уже открыт.</span>
          </>
        ) : (
          <>
            <strong>Сеанс по расписанию</strong>
            <span className="muted">Назначьте время: комната появится во «Вместе» в разделе «Скоро».</span>
          </>
        )}
      </div>
      <div className="actions">
        {upcoming && (
          <button type="button" className="btn btn--ghost btn--small" onClick={addToCalendar}>
            В календарь
          </button>
        )}
        {isHost && (
          <>
            <input
              type="datetime-local"
              className="schedule-card__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Время сеанса"
            />
            <button
              type="button"
              className="btn btn--accent btn--small"
              onClick={() => value && onChange(new Date(value).getTime())}
            >
              {upcoming ? 'Перенести' : 'Назначить'}
            </button>
            {upcoming && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(null)}>
                Убрать
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

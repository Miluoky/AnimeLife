/** Файлы .ics для календаря телефона, Google и Apple Calendar: напоминание за 10 минут до начала. */
export interface CalendarEvent {
  title: string
  start: number
  minutes: number
  url: string
  description?: string
  /** постоянный ID: повторный импорт обновит событие, а не создаст копию */
  uid?: string
}

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const escape = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

export function icsCalendar(events: CalendarEvent[], name = 'Anime Life') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anime Life//RU', `X-WR-CALNAME:${escape(name)}`]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid ?? `${e.start}-${Math.random().toString(36).slice(2)}`}@anime-life`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.start + e.minutes * 60_000)}`,
      `SUMMARY:${escape(e.title)}`,
      `DESCRIPTION:${escape(e.description ?? e.url)}`,
      `URL:${e.url}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(e.title)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
}

export const icsFile = (e: CalendarEvent) => icsCalendar([e], e.title)

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Абсолютная ссылка на страницу сайта. */
export const siteUrl = (path: string) => `${location.origin}${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

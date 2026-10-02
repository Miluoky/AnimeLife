/** Файл .ics для календаря телефона или Google/Apple Calendar: одно событие с напоминанием за 10 минут. */
export function icsFile(e: { title: string; start: number; minutes: number; url: string; description?: string }) {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const escape = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anime Life//RU',
    'BEGIN:VEVENT',
    `UID:${e.start}-${Math.random().toString(36).slice(2)}@anime-life`,
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
    'END:VCALENDAR',
  ]
  return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

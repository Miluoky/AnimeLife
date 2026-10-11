import { useEffect, useRef, useState } from 'react'
import { setEntryDetails, todayIso, type ListEntry } from '../data/myList'

const NOTE_MAX = 500

/**
 * «Моя запись», как редактор списка в AniList и MAL: личная заметка, сколько раз пересматривали,
 * даты начала и конца. Даты ставятся сами по статусу, их можно поправить. Видно только вам.
 */
export default function MyEntry({ entry }: { entry: ListEntry }) {
  const id = entry.anime.id
  const [note, setNote] = useState(entry.note ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  // Запись поменялась на другом устройстве или в другой вкладке: показываем свежую заметку.
  useEffect(() => setNote(entry.note ?? ''), [entry.note])
  useEffect(() => () => clearTimeout(timer.current), [])

  const saveNote = (text: string) => {
    clearTimeout(timer.current)
    if (text.trim() !== (entry.note ?? '')) setEntryDetails(id, { note: text.trim() || undefined })
  }
  const rewatches = entry.rewatches ?? 0
  const filled = [entry.note, entry.rewatches, entry.startedOn, entry.finishedOn].filter(Boolean).length

  return (
    <details className="my-entry">
      <summary>
        Моя запись
        <span className="muted">{filled ? ` · ${summaryText(entry)}` : ' · заметка, даты, пересмотры'}</span>
      </summary>
      <div className="my-entry__body">
        <label className="my-entry__note">
          <span>Заметка для себя</span>
          <textarea
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Где остановились, кто советовал, что понравилось"
            onChange={(e) => {
              const text = e.target.value
              setNote(text)
              clearTimeout(timer.current)
              timer.current = setTimeout(() => saveNote(text), 800)
            }}
            onBlur={(e) => saveNote(e.target.value)}
          />
        </label>
        <div className="my-entry__row">
          <label>
            <span>Начало просмотра</span>
            <input
              type="date"
              value={entry.startedOn ?? ''}
              max={todayIso()}
              onChange={(e) => setEntryDetails(id, { startedOn: e.target.value || undefined })}
            />
          </label>
          <label>
            <span>Конец просмотра</span>
            <input
              type="date"
              value={entry.finishedOn ?? ''}
              min={entry.startedOn}
              max={todayIso()}
              onChange={(e) => setEntryDetails(id, { finishedOn: e.target.value || undefined })}
            />
          </label>
          <div className="my-entry__rewatch" role="group" aria-label="Пересмотры">
            <span>Пересмотрено</span>
            <div>
              <button
                type="button"
                className="progress__btn"
                disabled={!rewatches}
                aria-label="Минус пересмотр"
                onClick={() => setEntryDetails(id, { rewatches: rewatches - 1 || undefined })}
              >
                −
              </button>
              <output aria-live="polite">{rewatches} раз</output>
              <button
                type="button"
                className="progress__btn progress__btn--plus"
                aria-label="Плюс пересмотр"
                onClick={() => setEntryDetails(id, { rewatches: rewatches + 1 })}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}

const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' })
const dateYear = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' })
// Год пишем, только если он не текущий: в свёрнутой строке мало места.
const fmt = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return (d.getFullYear() === new Date().getFullYear() ? date : dateYear).format(d)
}

function summaryText(e: ListEntry) {
  const parts: string[] = []
  if (e.startedOn && e.finishedOn) parts.push(`${fmt(e.startedOn)} – ${fmt(e.finishedOn)}`)
  else if (e.startedOn) parts.push(`с ${fmt(e.startedOn)}`)
  else if (e.finishedOn) parts.push(`досмотрено ${fmt(e.finishedOn)}`)
  if (e.rewatches) parts.push(`пересмотрено ${e.rewatches} раз`)
  if (e.note) parts.push('есть заметка')
  return parts.join(' · ')
}

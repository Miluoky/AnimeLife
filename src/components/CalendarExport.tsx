import { useState } from 'react'
import { loadSchedule } from '../api'
import { useMyList } from '../data/myList'
import { toast } from '../data/toast'
import { CalendarIcon } from './Icons'

/** Ближайшие серии онгоингов из «Смотрю» и «Буду смотреть» одним файлом для календаря (как в LiveChart). */
export default function CalendarExport() {
  const list = useMyList()
  const [busy, setBusy] = useState(false)

  const make = async () => {
    setBusy(true)
    try {
      const ids = new Set(list.filter((e) => e.status === 'watching' || e.status === 'planned').map((e) => e.anime.id))
      const [{ data }, { icsCalendar, download, siteUrl }] = await Promise.all([loadSchedule(), import('../data/ics')])
      const items = data.filter((i) => ids.has(i.anime.id))
      if (!items.length) {
        toast('В «Смотрю» и «Буду смотреть» нет онгоингов с датой следующей серии')
        return
      }
      const blob = icsCalendar(
        items.map((i) => ({
          uid: `${i.anime.id}-${i.episode}`,
          title: `${i.anime.title}: серия ${i.episode}`,
          start: i.at.getTime(),
          minutes: i.anime.episodeMinutes ?? 24,
          url: siteUrl(`/anime/${i.anime.id}`),
        })),
        'Anime Life: мои онгоинги',
      )
      download(blob, 'anime-life-ongoings.ics')
      toast(`В календарь: ${items.length} ближайших серий`)
    } catch {
      toast('Не удалось получить расписание, попробуйте позже')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn btn--ghost btn--small" onClick={make} disabled={busy}>
      <CalendarIcon size={16} />
      {busy ? 'Собираем…' : 'Мои онгоинги в календарь'}
    </button>
  )
}

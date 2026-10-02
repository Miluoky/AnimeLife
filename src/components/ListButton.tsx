import { listStatuses, setListStatus, useMyList, type ListStatus } from '../data/myList'
import type { Anime } from '../data/catalog'

/** Выбор статуса в «Моём списке». Обычный select: работает с клавиатуры и на телефоне. */
export default function ListButton({ anime }: { anime: Anime }) {
  const list = useMyList()
  const current = list.find((e) => e.anime.id === anime.id)?.status

  return (
    <label className={`btn btn--ghost list-select${current ? ' in-list' : ''}`}>
      <span className="sr-only">Статус в моём списке</span>
      <select
        value={current ?? ''}
        onChange={(e) => setListStatus(anime, (e.target.value || undefined) as ListStatus | undefined)}
      >
        <option value="">{current ? 'Убрать из списка' : '+ В мой список'}</option>
        {listStatuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </label>
  )
}

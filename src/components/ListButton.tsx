import { listStatuses, setListRating, setListStatus, useMyList, type ListStatus } from '../data/myList'
import type { Anime } from '../data/catalog'
import { toast } from '../data/toast'

/** Выбор статуса в «Моём списке» и своя оценка. Обычные select: работают с клавиатуры и на телефоне. */
export default function ListButton({ anime }: { anime: Anime }) {
  const list = useMyList()
  const entry = list.find((e) => e.anime.id === anime.id)
  const current = entry?.status

  return (
    <>
      <label className={`btn btn--ghost list-select${current ? ' in-list' : ''}`}>
        <span className="sr-only">Статус в моём списке</span>
        <select
          value={current ?? ''}
          onChange={(e) => {
            const next = (e.target.value || undefined) as ListStatus | undefined
            const prev = current
            setListStatus(anime, next)
            const title = next && listStatuses.find((s) => s.id === next)?.title
            toast(title ? `${anime.title}: «${title}»` : `${anime.title} убран из списка`, {
              label: 'Отменить',
              onClick: () => setListStatus(anime, prev),
            })
          }}
        >
          <option value="">{current ? 'Убрать из списка' : '+ В мой список'}</option>
          {listStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      {entry && (
        <label className={`btn btn--ghost list-select${entry.rating ? ' in-list' : ''}`}>
          <span className="sr-only">Моя оценка</span>
          <select
            value={entry.rating ?? ''}
            onChange={(e) => setListRating(anime.id, Number(e.target.value) || undefined)}
          >
            <option value="">{entry.rating ? 'Убрать оценку' : '★ Оценить'}</option>
            {ratings.map((r) => (
              <option key={r} value={r}>
                ★ {r} — {ratingTitles[r]}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

const ratings = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

export const ratingTitles: Record<number, string> = {
  10: 'шедевр',
  9: 'великолепно',
  8: 'очень хорошо',
  7: 'хорошо',
  6: 'неплохо',
  5: 'средне',
  4: 'так себе',
  3: 'плохо',
  2: 'очень плохо',
  1: 'ужасно',
}

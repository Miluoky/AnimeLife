import './tracking.css'
import { listStatuses, restoreEntry, setWatched, totalEpisodes, type ListEntry } from '../data/myList'
import { toast } from '../data/toast'
import { PlusIcon } from './Icons'

/**
 * Сколько серий просмотрено и кнопка «+1 серия» (как в Shikimori и AniList): одним нажатием,
 * без захода в плеер. Последняя серия переносит тайтл в «Просмотрено», с отменой.
 */
export default function EpisodeProgress({ entry, compact }: { entry: ListEntry; compact?: boolean }) {
  const watched = entry.watched ?? (entry.status === 'completed' ? (entry.anime.episodes ?? 0) : 0)
  const total = totalEpisodes(entry.anime)
  const done = !!total && watched >= total && !entry.anime.ongoing
  const percent = total ? Math.min(100, (watched / total) * 100) : 0

  const change = (n: number) => {
    const status = setWatched(entry.anime.id, n)
    if (status) {
      const title = listStatuses.find((s) => s.id === status)?.title
      toast(`${entry.anime.title}: «${title}»`, {
        label: 'Отменить',
        onClick: () => restoreEntry(entry),
      })
    }
  }

  return (
    <div className={`progress${compact ? ' progress--compact' : ''}`}>
      <div
        className="progress__bar"
        role="progressbar"
        aria-label="Просмотрено серий"
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={watched}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="progress__text">
        {watched}
        {total ? ` / ${total}` : ''} {compact ? 'эп.' : 'серий'}
      </span>
      {!compact && watched > 0 && (
        <button type="button" className="progress__btn" onClick={() => change(watched - 1)} aria-label="Минус серия">
          −
        </button>
      )}
      {!done && (
        <button
          type="button"
          className="progress__btn progress__btn--plus"
          onClick={() => change(watched + 1)}
          aria-label={`Отметить серию ${watched + 1} просмотренной`}
          title="+1 серия"
        >
          <PlusIcon size={14} />1
        </button>
      )}
    </div>
  )
}

import { Link } from 'react-router-dom'
import { useMyList, type ListStatus } from '../data/myList'
import './offline.css'

const SOFT: ListStatus[] = ['watching', 'planned', 'on_hold']

/**
 * Полка из «Моего списка», когда сети нет: постеры и названия уже в браузере.
 * На «Смотрю» сначала то, что в процессе и в планах.
 */
export default function OfflineShelf({
  lead = false,
  preferSoft = false,
  limit = 18,
}: {
  /** Заголовок «Ваша полка доступна офлайн». */
  lead?: boolean
  preferSoft?: boolean
  limit?: number
}) {
  const all = useMyList()
  const soft = all.filter((e) => SOFT.includes(e.status))
  const items = (preferSoft && soft.length ? soft : all).slice(0, limit)
  if (!lead && !items.length) return null
  return (
    <section className="offline-shelf" aria-label="Полка офлайн">
      {lead && (
        <p className="notice" role="status">
          Ваша полка доступна офлайн
        </p>
      )}
      {items.length > 0 && (
        <div className="offline-shelf__row">
          {items.map((e) => {
            const src = e.anime.posterSmall || e.anime.posterUrl
            return (
              <Link key={e.anime.id} to={`/anime/${e.anime.id}`} className="offline-shelf__item">
                <span className="offline-shelf__poster" style={{ background: e.anime.posterFill }}>
                  {src && <img src={src} alt="" />}
                </span>
                <span className="offline-shelf__name">{e.anime.title}</span>
              </Link>
            )
          })}
        </div>
      )}
      {lead && !items.length && <p className="muted">В этом браузере полка пока пуста.</p>}
    </section>
  )
}

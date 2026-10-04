import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchFranchise } from '../api/franchise'
import { PlayIcon } from './Icons'

/**
 * На последней серии: что смотреть дальше по франшизе. Берём следующую по дате основную часть
 * (сериал, фильм или ONA), OVA и спецвыпуски пропускаем, как в «Порядке просмотра».
 */
export default function NextPart({ animeId }: { animeId: string }) {
  const franchise = useAsync(() => fetchFranchise(animeId).catch(() => []), [animeId])
  const list = franchise.value ?? []
  const at = list.findIndex((e) => e.id === animeId)
  const next = at >= 0 ? list.slice(at + 1).find((e) => e.main) : undefined
  if (!next) return null
  return (
    <aside className="next-part" aria-label="Следующая часть">
      <Link to={`/anime/${next.id}`} className="next-part__poster">
        {next.poster && <img src={next.poster} srcSet={next.poster2x ? `${next.poster} 1x, ${next.poster2x} 2x` : undefined} alt="" loading="lazy" />}
      </Link>
      <div className="next-part__text">
        <span className="next-part__eyebrow">Это последняя серия. Дальше по порядку</span>
        <Link to={`/anime/${next.id}`} className="next-part__title">
          {next.title}
        </Link>
        <span className="muted">{[next.year, next.kind].filter(Boolean).join(' · ')}</span>
      </div>
      <Link to={`/watch/${next.id}/1`} className="btn btn--accent next-part__go">
        <PlayIcon size={16} />
        Смотреть
      </Link>
    </aside>
  )
}

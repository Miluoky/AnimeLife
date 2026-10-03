import type { ReactNode } from 'react'
import { loadCatalog, useAsync, type CatalogQuery } from '../api'
import Shelf from './Shelf'
import PosterCard from './PosterCard'
import { CalendarIcon, ClockIcon, TrophyIcon } from './Icons'

const SHELF_SIZE = 16
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter']
const SEASON_NAMES: Record<string, string> = { winter: 'Зима', spring: 'Весна', summer: 'Лето', fall: 'Осень' }

/** Текущий аниме-сезон в формате Shikimori (fall_2026). Декабрь уже относится к зиме следующего года. */
export function currentSeason(now = new Date()) {
  const name = SEASONS[now.getMonth()]
  const year = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0)
  return { code: `${name}_${year}`, label: `${SEASON_NAMES[name]} ${year}` }
}

/** Полка постеров по запросу к каталогу. Пустую (API ничего не вернуло) не показываем совсем. */
function CatalogShelf({
  title,
  subtitle,
  icon,
  query,
  more,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  query: Omit<CatalogQuery, 'page' | 'limit'>
  more?: string
}) {
  const list = useAsync(() => loadCatalog({ ...query, limit: SHELF_SIZE }), [])
  const items = list.value?.data ?? []
  if (!list.loading && !items.length) return null
  return (
    <Shelf title={title} subtitle={subtitle} icon={icon} more={more ? { to: more } : undefined}>
      {list.loading && !items.length
        ? Array.from({ length: 6 }, (_, i) => <div key={i} className="row-scroll__item poster-card__img skeleton" aria-hidden="true" />)
        : items.map((a) => (
            <div key={a.id} className="row-scroll__item">
              <PosterCard anime={a} />
            </div>
          ))}
    </Shelf>
  )
}

/** Премьеры текущего сезона: сразу под баннером. */
export function SeasonShelf() {
  const season = currentSeason()
  return (
    <CatalogShelf
      title={season.label}
      subtitle="Премьеры и продолжения этого сезона"
      icon={<CalendarIcon size={18} />}
      query={{ season: season.code }}
    />
  )
}

/** Анонсы и лучшее за всё время: после рекомендаций. */
export function MoreShelves() {
  return (
    <>
      <CatalogShelf title="Скоро выйдет" subtitle="Анонсы, которые ждут больше всего" icon={<ClockIcon />} query={{ status: 'anons' }} />
      <CatalogShelf
        title="Лучшее за всё время"
        subtitle="Самые высокие оценки зрителей"
        icon={<TrophyIcon />}
        query={{ order: 'ranked' }}
      />
    </>
  )
}

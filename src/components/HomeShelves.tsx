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
      {THEMES.map((t) => (
        <CatalogShelf
          key={t.slug}
          title={t.title}
          subtitle={t.subtitle}
          icon={<ThemeIcon d={t.icon} />}
          query={{ genre: t.genre, score: 7 }}
          more={`/genre/${t.slug}`}
        />
      ))}
    </>
  )
}

/** Тематические подборки по жанрам Shikimori: ссылка «Все» ведёт на посадочную жанра. */
const THEMES = [
  {
    slug: 'music',
    genre: 19,
    title: 'Музыка',
    subtitle: 'Аниме, где музыка в центре истории',
    icon: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  },
  {
    slug: 'sports',
    genre: 30,
    title: 'Спорт',
    subtitle: 'Тренировки, команды и решающие матчи',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  },
  {
    slug: 'romance',
    genre: 22,
    title: 'Романтика',
    subtitle: 'Истории о любви и первых чувствах',
    icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  },
  {
    slug: 'mystery',
    genre: 7,
    title: 'Детективы',
    subtitle: 'Загадки, расследования и неожиданные развязки',
    icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  },
  {
    slug: 'slice-of-life',
    genre: 36,
    title: 'Повседневность',
    subtitle: 'Спокойные истории на вечер',
    icon: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3',
  },
]

function ThemeIcon({ d }: { d: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

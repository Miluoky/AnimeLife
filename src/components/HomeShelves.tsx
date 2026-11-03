import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadCatalog, loadSchedule, useAsync, type CatalogQuery, type ScheduleItem } from '../api'
import Shelf from './Shelf'
import PosterCard, { Poster } from './PosterCard'
import { useMyList } from '../data/myList'
import { useHistory } from '../data/history'
import { CalendarIcon, ClockIcon, ListIcon, PlayIcon, SparkIcon, TrophyIcon } from './Icons'
import { GENRES } from '../data/seo'
import './genres.css'
import './bento.css'

const SHELF_SIZE = 16
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter']
const SEASON_NAMES: Record<string, string> = { winter: 'Зима', spring: 'Весна', summer: 'Лето', fall: 'Осень' }

export function currentSeason(now = new Date()) {
  const name = SEASONS[now.getMonth()]
  const year = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0)
  return { code: `${name}_${year}`, label: `${SEASON_NAMES[name]} ${year}` }
}

export function CatalogShelf({ eager, ...props }: Parameters<typeof LoadedShelf>[0] & { eager?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(!!eager)
  useEffect(() => {
    const el = box.current
    if (!el || near) return
    if (!('IntersectionObserver' in window)) return setNear(true)
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: `${Math.max(1200, Math.round(innerHeight * 2))}px 0px`,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return near ? <LoadedShelf {...props} /> : <div ref={box} style={{ height: 420 }} aria-hidden="true" />
}

function LoadedShelf({
  title,
  subtitle,
  icon,
  query,
  more,
  ranked,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  query: Omit<CatalogQuery, 'page' | 'limit'>
  more?: string
  ranked?: number
}) {
  const list = useAsync(() => loadCatalog({ ...query, limit: ranked ?? SHELF_SIZE }), [])
  const items = list.value?.data ?? []
  if (!list.loading && !items.length) return null
  return (
    <Shelf title={title} subtitle={subtitle} icon={icon} more={more ? { to: more } : undefined}>
      {list.loading && !items.length
        ? Array.from({ length: 6 }, (_, i) => <div key={i} className="row-scroll__item poster-card__img skeleton" aria-hidden="true" />)
        : items.map((a, i) =>
            ranked ? (
              <div key={a.id} className="row-scroll__item top-ten">
                <span className="top-ten__n" aria-hidden="true">
                  {i + 1}
                </span>
                <PosterCard anime={a} />
              </div>
            ) : (
              <div key={a.id} className="row-scroll__item">
                <PosterCard anime={a} />
              </div>
            ),
          )}
    </Shelf>
  )
}

const DAY = 24 * 60 * 60 * 1000
const time = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })

function whenLabel(at: Date, now = new Date()) {
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY)
  return `${days <= 0 ? 'сегодня' : days === 1 ? 'завтра' : at.toLocaleDateString('ru', { weekday: 'short' })} ${time.format(at)}`
}

function UpcomingShelf() {
  const schedule = useAsync(loadSchedule, [])
  const now = Date.now()
  const items = (schedule.value?.data ?? [])
    .filter((i) => i.at.getTime() > now && i.at.getTime() - now < DAY)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, SHELF_SIZE)
  if (items.length < 3) return null
  return (
    <Shelf title="Скоро в эфире" subtitle="Серии, которые выйдут в ближайшие сутки" icon={<PlayIcon size={18} />} more={{ to: '/schedule', label: 'Всё' }}>
      {items.map((i) => (
        <div key={`${i.anime.id}-${i.episode}`} className="row-scroll__item">
          <PosterCard anime={i.anime} tag={{ text: `${whenLabel(i.at)} • ${i.episode} эп.`, accent: true }} />
        </div>
      ))}
    </Shelf>
  )
}

export function NewEpisodesShelf() {
  const schedule = useAsync(loadSchedule, [])
  const list = useMyList()
  const history = useHistory()
  const now = Date.now()
  const items = list
    .filter((e) => e.status === 'watching')
    .flatMap((e) => {
      const next = schedule.value?.data.find((i) => i.anime.id === e.anime.id)
      if (!next) return []
      const aired = next.at.getTime() <= now ? next.episode : next.episode - 1
      const seen = history.find((h) => h.animeId === e.anime.id)
      const watched = Math.max(e.watched ?? 0, (seen?.episode ?? 1) - 1)
      return aired > watched ? [{ anime: { ...e.anime, ...next.anime }, fresh: aired - watched, aired }] : []
    })
  if (!items.length) return null
  return (
    <Shelf title="Новые серии в вашем списке" subtitle="Вышли, пока вас не было" icon={<PlayIcon size={18} />} more={{ to: '/my-list', label: 'Мой список' }}>
      {items.map((i) => (
        <div key={i.anime.id} className="row-scroll__item">
          <PosterCard anime={i.anime} tag={{ text: i.fresh > 1 ? `Новых серий: ${i.fresh}` : `Вышла ${i.aired} серия`, accent: true }} />
        </div>
      ))}
    </Shelf>
  )
}

const FILM_FRAMES = 10
const pad = (n: number) => String(n).padStart(2, '0')

function FilmStrip({ items }: { items: ScheduleItem[] }) {
  const rest = items.length - FILM_FRAMES
  return (
    <div className="film-strip" tabIndex={0} aria-label="Кадры онгоингов">
      <ol className="film">
        {items.slice(0, FILM_FRAMES).map((i) => {
          const at = hhmm(i.at)
          return (
            <li key={`${i.anime.id}-${i.episode}`} className="film__frame">
              <Link to={`/anime/${i.anime.id}`}>
                <span className="film__shot" style={{ background: i.anime.posterFill }}>
                  <Poster anime={i.anime} className="poster-img--cover" />
                  <time className="film__time" dateTime={i.at.toISOString()}>
                    {at}
                  </time>
                </span>
                <span className="film__name">{i.anime.title}</span>
                <span className="film__ep">EP {pad(i.episode)}</span>
              </Link>
            </li>
          )
        })}
        {rest > 0 && (
          <li className="film__frame film__frame--more">
            <Link to="/schedule">
              <span className="film__shot">
                <b>+{rest}</b>
                <span>в расписание</span>
              </span>
            </Link>
          </li>
        )}
      </ol>
    </div>
  )
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const hhmm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function HomeBento() {
  const schedule = useAsync(loadSchedule, [])
  const list = useMyList()
  const today = new Date()
  const items = (schedule.value?.data ?? []).filter((i) => sameDay(i.at, today)).sort((a, b) => +a.at - +b.at)
  const watching = list.filter((e) => e.status === 'watching').length
  const planned = list.filter((e) => e.status === 'planned').length

  return (
    <section className="bento" aria-label="Сводка на сегодня">
      <div className="bento__tile bento__tile--today">
        <div className="bento__head">
          <span className="shelf__icon" aria-hidden="true">
            <CalendarIcon size={18} />
          </span>
          <div className="bento__titles">
            <h2>Сегодня в эфире</h2>
            {items.length > 0 && <span className="film__count">{pad(items.length)} релизов</span>}
          </div>
          <Link to="/schedule" className="shelf__more">
            Расписание
          </Link>
        </div>
        {schedule.loading && !schedule.value ? (
          <div className="bento__skeleton skeleton" aria-busy="true" />
        ) : items.length ? (
          <FilmStrip items={items} />
        ) : (
          <p className="muted bento__empty">Сегодня новых серий нет. Загляните в расписание на неделю.</p>
        )}
      </div>
      {list.length ? (
        <Link to="/library" className="bento__tile bento__tile--link bento__tile--list">
          <span className="shelf__icon" aria-hidden="true">
            <ListIcon size={18} />
          </span>
          <strong>Моя библиотека</strong>
          <span className="muted">
            {[watching && `${watching} смотрю`, planned && `${planned} в планах`].filter(Boolean).join(' • ') || 'Открыть списки'}
          </span>
        </Link>
      ) : (
        <Link to="/top" className="bento__tile bento__tile--link bento__tile--list">
          <span className="shelf__icon" aria-hidden="true">
            <TrophyIcon size={18} />
          </span>
          <strong>Топ аниме</strong>
          <span className="muted">Шедевры с высоким рейтингом</span>
        </Link>
      )}
      <Link to="/random" className="bento__tile bento__tile--link frame-corners bento__tile--accent">
        <span className="shelf__icon" aria-hidden="true">
          <SparkIcon size={18} />
        </span>
        <strong>Что посмотреть?</strong>
        <span className="muted">Случайный тайтл под настроение</span>
      </Link>
    </section>
  )
}

export function SeasonShelf() {
  const season = currentSeason()
  return (
    <>
      <UpcomingShelf />
      <CatalogShelf
        title="Топ-10 онгоингов"
        subtitle="То, что смотрят прямо сейчас в этом сезоне"
        icon={<TrophyIcon />}
        query={{ status: 'ongoing', order: 'popularity' }}
        more="/catalog?status=ongoing"
        ranked={10}
        eager
      />
      <CatalogShelf
        title={season.label}
        subtitle="Новинки и продолжения этого сезона"
        icon={<CalendarIcon size={18} />}
        query={{ season: season.code }}
        more="/season"
        eager
      />
    </>
  )
}

export function MoreShelves() {
  return (
    <>
      <CatalogShelf
        title="Горячие онгоинги недели"
        subtitle="Свежие серии, которые смотрят прямо сейчас"
        icon={<SparkIcon />}
        query={{ status: 'ongoing', order: 'popularity' }}
        more="/catalog?status=ongoing"
      />
      <CatalogShelf
        title="В планах"
        subtitle="Анонсы, которые выйдут совсем скоро"
        icon={<ClockIcon />}
        query={{ status: 'anons' }}
        more="/catalog?status=anons"
      />
      <CatalogShelf
        title="Шедевры аниме"
        subtitle="Легендарные истории с наивысшим рейтингом"
        icon={<TrophyIcon />}
        query={{ order: 'ranked', score: 8 }}
        more="/top"
      />
      <GenreTiles />
      <Discover />
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

const TILE_GENRES = ['action', 'romance', 'comedy', 'fantasy', 'drama', 'sci-fi', 'mystery', 'slice-of-life', 'horror', 'sports', 'psychological', 'mecha']
const TILE_NAMES: Record<string, string> = { psychological: 'Психология', 'slice-of-life': 'Повседневность' }
const GENRE_IMAGES = import.meta.glob<string>('../assets/genres/*.webp', { eager: true, import: 'default' })
const genreImage = (slug: string) => GENRE_IMAGES[`../assets/genres/${slug}.webp`]

function GenreTiles() {
  const tiles = TILE_GENRES.map((slug) => GENRES.find((g) => g.slug === slug)).filter((g) => g !== undefined)
  return (
    <section className="stack shelf">
      <div className="shelf__head">
        <span className="shelf__icon" aria-hidden="true">
          <ThemeIcon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </span>
        <div className="shelf__titles">
          <h2>Жанры</h2>
          <p className="muted">Популярные категории аниме</p>
        </div>
        <Link to="/catalog" className="shelf__more">
          Все жанры
        </Link>
      </div>
      <div className="genre-tiles">
        {tiles.map((g, i) => (
          <Link key={g.slug} to={`/genre/${g.slug}`} className="genre-tile" style={{ '--h': (i * 360) / tiles.length + 340 } as CSSProperties}>
            <img
              className="genre-tile__image"
              src={genreImage(g.slug)}
              width={560}
              height={280}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.opacity = '0'
              }}
            />
            <span className="genre-tile__name">{TILE_NAMES[g.slug] ?? g.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const DISCOVER = [
  { to: '/random', emoji: '🎲', title: 'Что посмотреть?', text: 'Случайный выбор тайтла' },
  { to: '/quiz', emoji: '🎯', title: 'Аниме-квизы', text: 'Проверь свои знания' },
  { to: '/collections', emoji: '📚', title: 'Коллекции', text: 'Подборки от зрителей' },
]

function Discover() {
  return (
    <section className="discover" aria-label="Сервисы сайта">
      {DISCOVER.map((d) => (
        <Link key={d.to} to={d.to} className="discover__card">
          <span className="discover__emoji" aria-hidden="true">
            {d.emoji}
          </span>
          <span className="discover__text">
            <strong>{d.title}</strong>
            <span className="muted">{d.text}</span>
          </span>
        </Link>
      ))}
    </section>
  )
}

const THEMES = [
  {
    slug: 'music',
    genre: 19,
    title: 'Музыка',
    subtitle: 'Ритм, сцена и путь к вершине',
    icon: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  },
  {
    slug: 'sports',
    genre: 30,
    title: 'Спорт',
    subtitle: 'Команда, воля к победе и драйв',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  },
  {
    slug: 'romance',
    genre: 22,
    title: 'Романтика',
    subtitle: 'Истории о любви и искренних чувствах',
    icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  },
  {
    slug: 'mystery',
    genre: 7,
    title: 'Детектив',
    subtitle: 'Загадки, расследования и тайны',
    icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  },
]

function ThemeIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

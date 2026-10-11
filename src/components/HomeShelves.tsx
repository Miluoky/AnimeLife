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

/** Текущий аниме-сезон в формате Shikimori (fall_2026). Декабрь уже относится к зиме следующего года. */
export function currentSeason(now = new Date()) {
  const name = SEASONS[now.getMonth()]
  const year = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0)
  return { code: `${name}_${year}`, label: `${SEASON_NAMES[name]} ${year}` }
}

/**
 * Полок на главной много, а Shikimori пускает 5 запросов в секунду: полка грузится, только когда
 * до неё почти докрутили. До этого на её месте пустое место той же высоты, чтобы страница не прыгала.
 */
export function CatalogShelf(props: Parameters<typeof LoadedShelf>[0]) {
  const box = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el || near) return
    if (!('IntersectionObserver' in window)) return setNear(true)
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '800px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return near ? <LoadedShelf {...props} /> : <div ref={box} style={{ height: 420 }} aria-hidden="true" />
}

/** Полка постеров по запросу к каталогу. Пустую (API ничего не вернуло) не показываем совсем. */
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
  /** большие цифры мест перед постерами, как «Топ-10» на Netflix */
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

/** «Когда»: «сегодня 19:30», «завтра 02:00». */
function whenLabel(at: Date, now = new Date()) {
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY)
  return `${days <= 0 ? 'Сегодня' : days === 1 ? 'Завтра' : at.toLocaleDateString('ru', { weekday: 'short' })} ${time.format(at)}`
}

/** Серии, которые выйдут в ближайшие сутки, по времени выхода (из расписания Shikimori). */
function UpcomingShelf() {
  const schedule = useAsync(loadSchedule, [])
  const now = Date.now()
  const items = (schedule.value?.data ?? [])
    .filter((i) => i.at.getTime() > now && i.at.getTime() - now < DAY)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, SHELF_SIZE)
  if (items.length < 3) return null
  return (
    <Shelf title="Ближайшие серии" subtitle="Что выйдет в ближайшие сутки" icon={<PlayIcon size={18} />} more={{ to: '/schedule', label: 'Расписание' }}>
      {items.map((i) => (
        <div key={`${i.anime.id}-${i.episode}`} className="row-scroll__item">
          <PosterCard anime={i.anime} tag={{ text: `${whenLabel(i.at)} · ${i.episode} эп.`, accent: true }} />
        </div>
      ))}
    </Shelf>
  )
}

/**
 * Новые серии тайтлов, которые зритель смотрит: по расписанию Shikimori видно, сколько серий уже вышло,
 * а по списку и истории — на какой он остановился. Отдельных запросов к тайтлам не нужно.
 */
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

/**
 * «Сегодня в эфире» киноплёнкой: кадр на серию с таймкодом выхода, сверху и снизу перфорация.
 * Вышедшие серии чуть приглушены, ближайшая отмечена «REC». Плёнка листается вбок и на телефоне, и на ПК.
 */
function FilmStrip({ items }: { items: ScheduleItem[] }) {
  const now = Date.now()
  const next = items.find((i) => i.at.getTime() > now)
  const rest = items.length - FILM_FRAMES
  const strip = useRef<HTMLDivElement>(null)
  // Утром плёнка начинается с первой серии, вечером — с ближайшей: вышедшие остаются слева.
  useEffect(() => {
    const el = strip.current
    const frame = el?.querySelector<HTMLElement>('.film__frame--next')
    if (el && frame) el.scrollLeft = Math.max(0, frame.offsetLeft - 48)
  }, [])
  return (
    <div ref={strip} className="film" role="region" tabIndex={0} aria-label="Серии сегодня, листается вбок">
      <ol className="film__frames">
        {items.slice(0, FILM_FRAMES).map((i, n) => {
          const aired = i.at.getTime() <= now
          return (
            <li key={`${i.anime.id}-${i.episode}`} className={`film__frame${aired ? ' film__frame--aired' : ''}${i === next ? ' film__frame--next' : ''}`}>
              <Link to={`/anime/${i.anime.id}`} title={i.anime.title}>
                <span className="film__shot" style={{ background: i.anime.posterFill }}>
                  <Poster anime={i.anime} />
                  <span className="film__badge">{i === next ? 'REC' : aired ? 'Вышла' : `#${pad(n + 1)}`}</span>
                  <time className="film__tc" dateTime={i.at.toISOString()}>
                    {hhmm(i.at)}
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
                <span>в графике</span>
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

/**
 * Блоки под баннером: что выходит сегодня, быстрый вход в свой список (или в топ для новичков)
 * и «Что посмотреть?». Расписание то же, что у полки новых серий, второй раз не грузится.
 */
export function HomeBento() {
  const schedule = useAsync(loadSchedule, [])
  const list = useMyList()
  const today = new Date()
  const items = (schedule.value?.data ?? []).filter((i) => sameDay(i.at, today)).sort((a, b) => +a.at - +b.at)
  const watching = list.filter((e) => e.status === 'watching').length
  const planned = list.filter((e) => e.status === 'planned').length

  return (
    <section className="bento" aria-label="Коротко на сегодня">
      <div className="bento__tile bento__tile--today">
        <div className="bento__head">
          <span className="shelf__icon" aria-hidden="true">
            <CalendarIcon size={18} />
          </span>
          <div className="bento__titles">
            <h2>Сегодня в эфире</h2>
            {items.length > 0 && <span className="film__count">{pad(items.length)} сер.</span>}
          </div>
          <Link to="/schedule" className="shelf__more">
            График
          </Link>
        </div>
        {schedule.loading && !schedule.value ? (
          <div className="bento__skeleton skeleton" aria-busy="true" />
        ) : items.length ? (
          <FilmStrip items={items} />
        ) : (
          <p className="muted bento__empty">Сегодня новых серий нет. Загляните в график на неделю.</p>
        )}
      </div>
      {list.length ? (
        <Link to="/my-list" className="bento__tile bento__tile--link frame-corners">
          <span className="shelf__icon" aria-hidden="true">
            <ListIcon size={18} />
          </span>
          <strong>Мой список</strong>
          <span className="bento__stats">
            <span>
              <b>{watching}</b> смотрю
            </span>
            <span>
              <b>{planned}</b> в планах
            </span>
          </span>
        </Link>
      ) : (
        <Link to="/top" className="bento__tile bento__tile--link frame-corners">
          <span className="shelf__icon" aria-hidden="true">
            <TrophyIcon size={18} />
          </span>
          <strong>Топ аниме</strong>
          <span className="muted">Лучшее по оценкам зрителей, с чего начать</span>
        </Link>
      )}
      <Link to="/random" className="bento__tile bento__tile--link frame-corners bento__tile--accent">
        <span className="shelf__icon" aria-hidden="true">
          <SparkIcon size={18} />
        </span>
        <strong>Что посмотреть?</strong>
        <span className="muted">Подберём тайтл по настроению</span>
      </Link>
    </section>
  )
}

/** Ближайшие серии и премьеры текущего сезона: сразу под баннером. */
export function SeasonShelf() {
  const season = currentSeason()
  return (
    <>
      <UpcomingShelf />
      <CatalogShelf
        title="Топ-10 онгоингов"
        subtitle="Что смотрят больше всего прямо сейчас"
        icon={<TrophyIcon />}
        query={{ status: 'ongoing', order: 'popularity' }}
        more="/catalog?status=ongoing"
        ranked={10}
      />
      <CatalogShelf
        title={season.label}
        subtitle="Премьеры и продолжения этого сезона"
        icon={<CalendarIcon size={18} />}
        query={{ season: season.code }}
        more="/season"
      />
    </>
  )
}

/** Анонсы и лучшее за всё время: после рекомендаций. */
export function MoreShelves() {
  return (
    <>
      <CatalogShelf
        title="Скоро выйдет"
        subtitle="Анонсы, которые ждут больше всего"
        icon={<ClockIcon />}
        query={{ status: 'anons' }}
        more="/catalog?status=anons"
      />
      <CatalogShelf
        title="Лучшее за всё время"
        subtitle="Самые высокие оценки зрителей"
        icon={<TrophyIcon />}
        query={{ order: 'ranked' }}
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
// Кадр из узнаваемого тайтла жанра (Магическая битва, Твоё имя, Гинтама, Фрирен, Вайолет Эвергарден, Ковбой Бибоп,
// Детектив Конан, K-On!, Иная, Волейбол!!, Тетрадь смерти, Евангелион). Лежат в сборке: свой кэш, не зависят от Shikimori.
// Короче или с мягким переносом: длинное слово на узкой плитке переносится по слогу, а не по букве.
const TILE_NAMES: Record<string, string> = { psychological: 'Психология', 'slice-of-life': 'Повседнев\u00adность' }
const GENRE_IMAGES = import.meta.glob<string>('../assets/genres/*.webp', { eager: true, import: 'default' })
const genreImage = (slug: string) => GENRE_IMAGES[`../assets/genres/${slug}.webp`]

/** Плитки жанров на главной: у каждого свой цвет, ведут на посадочные /genre/:slug. */
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
          <p className="muted">Под любое настроение</p>
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
  { to: '/random', emoji: '🎲', title: 'Что посмотреть?', text: 'Выберите настроение, и мы подберём тайтл' },
  { to: '/quiz', emoji: '🖼️', title: 'Угадай по кадру', text: 'Мини-игра: сколько узнаете подряд?' },
  { to: '/collections', emoji: '📚', title: 'Подборки', text: 'Готовые списки на вечер' },
]

/** Куда ещё заглянуть: случайный выбор, мини-игра и подборки — крупные карточки вместо ссылок в подвале. */
function Discover() {
  return (
    <section className="discover" aria-label="Ещё на сайте">
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

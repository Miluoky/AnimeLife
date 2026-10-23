/**
 * Тексты для поисковиков: шаблоны заголовков и описаний тайтла и серии, жанры и типы со своими страницами.
 * Модуль общий для Worker (worker/index.js собирает по нему HTML для поисковиков без JavaScript) и приложения
 * (заголовок вкладки), поэтому сервер и браузер говорят одно и то же. Сами посадочные страницы — в landings.ts.
 * Без зависимостей: Worker импортирует его напрямую. В основную сборку не входит, только в отдельные части страниц.
 */
import type { Anime } from './catalog'

export const SITE = 'Anime Life'
/** Тайтлов на странице посадочной и каталога: столько же грузит сетка в приложении (CatalogGrid). */
export const PAGE_SIZE = 24
/** Дальше этой страницы ссылок «Следующая» нет: поисковику хватит, а лимиты Shikimori не резиновые. */
export const MAX_PAGES = 20

// Заголовок длиннее 70 знаков поисковики обрезают, описание длиннее 160 тоже.
const MAX_TITLE = 70
const MAX_DESCRIPTION = 160

/* Подвал: ссылки на служебные страницы (тексты в legal.ts) и строка о видео, каталоге и возрасте. */
export const DISCLAIMER =
  'Anime Life не хранит видео: плееры встроены со сторонних сервисов. Каталог — по данным Shikimori. Возрастные ограничения указаны на страницах тайтлов.'

/** О сайте и установка приложения: в подвале, в навигации для поисковиков и в карте сайта. Тексты в legal.ts. */
export const ABOUT_LINKS: [string, string][] = [
  ['О проекте', '/about'],
  ['Приложение', '/app'],
]

export const LEGAL_LINKS: [string, string][] = [
  ['Правообладателям', '/rightholders'],
  ['Контакты', '/contacts'],
  ['Конфиденциальность', '/privacy'],
  ['Соглашение', '/terms'],
]

/** Возрастная маркировка по рейтингу Shikimori (MPAA-подобные коды): g → 0+, pg_13 → 12+, r → 16+ и т. д. */
const AGES: Record<string, string> = { g: '0+', pg: '6+', pg_13: '12+', r: '16+', r_plus: '18+', rx: '18+' }
export const ageLabel = (rating?: string | null) => (rating ? AGES[rating] : undefined)

/** Обрезает текст по границе слова и ставит многоточие. Разметку Shikimori ([character=1]…) и переносы убирает. */
export function cut(text: string | null | undefined, max = MAX_DESCRIPTION) {
  const t = String(text ?? '')
    // [[Имя]] и [[ссылка|Имя]] — вики-ссылки Shikimori: имя оставляем, иначе от фразы остаётся «] Идзуку…».
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= max) return t
  const head = t.slice(0, max - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:—–-]+$/, '')}…`
}

const fit = (variants: string[]) => variants.find((v) => v.length <= MAX_TITLE) ?? variants[variants.length - 1]

/** «1 серия», «2 серии», «5 серий». */
export function episodesLabel(n: number) {
  const form = new Intl.PluralRules('ru').select(n)
  return `${n} ${form === 'one' ? 'серия' : form === 'few' ? 'серии' : 'серий'}`
}

/** То, что нужно шаблонам от тайтла. Worker собирает это из ответа Shikimori, приложение — из Anime. */
export interface TitleInfo {
  title: string
  /** оригинальное название латиницей, если отличается от русского */
  original?: string
  year?: number | string
  /** «ТВ-сериал», «Фильм» и т. п. */
  kind?: string
  movie?: boolean
  /** анонс: серий ещё нет */
  upcoming?: boolean
  episodes?: number
  studio?: string
  genres?: string[]
  description?: string
}

/** Поля для шаблонов из тайтла приложения: те же, что Worker берёт из ответа Shikimori. */
export const animeInfo = (a: Anime): TitleInfo => ({
  title: a.title,
  original: a.originalTitle,
  year: a.year,
  kind: a.kind,
  movie: a.kind === 'Фильм',
  upcoming: a.upcoming,
  episodes: a.episodes,
  studio: a.studio,
  genres: a.genres,
  description: a.description,
})

/** «Название (Original, 2023) — смотреть аниме онлайн бесплатно все серии | Anime Life», лишнее отбрасывается по длине. */
export function titlePageTitle(a: TitleInfo) {
  const full = a.movie ? 'смотреть аниме онлайн бесплатно' : 'смотреть аниме онлайн бесплатно все серии'
  const short = a.movie ? 'смотреть онлайн бесплатно' : 'смотреть онлайн все серии'
  const year = a.year ? ` (${a.year})` : ''
  const both = a.original && a.original !== a.title ? ` (${a.original}${a.year ? `, ${a.year}` : ''})` : year
  // У анонса смотреть пока нечего: ищут дату выхода и трейлер.
  if (a.upcoming) {
    return fit([`${a.title}${both} — дата выхода и трейлер`, `${a.title}${year} — дата выхода и трейлер`, `${a.title} — дата выхода`].map((t) => `${t} | ${SITE}`))
  }
  return fit(
    [
      `${a.title}${both} — ${full}`,
      `${a.title}${year} — ${full}`,
      `${a.title} — ${full}`,
      `${a.title}${year} — ${short}`,
      `${a.title} — ${short}`,
      `${a.title} — смотреть онлайн`,
    ].map((t) => `${t} | ${SITE}`),
  )
}

/** Описание тайтла: тип, год, серии, студия, жанры и начало сюжета, не длиннее 160 знаков. */
export function titlePageDescription(a: TitleInfo) {
  const facts = [
    // «Фильм» → «фильм», а «ТВ-сериал» и «OVA» остаются как есть.
    a.kind && (a.kind[1] === a.kind[1].toLowerCase() ? a.kind[0].toLowerCase() + a.kind.slice(1) : a.kind),
    a.year && `${a.year}`,
    !a.movie && a.episodes ? episodesLabel(a.episodes) : '',
    a.studio && `студия ${a.studio}`,
  ].filter(Boolean)
  const genres = a.genres?.length ? ` Жанры: ${a.genres.slice(0, 3).join(', ').toLowerCase()}.` : ''
  const lead = `«${a.title}»${facts.length ? ` — ${facts.join(', ')}.` : ': смотреть онлайн.'}${genres}`
  return cut(`${lead} ${cut(a.description, 400) || 'Смотрите онлайн бесплатно на Anime Life.'}`)
}

/** «Название 5 серия — смотреть онлайн | Anime Life». У фильма серий нет. */
export function watchPageTitle(a: TitleInfo, episode: number) {
  if (a.movie) return fit([`${a.title} — смотреть аниме-фильм онлайн бесплатно`, `${a.title} — смотреть онлайн`].map((t) => `${t} | ${SITE}`))
  return fit([`${a.title} ${episode} серия — смотреть онлайн бесплатно`, `${a.title} ${episode} серия — смотреть онлайн`, `${a.title} ${episode} серия`].map((t) => `${t} | ${SITE}`))
}

/** Описание серии: своё у каждой серии, чтобы поисковик не склеивал их в дубли. */
export function watchPageDescription(a: TitleInfo, episode: number, total?: number) {
  const of = total && total > 1 ? ` из ${total}` : ''
  const lead = a.movie
    ? `Смотрите аниме-фильм «${a.title}»${a.year ? ` (${a.year})` : ''} онлайн бесплатно на Anime Life.`
    : `Смотрите ${episode} серию${of} аниме «${a.title}»${a.year ? ` (${a.year})` : ''} онлайн бесплатно на Anime Life.`
  return cut(`${lead} ${cut(a.description, 300)}`)
}

// ─── Посадочные страницы ───

/** Жанры Shikimori со своей страницей /genre/<slug> (id из /api/genres, только аниме). Взрослых жанров здесь нет. */
export const GENRES: { slug: string; id: number; name: string }[] = [
  { slug: 'action', id: 1, name: 'Экшен' },
  { slug: 'adventure', id: 2, name: 'Приключения' },
  { slug: 'comedy', id: 4, name: 'Комедия' },
  { slug: 'drama', id: 8, name: 'Драма' },
  { slug: 'fantasy', id: 10, name: 'Фэнтези' },
  { slug: 'romance', id: 22, name: 'Романтика' },
  { slug: 'sci-fi', id: 24, name: 'Фантастика' },
  { slug: 'mystery', id: 7, name: 'Детектив' },
  { slug: 'horror', id: 14, name: 'Ужасы' },
  { slug: 'thriller', id: 41, name: 'Триллер' },
  { slug: 'psychological', id: 40, name: 'Психологическое' },
  { slug: 'slice-of-life', id: 36, name: 'Повседневность' },
  { slug: 'supernatural', id: 37, name: 'Сверхъестественное' },
  { slug: 'school', id: 23, name: 'Школа' },
  { slug: 'sports', id: 30, name: 'Спорт' },
  { slug: 'mecha', id: 18, name: 'Меха' },
  { slug: 'martial-arts', id: 17, name: 'Боевые искусства' },
  { slug: 'historical', id: 13, name: 'Исторический' },
  { slug: 'military', id: 38, name: 'Военное' },
  { slug: 'music', id: 19, name: 'Музыка' },
  { slug: 'samurai', id: 21, name: 'Самураи' },
  { slug: 'space', id: 29, name: 'Космос' },
  { slug: 'super-power', id: 31, name: 'Супер сила' },
  { slug: 'vampire', id: 32, name: 'Вампиры' },
  { slug: 'demons', id: 6, name: 'Демоны' },
  { slug: 'game', id: 11, name: 'Игры' },
  { slug: 'harem', id: 35, name: 'Гарем' },
  { slug: 'parody', id: 20, name: 'Пародия' },
  { slug: 'police', id: 39, name: 'Полиция' },
  { slug: 'kids', id: 15, name: 'Детское' },
  { slug: 'cars', id: 3, name: 'Машины' },
  { slug: 'gourmet', id: 543, name: 'Гурман' },
  { slug: 'work-life', id: 541, name: 'Работа' },
  { slug: 'shounen', id: 27, name: 'Сёнен' },
  { slug: 'seinen', id: 42, name: 'Сэйнэн' },
  { slug: 'shoujo', id: 25, name: 'Сёдзё' },
  { slug: 'josei', id: 43, name: 'Дзёсей' },
]

// Отдельный крошечный модуль: его берёт и основная сборка приложения (src/App.tsx), без всего seo.ts.
export { MOVED_GENRES } from './movedGenres'

/** Адрес посадочной страницы жанра по русскому названию из Shikimori, если такая страница есть. */
export const genrePath = (name: string) => {
  const g = GENRES.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return g && `/genre/${g.slug}`
}

/** Типы со своей посадочной страницей (/type/tv…): заголовок страницы. */
export const KINDS: Record<string, string> = {
  tv: 'Аниме-сериалы',
  movie: 'Аниме-фильмы',
  ova: 'OVA',
  ona: 'ONA — веб-аниме',
  special: 'Спешлы',
}

/** Посадочная тайтлов по типу Shikimori (tv, movie…), если такая есть. */
export const kindPath = (kind: string | null | undefined) => (kind && KINDS[kind] ? `/type/${kind}` : undefined)

/** Номер страницы из ?page=N: целое от 1, иначе 1. */
export function pageParam(value: string | null | undefined) {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 ? n : 1
}

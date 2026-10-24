import { animePath } from './animeUrl'

/**
 * Английская версия: /en (о сайте и популярное) и /en/anime/<id>-<slug> (страница тайтла по-английски).
 * Тексты общие для приложения (src/pages/En.tsx) и для Worker (worker/index.js), который отдаёт их поисковикам
 * и превью ссылок. Плееры, озвучки и остальной сайт остаются русскими, об этом честно сказано на странице.
 */

export const EN_SITE = 'Anime Life'

export const EN_HOME = {
  title: 'Watch anime online free — Russian dubs and subtitles | Anime Life',
  h1: 'Watch anime online',
  description:
    'Anime Life is a free anime streaming site: new episodes of ongoing anime, a catalog by genre and year, release schedule, watch parties with friends and your own list. Audio in Russian dubs or Japanese with subtitles.',
  intro: [
    'Anime Life is a free site for watching anime online. New episodes of airing shows appear within hours, and every title has several players and voice-over teams to choose from.',
    'Most dubs and subtitles are in Russian, and the site interface is in Russian too. Titles, genres and descriptions on these English pages help you find the show you want; the player itself is language-neutral.',
  ],
  features: [
    ['Ongoing anime', 'New episodes as soon as they air, with a weekly release schedule.'],
    ['Watch together', 'Create a room and watch in sync with friends, with chat and voice.'],
    ['Your list', 'Track what you watch, rate titles and sync the list with Shikimori.'],
    ['Free, no sign-up', 'Watch without an account; sign in only to sync your list across devices.'],
  ] as [string, string][],
}

/** Адрес английской страницы тайтла: /en/anime/6-trigun. */
export const enPath = (id: string | number, name?: string | null) => `/en${animePath(id, name)}`

export const EN_KINDS: Record<string, string> = {
  tv: 'TV series',
  movie: 'Movie',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Special',
  tv_special: 'TV special',
  music: 'Music video',
}

export const EN_STATUS: Record<string, string> = { anons: 'Upcoming', ongoing: 'Airing', released: 'Finished' }

const RATINGS: Record<string, string> = { g: 'G', pg: 'PG', pg_13: 'PG-13', r: 'R-17+', r_plus: 'R+', rx: 'Rx' }

/** Поля тайтла Shikimori, которые нужны английской странице (REST /api/animes/:id). */
export interface EnAnime {
  id: number
  name: string
  russian?: string
  english?: (string | null)[]
  japanese?: (string | null)[]
  kind: string | null
  score?: string
  status: string
  episodes: number
  episodes_aired: number
  aired_on: string | null
  rating?: string | null
  genres?: { name: string }[]
  studios?: { name: string }[]
}

/** Английское название, если оно есть, иначе латинское (ромадзи). */
export const enName = (a: Pick<EnAnime, 'name' | 'english'>) => a.english?.find(Boolean) ?? a.name

export const enYear = (a: Pick<EnAnime, 'aired_on'>) => a.aired_on?.slice(0, 4)

export function enTitle(a: EnAnime) {
  const name = enName(a)
  const year = enYear(a)
  const base = `${name}${year ? ` (${year})` : ''}`
  const tail = a.kind === 'movie' ? ' — watch movie online free | Anime Life' : ' — watch anime online free | Anime Life'
  return (base + tail).length <= 75 ? base + tail : `${name} — watch online | Anime Life`
}

/** Факты одной строкой: «TV series · 2023 · 28 episodes · Madhouse · Finished». */
export function enFacts(a: EnAnime) {
  const eps = a.kind !== 'movie' && a.episodes ? `${a.episodes} episode${a.episodes === 1 ? '' : 's'}` : ''
  return [
    a.kind ? EN_KINDS[a.kind] : '',
    enYear(a),
    eps,
    a.status === 'ongoing' && a.episodes_aired ? `${a.episodes_aired} aired` : '',
    a.studios?.[0]?.name,
    EN_STATUS[a.status],
    a.rating ? RATINGS[a.rating] : '',
  ].filter(Boolean) as string[]
}

/**
 * Описание по фактам: у Shikimori описания только на русском, переводить их на лету мы не берёмся.
 * Получается честный и у каждого тайтла свой текст.
 */
export function enDescription(a: EnAnime) {
  const name = enName(a)
  const alt = name !== a.name ? ` (${a.name})` : ''
  // «a TV series», «a movie», «an OVA»: аббревиатуры остаются заглавными.
  const kind = ((a.kind && EN_KINDS[a.kind]) || 'anime').replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
  const year = enYear(a)
  const studio = a.studios?.[0]?.name
  const genres = (a.genres ?? []).slice(0, 4).map((g) => g.name)
  const score = Number(a.score) > 0 ? ` Rated ${a.score} on Shikimori.` : ''
  const eps = a.kind !== 'movie' && a.episodes ? `, ${a.episodes} episodes` : ''
  const when = a.status === 'anons' ? 'upcoming ' : year ? `${year} ` : ''
  return (
    `${name}${alt} is a${/^[aeiou]/i.test(when || kind) ? 'n' : ''} ${when}${kind}${studio ? ` by ${studio}` : ''}${eps}.` +
    (genres.length ? ` Genres: ${genres.join(', ')}.` : '') +
    score +
    (a.status === 'anons' ? ' Release date and trailer on Anime Life.' : ' Watch it online free on Anime Life with Russian dubs or subtitles.')
  )
}

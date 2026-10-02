import type { Anime } from '../data/catalog'

// Открытое API Shikimori: https://shikimori.io/api/doc
// Ключ не нужен, лимит 5 запросов в секунду и 90 в минуту.
export const SHIKIMORI_URL = (import.meta.env.VITE_SHIKIMORI_URL as string | undefined) ?? 'https://shikimori.io'

interface ShikiImage {
  original: string
  preview: string
}

interface ShikiAnimeShort {
  id: number
  name: string
  russian: string
  image: ShikiImage
  kind: string | null
  score: string
  status: string
  episodes: number
  episodes_aired: number
  aired_on: string | null
}

interface ShikiGenre {
  id: number
  name: string
  russian: string
  kind: string
  entry_type?: string
}

interface ShikiVideo {
  kind: string
  hosting: string
  player_url: string
  name: string | null
}

interface ShikiAnimeFull extends ShikiAnimeShort {
  description: string | null
  duration: number
  genres: ShikiGenre[]
  studios: { id: number; name: string }[]
  videos: ShikiVideo[]
}

export interface Genre {
  id: number
  title: string
}

export interface CatalogQuery {
  page?: number
  limit?: number
  status?: 'ongoing' | 'released' | 'anons'
  genre?: number
  search?: string
}

// Запросы идут не чаще одного в 250 мс, чтобы не упираться в лимит 5 в секунду.
const gap = 250
let nextSlot = 0

function slot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + gap
  return new Promise((resolve) => setTimeout(resolve, at - now))
}

// Одинаковые запросы (например, двойной рендер в StrictMode) делят один ответ.
const cache = new Map<string, Promise<unknown>>()

async function request<T>(url: URL, init: RequestInit = {}, attempt = 0): Promise<T> {
  await slot()
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  if (res.status === 429 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    return request<T>(url, init, attempt + 1)
  }
  if (!res.ok) throw new Error(`Shikimori ${res.status}: ${url.pathname}`)
  return res.json() as Promise<T>
}

function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`/api${path}`, SHIKIMORI_URL)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const key = url.toString()
  let pending = cache.get(key) as Promise<T> | undefined
  if (!pending) {
    pending = request<T>(url)
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

// Постеры по id. Одинаковые пачки (например, двойной рендер в StrictMode) делят один запрос.
const posterCache = new Map<number, Promise<string | undefined>>()

const isMissing = (path: string | undefined) => !path || path.includes('missing_')

interface GraphqlPosters {
  data?: { animes: { id: string; poster: { originalUrl: string } | null }[] }
}

/**
 * REST API отдаёт заглушку missing_original вместо постеров, загруженных в новое хранилище
 * (например, у «Тетради смерти» и почти у всех новинок), а GraphQL знает настоящий адрес.
 * Подставляем постеры одним запросом на всю пачку. Если GraphQL не ответил, остаются заглушки.
 */
async function withPosters<T extends ShikiAnimeShort>(list: T[]): Promise<T[]> {
  const ids = [...new Set(list.filter((a) => isMissing(a.image?.original) && !posterCache.has(a.id)).map((a) => a.id))]
  // GraphQL отдаёт не больше 50 тайтлов за запрос, а в расписании их около сотни.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const query = `{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id poster { originalUrl } } }`
    const batch = request<GraphqlPosters>(new URL('/api/graphql', SHIKIMORI_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }).then((res) => new Map(res.data?.animes.map((a) => [Number(a.id), a.poster?.originalUrl]) ?? []))
    batch.catch((e) => {
      console.warn('Постеры из GraphQL не загрузились', e)
      for (const id of chunk) posterCache.delete(id)
    })
    for (const id of chunk) posterCache.set(id, batch.then((m) => m.get(id)).catch(() => undefined))
  }
  return Promise.all(
    list.map(async (a) => {
      if (!isMissing(a.image?.original)) return a
      const poster = await posterCache.get(a.id)
      return poster ? { ...a, image: { ...a.image, original: poster } } : a
    }),
  )
}

const kinds: Record<string, string> = {
  tv: 'ТВ-сериал',
  movie: 'Фильм',
  ova: 'OVA',
  ona: 'ONA',
  special: 'Спешл',
  tv_special: 'ТВ-спешл',
  music: 'Клип',
  pv: 'Промо',
  cm: 'Реклама',
}

const seasons = ['Зима', 'Зима', 'Весна', 'Весна', 'Весна', 'Лето', 'Лето', 'Лето', 'Осень', 'Осень', 'Осень', 'Зима']

const fills = ['#1e2638', '#2b2340', '#1e3140', '#24332a', '#3a2430', '#3a3122', '#26283f']

function absolute(path: string) {
  if (isMissing(path)) return undefined
  return path.startsWith('http') ? path : new URL(path, SHIKIMORI_URL).toString()
}

// В описаниях Shikimori есть разметка вида [character=123]Имя[/character], оставляем только текст.
function cleanDescription(text: string | null) {
  if (!text) return ''
  return text
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function fromShort(a: ShikiAnimeShort): Anime {
  const aired = a.aired_on ? new Date(a.aired_on) : undefined
  return {
    id: String(a.id),
    title: a.russian || a.name,
    originalTitle: a.russian ? a.name : undefined,
    year: aired ? aired.getFullYear() : undefined,
    season: aired ? `${seasons[aired.getMonth()]} ${aired.getFullYear()}` : undefined,
    kind: (a.kind && kinds[a.kind]) || 'Аниме',
    episodes: a.episodes || undefined,
    episodesAired: a.episodes_aired || undefined,
    genres: [],
    ongoing: a.status === 'ongoing',
    upcoming: a.status === 'anons',
    description: '',
    score: Number(a.score) || undefined,
    posterUrl: absolute(a.image?.original),
    posterFill: fills[a.id % fills.length],
  }
}

function fromFull(a: ShikiAnimeFull): Anime {
  const trailer = a.videos.find((v) => v.kind === 'pv' && v.hosting === 'youtube') ?? a.videos.find((v) => v.hosting === 'youtube')
  return {
    ...fromShort(a),
    episodeMinutes: a.duration || undefined,
    studio: a.studios[0]?.name,
    genres: a.genres.map((g) => g.russian || g.name),
    description: cleanDescription(a.description),
    trailerUrl: trailer ? trailer.player_url.replace(/^(https?:)?\/\//, 'https://') : undefined,
  }
}

export async function fetchCatalog(q: CatalogQuery = {}): Promise<Anime[]> {
  const list = await get<ShikiAnimeShort[]>('/animes', {
    page: q.page ?? 1,
    limit: q.limit ?? 24,
    order: 'popularity',
    status: q.status,
    genre: q.genre,
    search: q.search,
    censored: 'true',
  })
  return (await withPosters(list)).map(fromShort)
}

export async function fetchAnime(id: string): Promise<Anime> {
  const [anime] = await withPosters([await get<ShikiAnimeFull>(`/animes/${encodeURIComponent(id)}`)])
  return fromFull(anime)
}

// Жанры для быстрых фильтров на главной, по английскому названию из API.
const featuredGenres = ['Action', 'Shounen', 'Fantasy', 'Romance', 'Comedy', 'Drama']

export async function fetchGenres(): Promise<Genre[]> {
  const all = await get<ShikiGenre[]>('/genres')
  return featuredGenres
    // У манги свои жанры с теми же названиями, а их id в фильтре аниме дают пустой список.
    .map((name) => all.find((g) => g.name === name && g.entry_type === 'Anime'))
    .filter((g): g is ShikiGenre => Boolean(g))
    .map((g) => ({ id: g.id, title: g.russian || g.name }))
}

export interface ScheduleItem {
  anime: Anime
  episode: number
  at: Date
}

interface ShikiCalendarItem {
  next_episode: number
  next_episode_at: string
  anime: ShikiAnimeShort
}

/** Ближайшие серии онгоингов: GET /api/calendar. */
export async function fetchSchedule(): Promise<ScheduleItem[]> {
  const list = (await get<ShikiCalendarItem[]>('/calendar', { censored: 'true' })).filter((i) => i.next_episode_at && i.anime)
  const animes = await withPosters(list.map((i) => i.anime))
  return list.map((i, n) => ({ anime: fromShort(animes[n]), episode: i.next_episode, at: new Date(i.next_episode_at) }))
}

export interface Related {
  relation: string
  anime: Anime
}

interface ShikiRelated {
  relation_russian: string | null
  relation: string
  anime: ShikiAnimeShort | null
}

// Сначала то, что смотрят по порядку (предыстория, продолжение), в конце тайтлы с общими персонажами из других франшиз.
const relationOrder = [
  'Prequel',
  'Sequel',
  'Parent Story',
  'Full Story',
  'Side Story',
  'Alternative Version',
  'Alternative Setting',
  'Spin-off',
  'Summary',
  'Other',
  'Character',
]
const relationRank = (relation: string) => {
  const i = relationOrder.indexOf(relation)
  return i === -1 ? relationOrder.length - 1 : i
}

/** Сезоны, фильмы и спин-оффы той же франшизы. */
export async function fetchRelated(id: string): Promise<Related[]> {
  const list = (await get<ShikiRelated[]>(`/animes/${encodeURIComponent(id)}/related`))
    .filter((r): r is ShikiRelated & { anime: ShikiAnimeShort } => Boolean(r.anime))
    .sort(
      (a, b) =>
        relationRank(a.relation) - relationRank(b.relation) ||
        (a.anime.aired_on ?? '9999').localeCompare(b.anime.aired_on ?? '9999'),
    )
  const animes = await withPosters(list.map((r) => r.anime))
  return list.map((r, n) => ({ relation: r.relation_russian || r.relation, anime: fromShort(animes[n]) }))
}

export async function fetchSimilar(id: string): Promise<Anime[]> {
  const list = await get<ShikiAnimeShort[]>(`/animes/${encodeURIComponent(id)}/similar`)
  return (await withPosters(list.slice(0, 12))).map(fromShort)
}

/** Кадры из аниме, для баннера и превью серий. */
export async function fetchScreenshots(id: string): Promise<string[]> {
  const list = await get<{ original: string; preview: string }[]>(`/animes/${encodeURIComponent(id)}/screenshots`)
  return list.map((s) => absolute(s.original)).filter((u): u is string => Boolean(u))
}

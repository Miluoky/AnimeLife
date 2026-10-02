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
  rates_scores_stats?: { name: number; value: number }[]
  rates_statuses_stats?: { name: string; value: number }[]
}

export interface Genre {
  id: number
  title: string
}

export type CatalogOrder = 'popularity' | 'ranked' | 'aired_on'

export interface CatalogQuery {
  page?: number
  limit?: number
  order?: CatalogOrder
  status?: 'ongoing' | 'released' | 'anons'
  /** tv, movie, ova, ona, special */
  kind?: string
  /** год (2024) или диапазон лет (2020_2024), как понимает Shikimori */
  season?: string
  /** минимальная оценка */
  score?: number
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
    order: q.order ?? 'popularity',
    status: q.status,
    kind: q.kind,
    season: q.season,
    score: q.score,
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

/** Все жанры и темы аниме по алфавиту, для фильтра в каталоге. */
export async function fetchAllGenres(): Promise<Genre[]> {
  const all = await get<ShikiGenre[]>('/genres')
  return all
    .filter((g) => g.entry_type === 'Anime')
    .map((g) => ({ id: g.id, title: g.russian || g.name }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
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

export interface WatchLink {
  title: string
  url: string
}

// Легальные площадки, на которые Shikimori даёт ссылки. Порядок: сначала те, где обычно можно сразу смотреть.
const watchServices: Record<string, string> = {
  kinopoisk_hd: 'Кинопоиск',
  okko: 'Okko',
  wink: 'Wink',
  ivi: 'Иви',
  amediateka: 'Амедиатека',
  crunchyroll: 'Crunchyroll',
  netflix: 'Netflix',
  hidive: 'HIDIVE',
  youtube: 'YouTube',
  kinopoisk: 'Кинопоиск',
  official_site: 'Официальный сайт',
}
const watchOrder = Object.keys(watchServices)

/** Где посмотреть тайтл легально: онлайн-кинотеатры и официальный сайт. */
export async function fetchWatchLinks(id: string): Promise<WatchLink[]> {
  const list = await get<{ kind: string; url: string }[]>(`/animes/${encodeURIComponent(id)}/external_links`)
  const seen = new Set<string>()
  return list
    .filter((l) => watchServices[l.kind] && /^https?:\/\//.test(l.url))
    .sort((a, b) => watchOrder.indexOf(a.kind) - watchOrder.indexOf(b.kind))
    .filter((l) => {
      // Кинопоиск HD и обычный Кинопоиск ведут на одну страницу: оставляем одну кнопку.
      const title = watchServices[l.kind]
      if (seen.has(title)) return false
      seen.add(title)
      return true
    })
    .map((l) => ({ title: watchServices[l.kind], url: l.url.replace(/^http:/, 'https:') }))
}

export interface ScoreStats {
  votes: number
  /** от 10 до 1 */
  bars: { score: number; count: number }[]
  /** сколько человек смотрят, посмотрели и т. д. */
  statuses: { title: string; count: number }[]
}

export interface TitleVideo {
  title: string
  youtubeId: string
}

const videoKinds: Record<string, string> = {
  pv: 'Трейлер',
  op: 'Опенинг',
  ed: 'Эндинг',
  op_ed_clip: 'Клип',
  clip: 'Клип',
  character_trailer: 'Трейлер персонажа',
  episode_preview: 'Анонс серии',
  cm: 'Реклама',
  other: 'Видео',
}
const videoOrder = Object.keys(videoKinds)

function youtubeId(url: string) {
  return url.match(/youtube\.com\/embed\/([\w-]{6,})/)?.[1]
}

/** Оценки зрителей и видео (трейлеры, опенинги, эндинги). Ответ тот же, что у fetchAnime, он берётся из кэша. */
export async function fetchTitleDetails(id: string): Promise<{ scores?: ScoreStats; videos: TitleVideo[] }> {
  const a = await get<ShikiAnimeFull>(`/animes/${encodeURIComponent(id)}`)
  const bars = [...(a.rates_scores_stats ?? [])]
    .map((r) => ({ score: Number(r.name), count: r.value }))
    .sort((x, y) => y.score - x.score)
  const votes = bars.reduce((sum, b) => sum + b.count, 0)
  const videos = (a.videos ?? [])
    .map((v) => ({ v, id: youtubeId(v.player_url) }))
    .filter((x): x is { v: ShikiVideo; id: string } => Boolean(x.id))
    .sort((x, y) => videoOrder.indexOf(x.v.kind) - videoOrder.indexOf(y.v.kind))
    .map(({ v, id }) => {
      const kind = videoKinds[v.kind] ?? 'Видео'
      const name = v.name?.trim()
      return { youtubeId: id, title: name && name !== kind ? `${kind}: ${name}` : kind }
    })
    .filter((v, i, all) => all.findIndex((o) => o.youtubeId === v.youtubeId) === i)
  return {
    scores: votes
      ? { votes, bars, statuses: (a.rates_statuses_stats ?? []).map((r) => ({ title: r.name, count: r.value })) }
      : undefined,
    videos,
  }
}

export interface Character {
  id: number
  name: string
  image: string
  main: boolean
  url: string
}

interface ShikiRole {
  roles: string[]
  character: { id: number; name: string; russian: string; image: ShikiImage; url: string } | null
}

/** Главные и второстепенные персонажи с картинками. */
export async function fetchCharacters(id: string): Promise<Character[]> {
  const roles = await get<ShikiRole[]>(`/animes/${encodeURIComponent(id)}/roles`)
  return roles
    .filter((r): r is ShikiRole & { character: NonNullable<ShikiRole['character']> } => Boolean(r.character))
    .map((r) => ({
      id: r.character.id,
      name: r.character.russian || r.character.name,
      image: absolute(r.character.image.original) ?? '',
      main: r.roles.includes('Main'),
      url: new URL(r.character.url, SHIKIMORI_URL).toString(),
    }))
    .filter((c) => c.image)
    .sort((a, b) => Number(b.main) - Number(a.main))
    .slice(0, 16)
}

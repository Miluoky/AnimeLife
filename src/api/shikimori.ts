import type { Anime } from '../data/catalog'

// Открытое API Shikimori: https://shikimori.io/api/doc
// Ключ не нужен, лимит 5 запросов в секунду и 90 в минуту.
export const SHIKIMORI_URL = (import.meta.env.VITE_SHIKIMORI_URL as string | undefined) ?? 'https://shikimori.io'

// На animelife.top данные идут через свой Worker (/api/shiki, worker/shikiProxy.js): он кэширует ответы для всех
// зрителей и при сбое Shikimori отдаёт последнюю копию. Зеркала, локальный запуск и тесты ходят на Shikimori
// напрямую (на сборке можно включить прокси флагом VITE_SHIKIMORI_PROXY=1). Картинки и ссылки — всегда с SHIKIMORI_URL.
const host = globalThis.location?.hostname
const API_URL =
  import.meta.env.VITE_SHIKIMORI_PROXY === '1' || host === 'animelife.top' || host === 'www.animelife.top'
    ? `${location.origin}/api/shiki`
    : SHIKIMORI_URL

export interface ShikiImage {
  original: string
  preview: string
  main?: string
  main2x?: string
}

export interface ShikiAnimeShort {
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
  english?: (string | null)[]
  japanese?: (string | null)[]
  description: string | null
  duration: number
  genres: ShikiGenre[]
  studios: { id: number; name: string }[]
  videos: ShikiVideo[]
  rates_scores_stats?: { name: number; value: number }[]
  rates_statuses_stats?: { name: string; value: number }[]
  /** возрастной рейтинг: g, pg, pg_13, r, r_plus, rx */
  rating?: string | null
  /** когда выйдет следующая серия онгоинга (ISO), по расписанию Shikimori */
  next_episode_at?: string | null
  /** студии и люди, которые озвучили и перевели тайтл субтитрами */
  fandubbers?: string[]
  fansubbers?: string[]
}

export interface Genre {
  id: number
  title: string
  /** у студий: настоящая студия, а не подразделение или лейбл */
  real?: boolean
}

export type CatalogOrder = 'popularity' | 'ranked' | 'aired_on' | 'name'

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
  /** жанр или несколько через запятую (тайтл должен подходить под все) */
  genre?: number | string
  /** студия или несколько через запятую */
  studio?: string
  /** возрастной рейтинг: g, pg, pg_13, r, r_plus */
  rating?: string
  /** не показывать эти тайтлы, например уже добавленные в «Мой список» */
  excludeIds?: string[]
  search?: string
}

// Лимит Shikimori — 5 запросов в секунду: не больше пяти запросов в любом окне чуть длиннее секунды.
// Первые пять уходят сразу, а не по одному раз в 250 мс: баннер и первая полка не ждут в очереди.
const LIMIT = 5
const WINDOW = 1100
let starts: number[] = []

function slot() {
  const now = Date.now()
  const at = starts.length >= LIMIT ? Math.max(now, starts[starts.length - LIMIT] + WINDOW) : now
  starts.push(at)
  if (starts.length > LIMIT) starts = starts.slice(-LIMIT)
  return at > now ? new Promise((resolve) => setTimeout(resolve, at - now)) : Promise.resolve()
}

// Свой прокси (/api/shiki) отвечает из кэша Cloudflare и сам бережёт лимит Shikimori (при 429 повторяет
// или отдаёт сохранённую копию), поэтому запросы к нему не ждут очереди: иначе 15 запросов главной
// растягивались почти на 4 секунды. Прямые запросы к Shikimori (зеркала, /users) по-прежнему идут через slot().
const throttled = (url: URL) => !url.href.startsWith(`${globalThis.location?.origin}/api/shiki/`)

// Одинаковые запросы (например, двойной рендер в StrictMode) делят один ответ.
const cache = new Map<string, Promise<unknown>>()

/**
 * Ответы, которые Worker уже получил, пока собирал страницу (worker/index.js, #shiki-preload):
 * тайтл, связанное, похожее, баннер главной. Берём их один раз вместо запроса после загрузки кода.
 */
const preloaded: Record<string, unknown> = (() => {
  try {
    const el = globalThis.document?.getElementById('shiki-preload')
    return el?.textContent ? JSON.parse(el.textContent) : {}
  } catch {
    return {}
  }
})()

/** Путь API и параметры по алфавиту: так же ключ считает preloadKey в worker/index.js. */
function preloadKey(path: string, params: URLSearchParams) {
  const sorted = [...params].sort(([a], [b]) => a.localeCompare(b))
  return path + (sorted.length ? `?${new URLSearchParams(sorted)}` : '')
}

function takePreloaded<T>(key: string): Promise<T> | undefined {
  if (!(key in preloaded)) return undefined
  const data = preloaded[key] as T
  delete preloaded[key]
  return Promise.resolve(data)
}

async function request<T>(url: URL, init: RequestInit = {}, attempt = 0): Promise<T> {
  if (throttled(url)) await slot()
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  if (res.status === 429 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    return request<T>(url, init, attempt + 1)
  }
  if (!res.ok) throw new Error(`Shikimori ${res.status}: ${url.pathname}`)
  return res.json() as Promise<T>
}

export function get<T>(path: string, params: Record<string, string | number | undefined> = {}, base = API_URL): Promise<T> {
  const url = new URL(`${base}/api${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const key = url.toString()
  let pending = cache.get(key) as Promise<T> | undefined
  if (!pending) {
    pending = takePreloaded<T>(preloadKey(path, url.searchParams)) ?? request<T>(url)
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

/** Запрос к GraphQL Shikimori. Прокси на animelife.top пропускает только известные запросы (worker/shikiProxy.js). */
export function graphql<T>(query: string): Promise<T> {
  let pending = cache.get(`graphql:${query}`) as Promise<T> | undefined
  if (!pending) {
    pending = request<T>(new URL(`${API_URL}/api/graphql`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    pending.catch(() => cache.delete(`graphql:${query}`))
    cache.set(`graphql:${query}`, pending)
  }
  return pending
}

// Постеры по id. Одинаковые пачки (например, двойной рендер в StrictMode) делят один запрос.
interface PosterSet {
  original?: string
  /** webp для карточек: около 225 px в ширину и вдвое больше для экранов с высокой плотностью */
  main?: string
  main2x?: string
}
const posterCache = new Map<number, Promise<PosterSet | undefined>>()

const isMissing = (path: string | undefined) => !path || path.includes('missing_')

interface GraphqlPosters {
  data?: {
    animes: { id: string; poster: { originalUrl: string; mainUrl: string; main2xUrl: string } | null }[]
  }
}

/**
 * REST API отдаёт постеры только в полном размере, а для новинок и вовсе заглушку missing_original.
 * GraphQL знает настоящий адрес и лёгкие webp-версии для сеток, поэтому берём постеры оттуда
 * одним запросом на всю пачку. Если GraphQL не ответил, остаются постеры из REST.
 */
export async function withPosters<T extends ShikiAnimeShort>(list: T[], { onlyMissing = false } = {}): Promise<T[]> {
  // Для одного тайтла (страница, подборка недели) полный постер из REST годится: GraphQL ждём,
  // только если REST отдал заглушку. Для сеток же нужны лёгкие webp, их есть смысл подождать.
  const need = (a: ShikiAnimeShort) => !posterCache.has(a.id) && (!onlyMissing || isMissing(a.image?.original))
  const ids = [...new Set(list.filter(need).map((a) => a.id))]
  // GraphQL отдаёт не больше 50 тайтлов за запрос, а в расписании их около сотни.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const query = `{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id poster { originalUrl mainUrl main2xUrl } } }`
    const batch = (
      takePreloaded<GraphqlPosters>(`graphql:${query}`) ??
      request<GraphqlPosters>(new URL(`${API_URL}/api/graphql`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
    ).then(
      (res) =>
        new Map<number, PosterSet | undefined>(
          res.data?.animes.map((a) => [
            Number(a.id),
            a.poster ? { original: a.poster.originalUrl, main: a.poster.mainUrl, main2x: a.poster.main2xUrl } : undefined,
          ]) ?? [],
        ),
    )
    batch.catch((e) => {
      console.warn('Постеры из GraphQL не загрузились', e)
      for (const id of chunk) posterCache.delete(id)
    })
    for (const id of chunk) posterCache.set(id, batch.then((m) => m.get(id)).catch(() => undefined))
  }
  return Promise.all(
    list.map(async (a) => {
      const poster = posterCache.has(a.id) ? await posterCache.get(a.id) : undefined
      if (!poster) return a
      return { ...a, image: { ...a.image, original: poster.original ?? a.image?.original, main: poster.main, main2x: poster.main2x } }
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

export function absolute(path: string) {
  if (isMissing(path)) return undefined
  return path.startsWith('http') ? path : new URL(path, SHIKIMORI_URL).toString()
}

// В описаниях Shikimori есть разметка вида [character=123]Имя[/character], оставляем только текст.
export function cleanDescription(text: string | null) {
  if (!text) return ''
  return text
    // Вики-ссылки [[Имя]] и [[ссылка|Имя]] — оставляем имя; японское написание в скобках [緑谷 出久] убираем.
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s?\[[\u3000-\u30ff\u4e00-\u9fff\s・]+\]/g, '')
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function fromShort(a: ShikiAnimeShort): Anime {
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
    posterSmall: a.image?.main,
    posterSmall2x: a.image?.main2x,
    posterFill: fills[a.id % fills.length],
  }
}

function fromFull(a: ShikiAnimeFull): Anime {
  const trailer = a.videos.find((v) => v.kind === 'pv' && v.hosting === 'youtube') ?? a.videos.find((v) => v.hosting === 'youtube')
  return {
    ...fromShort(a),
    englishTitle: a.english?.[0] || undefined,
    japaneseTitle: a.japanese?.[0] || undefined,
    episodeMinutes: a.duration || undefined,
    studio: a.studios[0]?.name,
    studioId: a.studios[0]?.id,
    genres: a.genres.map((g) => g.russian || g.name),
    description: cleanDescription(a.description),
    trailerUrl: trailer ? trailer.player_url.replace(/^(https?:)?\/\//, 'https://') : undefined,
    rating: a.rating || undefined,
    nextEpisodeAt: (a.status === 'ongoing' && a.next_episode_at) || undefined,
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
    studio: q.studio,
    rating: q.rating,
    exclude_ids: q.excludeIds?.length ? q.excludeIds.join(',') : undefined,
    search: q.search,
    censored: 'true',
  })
  return (await withPosters(list)).map(fromShort)
}

export async function fetchAnime(id: string): Promise<Anime> {
  const [anime] = await withPosters([await get<ShikiAnimeFull>(`/animes/${encodeURIComponent(id)}`)], { onlyMissing: true })
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

// Жанры из /api/genres, по которым Shikimori больше ничего не находит: «Магия» (16) убрана из жанров аниме.
const DEAD_GENRE_IDS = [16]

/** Все жанры и темы аниме по алфавиту, для фильтра в каталоге. */
export async function fetchAllGenres(): Promise<Genre[]> {
  const all = await get<ShikiGenre[]>('/genres')
  return all
    .filter((g) => g.entry_type === 'Anime' && !DEAD_GENRE_IDS.includes(g.id))
    .map((g) => ({ id: g.id, title: g.russian || g.name }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

/** Студии для фильтра каталога. В списке только настоящие (real), остальные — подразделения и лейблы. */
export async function fetchStudios(): Promise<Genre[]> {
  const all = await get<{ id: number; name: string; real?: boolean }[]>('/studios')
  return all
    .map((s) => ({ id: s.id, title: s.name, real: Boolean(s.real) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en'))
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

export interface UserRate {
  anime: Anime
  status: string
  episodes: number
  score: number
  updatedAt: number
}

interface ShikiUserRate {
  score: number
  status: string
  episodes: number
  updated_at: string
  anime: ShikiAnimeShort | null
}

/** Открытый список пользователя Shikimori по нику (или id). Ник с ошибкой даёт 404. */
export async function fetchUserRates(nickname: string): Promise<UserRate[]> {
  const out: ShikiUserRate[] = []
  for (let page = 1; page <= 10; page++) {
    // Список пользователя — личное: идёт напрямую в Shikimori, мимо кэша на нашей стороне.
    const chunk = await get<ShikiUserRate[]>(`/users/${encodeURIComponent(nickname)}/anime_rates`, { limit: 1000, page }, SHIKIMORI_URL)
    out.push(...chunk.filter((r) => r.anime))
    if (chunk.length < 1000) break
  }
  const animes = await withPosters(out.map((r) => r.anime!), { onlyMissing: true })
  return out.map((r, i) => ({
    anime: fromShort(animes[i]),
    status: r.status,
    episodes: r.episodes,
    score: r.score,
    updatedAt: Date.parse(r.updated_at) || Date.now(),
  }))
}

/** Тайтлы по списку id пачками по 50 (id Shikimori совпадают с id MyAnimeList). */
export async function fetchAnimesByIds(ids: string[]): Promise<Anime[]> {
  const out: Anime[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const list = await get<ShikiAnimeShort[]>('/animes', { ids: chunk.join(','), limit: 50 })
    out.push(...(await withPosters(list, { onlyMissing: true })).map(fromShort))
  }
  return out
}

export interface Related {
  relation: string
  /** предыстория или продолжение: то, что смотрят по порядку */
  chain: boolean
  /** для манги и ранобэ карточка в том же виде, что у аниме, но id с приставкой manga-, чтобы не путать со списком */
  anime: Anime
  /** куда ведёт карточка, если это не аниме (страница манги) */
  href?: string
}

/** Манга и ранобэ в ответах Shikimori: те же поля, что у аниме, только тома и главы вместо серий. */
export type ShikiMangaShort = Omit<ShikiAnimeShort, 'episodes' | 'episodes_aired'> & { volumes: number; chapters: number }

interface ShikiRelated {
  relation_russian: string | null
  relation: string
  anime: ShikiAnimeShort | null
  manga: ShikiMangaShort | null
}

export const mangaKinds: Record<string, string> = {
  manga: 'Манга',
  manhwa: 'Манхва',
  manhua: 'Маньхуа',
  one_shot: 'Ваншот',
  doujin: 'Додзинси',
  light_novel: 'Ранобэ',
  novel: 'Новелла',
}

/** Манга как карточка каталога: постер, название, год, вид. Ссылка ведёт на /manga/:id. */
export function fromMangaShort(m: ShikiMangaShort): Anime {
  const card = fromShort({ ...m, kind: null, episodes: 0, episodes_aired: 0 })
  return { ...card, id: `manga-${m.id}`, kind: (m.kind && mangaKinds[m.kind]) || 'Манга' }
}

// Сначала то, что смотрят по порядку (предыстория, продолжение), в конце тайтлы с общими персонажами из других франшиз.
const relationOrder = [
  'Prequel',
  'Sequel',
  'Parent Story',
  'Full Story',
  'Adaptation',
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

/** Сезоны, фильмы и спин-оффы той же франшизы, а также манга и ранобэ (оригинал, по которому сняли аниме). */
export async function fetchRelated(id: string, from: 'animes' | 'mangas' = 'animes'): Promise<Related[]> {
  const raw = await get<ShikiRelated[]>(`/${from}/${encodeURIComponent(id)}/related`)
  const date = (r: ShikiRelated) => (r.anime ?? r.manga)?.aired_on ?? '9999'
  const list = raw
    .filter((r) => r.anime || r.manga)
    // Аниме раньше манги с тем же отношением: на странице аниме главное — что смотреть дальше.
    .sort((a, b) => relationRank(a.relation) - relationRank(b.relation) || Number(!a.anime) - Number(!b.anime) || date(a).localeCompare(date(b)))
  const animes = await withPosters(list.flatMap((r) => (r.anime ? [r.anime] : [])))
  let n = 0
  return list.map((r) => ({
    relation: r.relation_russian || r.relation,
    chain: r.relation === 'Prequel' || r.relation === 'Sequel',
    ...(r.anime ? { anime: fromShort(animes[n++]) } : { anime: fromMangaShort(r.manga!), href: `/manga/${r.manga!.id}` }),
  }))
}

export async function fetchSimilar(id: string): Promise<Anime[]> {
  const list = await get<ShikiAnimeShort[]>(`/animes/${encodeURIComponent(id)}/similar`)
  return (await withPosters(list.slice(0, 12))).map(fromShort)
}

/** Кадры из аниме, для баннера и превью серий. */
/**
 * Уменьшенная копия кадра (высота 332 px, в 10–15 раз легче оригинала): для миниатюр серий, сетки кадров
 * и фона баннера на телефоне. Оригинал остаётся для просмотра кадра на весь экран и фона на компьютере.
 */
export const shotPreview = (url: string) => url.replace('/screenshots/original/', '/screenshots/x332/')

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
  /** вид видео для фильтра: «Трейлер», «Опенинг», «Эндинг», «Клип»… */
  kind: string
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
export async function fetchTitleDetails(id: string): Promise<{ scores?: ScoreStats; videos: TitleVideo[]; dubbers: string[]; subbers: string[] }> {
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
      return { youtubeId: id, kind, title: name && name !== kind ? `${kind}: ${name}` : kind }
    })
    .filter((v, i, all) => all.findIndex((o) => o.youtubeId === v.youtubeId) === i)
  return {
    scores: votes
      ? { votes, bars, statuses: (a.rates_statuses_stats ?? []).map((r) => ({ title: r.name, count: r.value })) }
      : undefined,
    videos,
    dubbers: a.fandubbers ?? [],
    subbers: a.fansubbers ?? [],
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

/** Что нужно для статистики профиля: длительность серий и жанры. */
export interface StatsInfo {
  episodes: number
  episodesAired: number
  /** минут в серии */
  duration: number
  kind: string
  genres: string[]
}

interface GraphqlStats {
  data?: {
    animes: {
      id: string
      episodes: number
      episodesAired: number
      duration: number | null
      kind: string | null
      genres: { russian: string; kind: string }[] | null
    }[]
  }
}

/** Жанры и длительность для пачки тайтлов: одним GraphQL-запросом на каждые 50 штук. */
export async function fetchStatsInfo(ids: string[]): Promise<Map<string, StatsInfo>> {
  const out = new Map<string, StatsInfo>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const query = `{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id episodes episodesAired duration kind genres { russian kind } } }`
    // Тоже напрямую: прокси пропускает только запросы постеров, а набор тайтлов здесь из личного списка.
    const res = await request<GraphqlStats>(new URL('/api/graphql', SHIKIMORI_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    for (const a of res.data?.animes ?? []) {
      out.set(a.id, {
        episodes: a.episodes,
        episodesAired: a.episodesAired,
        duration: a.duration ?? 0,
        kind: kinds[a.kind ?? ''] ?? a.kind ?? '',
        // «Сёнен», «Сэйнэн» и т. п. говорят об аудитории, а «Удостоено наград» о премиях: это не жанры.
        genres: (a.genres ?? [])
          .filter((g) => g.kind !== 'demographic' && g.russian !== 'Удостоено наград')
          .map((g) => g.russian),
      })
    }
  }
  return out
}

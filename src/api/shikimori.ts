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

async function request<T>(url: URL, attempt = 0): Promise<T> {
  await slot()
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    return request<T>(url, attempt + 1)
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
  if (!path || path.includes('missing_')) return undefined
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
    trailerUrl: trailer ? trailer.player_url.replace(/^\/\//, 'https://') : undefined,
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
  return list.map(fromShort)
}

export async function fetchAnime(id: string): Promise<Anime> {
  return fromFull(await get<ShikiAnimeFull>(`/animes/${encodeURIComponent(id)}`))
}

// Жанры для быстрых фильтров на главной, по английскому названию из API.
const featuredGenres = ['Action', 'Shounen', 'Fantasy', 'Romance', 'Comedy', 'Drama']

export async function fetchGenres(): Promise<Genre[]> {
  const all = await get<ShikiGenre[]>('/genres')
  return featuredGenres
    .map((name) => all.find((g) => g.name === name && g.kind === 'anime') ?? all.find((g) => g.name === name))
    .filter((g): g is ShikiGenre => Boolean(g))
    .map((g) => ({ id: g.id, title: g.russian || g.name }))
}

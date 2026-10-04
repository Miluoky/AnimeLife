/**
 * AnimeVost: бесплатный открытый API с русской озвучкой и прямыми mp4 (480p и 720p).
 * Документация: https://api.animevost.org/ (поиск и плейлист — POST с формой, CORS открыт).
 * Id Shikimori у AnimeVost нет, поэтому релиз сверяем по названию и году.
 */

const API = 'https://api.animevost.org/v1'

export interface AnimeVostEpisode {
  ordinal: number
  /** 720p и 480p, уже по https */
  hd?: string
  std?: string
  preview?: string
}

interface SearchItem {
  id: number
  title: string
  year?: string
}

interface PlaylistItem {
  name: string
  hd?: string
  std?: string
  preview?: string
}

async function post<T>(path: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'POST', body: new URLSearchParams(form) })
  if (!res.ok) throw new Error(`AnimeVost ${path} ${res.status}`)
  return res.json()
}

// Ссылки API приходят по http; те же файлы отдаются по https, иначе браузер их заблокирует.
const secure = (url?: string) => url?.replace(/^http:\/\//, 'https://')

/** Буквы и цифры в нижнем регистре: «Sousou no Frieren!» и «sousou no frieren» — одно и то же. */
export const norm = (s?: string) => (s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')

/** «Рус / Romaji [1-28 из 28]» → оба названия без счётчика серий. */
export function splitTitle(title: string): { russian: string; original: string } {
  const clean = title.replace(/(\s*\[[^\]]*\])+\s*$/, '')
  const [russian = '', original = ''] = clean.split(' / ')
  return { russian: russian.trim(), original: original.trim() }
}

export interface AnimeVostQuery {
  title: string
  originalTitle?: string
  /** английское название: в Anixart оригинальным иногда записано оно («Code Geass: Lelouch of the Rebellion») */
  englishTitle?: string
  year?: number
}

/** Тот ли это релиз: совпало русское или оригинальное название, а год (если известен) не противоречит. */
export function matches(item: SearchItem, q: AnimeVostQuery): boolean {
  const { russian, original } = splitTitle(item.title)
  const sameName = norm(russian) === norm(q.title) || (!!q.originalTitle && norm(original) === norm(q.originalTitle))
  const year = Number(item.year)
  return sameName && (!q.year || !year || year === q.year)
}

const found = new Map<string, Promise<AnimeVostEpisode[] | null>>()

/** Серии релиза AnimeVost для тайтла или null, если такого релиза нет. Ответы запоминаем на сеанс. */
export function findAnimeVost(key: string, q: AnimeVostQuery): Promise<AnimeVostEpisode[] | null> {
  let result = found.get(key)
  if (!result) {
    result = search(q)
    found.set(key, result)
    result.catch(() => found.delete(key))
  }
  return result
}

async function search(q: AnimeVostQuery): Promise<AnimeVostEpisode[] | null> {
  for (const name of new Set([q.title, q.originalTitle].filter(Boolean) as string[])) {
    const res = await post<{ data?: SearchItem[] }>('/search', { name })
    const hit = res.data?.find((item) => matches(item, q))
    if (!hit) continue
    const list = await post<PlaylistItem[]>('/playlist', { id: String(hit.id) })
    return parsePlaylist(list)
  }
  return null
}

/** «12 серия» → 12; фильмы и OVA без номера идут по порядку. */
export function parsePlaylist(list: PlaylistItem[]): AnimeVostEpisode[] {
  return list
    .map((item, i) => ({
      ordinal: Number(item.name.match(/\d+/)?.[0]) || i + 1,
      hd: secure(item.hd),
      std: secure(item.std),
      preview: secure(item.preview),
    }))
    .filter((e) => e.hd || e.std)
    .sort((a, b) => a.ordinal - b.ordinal)
}

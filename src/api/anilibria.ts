/**
 * Клиент REST API AniLibria v3 — поиск тайтлов и получение HLS-потоков.
 * Документация: https://anilibria.tv/api/v3/
 */

const API_BASE = 'https://api.anilibria.tv/v3'

/* ──────────────── Типы ──────────────── */

/** Один HLS-поток в определённом качестве. */
export interface AniLibriaHls {
  fhd: string | null
  hd: string | null
  sd: string | null
}

/** Одна серия из поля `player.list`. */
export interface AniLibriaEpisode {
  episode: number
  name: string | null
  uuid: string
  /** Дата создания серии (unix timestamp). */
  created_timestamp: number
  hls: AniLibriaHls
}

/** Блок `player` в ответе тайтла. */
export interface AniLibriaPlayer {
  host: string
  /** Объект, где ключ — номер серии (строка), значение — AniLibriaEpisode. */
  list: Record<string, AniLibriaEpisode>
  episodes: { first: number | null; last: number | null; string: string }
}

/** Минимальная выборка полей тайтла, нужная для плеера. */
export interface AniLibriaTitle {
  id: number
  code: string
  names: { ru: string; en: string; alternative: string | null }
  player: AniLibriaPlayer
}

export type AniLibriaQuality = 'fhd' | 'hd' | 'sd'

/* ──────────────── Запросы ──────────────── */

/**
 * Поиск тайтла по запросу. Возвращает массив найденных тайтлов.
 * Фильтруем, чтобы получать только поля, нужные плееру.
 */
export async function searchTitle(query: string): Promise<AniLibriaTitle[]> {
  const url = new URL(`${API_BASE}/title/search`)
  url.searchParams.set('search', query)
  url.searchParams.set('filter', 'id,code,names,player')
  url.searchParams.set('limit', '5')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`AniLibria search ${res.status}`)
  const json = await res.json()
  return json.list ?? []
}

/**
 * Получить тайтл по коду (slug, например «shingeki-no-kyojin»).
 */
export async function getTitleByCode(code: string): Promise<AniLibriaTitle | null> {
  const url = new URL(`${API_BASE}/title`)
  url.searchParams.set('code', code)
  url.searchParams.set('filter', 'id,code,names,player')

  const res = await fetch(url.toString())
  if (!res.ok) return null
  return res.json()
}

/* ──────────────── Хелперы ──────────────── */

/**
 * Превращает player.list (объект с числовыми ключами) в отсортированный массив серий.
 */
export function episodeList(player: AniLibriaPlayer): AniLibriaEpisode[] {
  return Object.values(player.list).sort((a, b) => a.episode - b.episode)
}

/**
 * Собирает полный URL потока с учётом host из player.
 * AniLibria отдаёт относительный путь вроде `/videos/ts/...`, а host — `cache.libria.fun`.
 */
export function hlsUrl(host: string, path: string): string {
  // Убираем двойные протоколы, если host уже содержит https.
  const base = host.startsWith('http') ? host : `https://${host}`
  return `${base}${path}`
}

/**
 * Выбирает лучшее доступное качество из HLS-объекта.
 * Приоритет: fhd → hd → sd.
 */
export function bestQuality(hls: AniLibriaHls): { quality: AniLibriaQuality; path: string } | null {
  if (hls.fhd) return { quality: 'fhd', path: hls.fhd }
  if (hls.hd) return { quality: 'hd', path: hls.hd }
  if (hls.sd) return { quality: 'sd', path: hls.sd }
  return null
}

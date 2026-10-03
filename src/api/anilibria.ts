/**
 * Клиент REST API AniLibria v1 — поиск релиза по id Shikimori и получение HLS-потоков.
 * Документация: https://anilibria.top/api/docs/v1
 */

const API_BASE = 'https://anilibria.top/api/v1'
// Проект переезжает на новый адрес; если старый не отвечает вовсе, пробуем его.
const MIRROR_BASE = 'https://aniliberty.top/api/v1'

/* ──────────────── Типы ──────────────── */

/** Одна серия релиза: ссылки на HLS-плейлисты абсолютные. */
export interface AniLibriaEpisode {
  ordinal: number
  name: string | null
  hls_480: string | null
  hls_720: string | null
  hls_1080: string | null
}

/** Минимальная выборка полей релиза, нужная плееру. */
export interface AniLibriaRelease {
  id: number
  shikimori: { id: number } | null
  episodes: AniLibriaEpisode[]
}

/** Качества по убыванию: первое доступное — лучшее. */
export const qualities = ['1080', '720', '480'] as const
export type AniLibriaQuality = (typeof qualities)[number]

/* ──────────────── Запросы ──────────────── */

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const build = (base: string) => {
    const url = new URL(`${base}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url.toString()
  }
  // Ответ с ошибкой — это ответ: зеркало пробуем, только когда сеть до основного адреса не дошла.
  const res = await fetch(build(API_BASE)).catch(() => fetch(build(MIRROR_BASE)))
  if (!res.ok) throw new Error(`AniLibria ${path} ${res.status}`)
  return res.json()
}

// Найденные релизы по id Shikimori: при переходе к другой серии плеер создаётся заново, а искать снова незачем.
const releases = new Map<string, Promise<AniLibriaRelease | null>>()

/**
 * Ищет релиз, у которого id Shikimori совпадает с нужным: перебирает запросы по очереди
 * (русское, оригинальное, английское название). Без совпадения по id — null,
 * чтобы не показать чужое аниме с похожим названием.
 */
export function findRelease(shikimoriId: string | undefined, queries: (string | undefined)[]): Promise<AniLibriaRelease | null> {
  if (!shikimoriId) return Promise.resolve(null)
  let found = releases.get(shikimoriId)
  if (!found) {
    found = searchRelease(shikimoriId, queries)
    releases.set(shikimoriId, found)
    // Ошибку сети не запоминаем: в следующий раз попробуем снова.
    found.catch(() => releases.delete(shikimoriId))
  }
  return found
}

async function searchRelease(shikimoriId: string, queries: (string | undefined)[]): Promise<AniLibriaRelease | null> {
  let failure: unknown = null
  for (const query of new Set(queries.filter(Boolean) as string[])) {
    let found: AniLibriaRelease[]
    try {
      found = await get<AniLibriaRelease[]>('/app/search/releases', { query })
    } catch (e) {
      // Запрос не ответил — пробуем следующее название.
      failure = e
      continue
    }
    const match = found.find((r) => String(r.shikimori?.id) === shikimoriId)
    if (!match) continue
    const release = await get<AniLibriaRelease>(`/anime/releases/${match.id}`)
    return { ...release, episodes: [...(release.episodes ?? [])].sort((a, b) => a.ordinal - b.ordinal) }
  }
  // Не нашли, но какой-то запрос не ответил: это ошибка сети, а не «релиза нет».
  if (failure) throw failure
  return null
}

/* ──────────────── Хелперы ──────────────── */

/** Поток серии в нужном качестве, а если его нет — в лучшем из доступных. */
export function episodeStream(ep: AniLibriaEpisode, quality: AniLibriaQuality): { quality: AniLibriaQuality; url: string } | null {
  const order = [quality, ...qualities.filter((q) => q !== quality)]
  const best = order.find((q) => ep[`hls_${q}` as const])
  return best ? { quality: best, url: ep[`hls_${best}` as const]! } : null
}

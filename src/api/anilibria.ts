/**
 * Клиент REST API AniLibria v1 — поиск релиза по id Shikimori и получение HLS-потоков.
 * Документация: https://anilibria.top/api/docs/v1
 */

const API_BASE = 'https://anilibria.top/api/v1'
// Проект переезжает на новый адрес; если старый не отвечает вовсе, пробуем его.
const MIRROR_BASE = 'https://aniliberty.top/api/v1'

/* ──────────────── Типы ──────────────── */

/** Отрезок серии в секундах: опенинг или эндинг. AniLibria размечает их для большинства релизов. */
export interface AniLibriaSpan {
  start: number | null
  stop: number | null
}

/** Одна серия релиза: ссылки на HLS-плейлисты абсолютные. */
export interface AniLibriaEpisode {
  ordinal: number
  name: string | null
  opening?: AniLibriaSpan | null
  ending?: AniLibriaSpan | null
  /** кадр из серии: пути от корня сайта AniLibria */
  preview?: { src?: string | null; optimized?: { preview?: string | null; thumbnail?: string | null } | null } | null
  /** длительность в секундах */
  duration?: number | null
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

/** Что можно пропустить в серии: только размеченные отрезки от 5 секунд. */
export interface SkipSpan {
  kind: 'opening' | 'ending'
  start: number
  stop: number
}

export function episodeSkips(ep: AniLibriaEpisode): SkipSpan[] {
  const spans: SkipSpan[] = []
  for (const kind of ['opening', 'ending'] as const) {
    const { start, stop } = ep[kind] ?? {}
    if (typeof start === 'number' && typeof stop === 'number' && stop - start >= 5) spans.push({ kind, start, stop })
  }
  return spans
}

// Картинки AniLibria лежат на том же сайте, что и API.
const SITE = new URL(API_BASE).origin

/** Кадр из серии для карточки: маленький (200 px) и крупный (720 px) варианты для srcset. */
export function episodeFrame(ep: AniLibriaEpisode): { src: string; srcSet?: string } | null {
  const small = ep.preview?.optimized?.thumbnail
  const big = ep.preview?.optimized?.preview ?? ep.preview?.src
  if (!small && !big) return null
  const abs = (path: string) => new URL(path, SITE).toString()
  if (small && big) return { src: abs(big), srcSet: `${abs(small)} 200w, ${abs(big)} 720w` }
  return { src: abs((small ?? big)!) }
}

/** Поток серии в нужном качестве, а если его нет — в лучшем из доступных. */
export function episodeStream(ep: AniLibriaEpisode, quality: AniLibriaQuality): { quality: AniLibriaQuality; url: string } | null {
  const order = [quality, ...qualities.filter((q) => q !== quality)]
  const best = order.find((q) => ep[`hls_${q}` as const])
  return best ? { quality: best, url: ep[`hls_${best}` as const]! } : null
}

/**
 * Dream Cast (DreamersCast) — открытый клиент студии озвучки.
 * Предоставляет HLS (.m3u8) потоки для воспроизведения в «Нашем плеере».
 *
 * Если сервер недоступен, запрос мягко завершается без прерывания других источников.
 */

import { bare, norm, type AnimeVostQuery } from './animevost'

export interface DreamCastEpisode {
  ordinal: number
  name?: string
  hls: string
  preview?: string
}

export interface DreamCastRelease {
  id: string | number
  title: string
  episodes: DreamCastEpisode[]
}

const API_ENDPOINTS = [
  'https://api.dreamerscast.com/v1',
  'https://api.dreamcast.fun/v1',
  'https://dcast.online/api/v1',
]

const cache = new Map<string, Promise<DreamCastRelease | null>>()

/**
 * Поиск релиза Dream Cast по названию и году.
 * Запоминает результат на время сеанса.
 */
export function findDreamCast(key: string, q: AnimeVostQuery): Promise<DreamCastRelease | null> {
  let hit = cache.get(key)
  if (!hit) {
    hit = search(q)
    cache.set(key, hit)
    hit.catch(() => cache.delete(key))
  }
  return hit
}

async function search(q: AnimeVostQuery): Promise<DreamCastRelease | null> {
  const names = new Set([q.title, q.originalTitle, q.englishTitle].filter(Boolean).map((t) => bare(t)))
  for (const endpoint of API_ENDPOINTS) {
    for (const name of names) {
      try {
        const res = await fetch(`${endpoint}/search?q=${encodeURIComponent(name)}`, {
          signal: AbortSignal.timeout(3000),
        })
        if (!res.ok) continue
        const data = await res.json()
        const items: Array<{ id: string | number; title: string; year?: number | string; episodes?: Array<{ ordinal?: number; number?: number; hls?: string; link?: string; name?: string }> }> =
          data.response || data.items || data.data || []
        const hit = items.find((item) => {
          const matchName = norm(item.title) === norm(bare(q.title)) || (q.originalTitle && norm(item.title) === norm(bare(q.originalTitle)))
          const matchYear = !q.year || !item.year || Number(item.year) === q.year
          return matchName && matchYear
        })
        if (hit && hit.episodes?.length) {
          return {
            id: hit.id,
            title: hit.title,
            episodes: hit.episodes
              .map((ep, i) => ({
                ordinal: ep.ordinal || ep.number || i + 1,
                name: ep.name,
                hls: ep.hls || ep.link || '',
              }))
              .filter((ep) => Boolean(ep.hls)),
          }
        }
      } catch {
        // Пробуем следующее имя или зеркало
      }
    }
  }
  return null
}

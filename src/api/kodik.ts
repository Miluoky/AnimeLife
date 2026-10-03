/**
 * Список озвучек Kodik для тайтла: один запрос к API по id Shikimori.
 * Без токена (VITE_KODIK_TOKEN) ничего не запрашиваем и возвращаем пустой список.
 * Документация: https://kodik-api.com (метод /search).
 */

import { KODIK_TOKEN } from './balancers'

const API = 'https://kodik-api.com/search'

export interface KodikTranslation {
  /** id озвучки у Kodik */
  id: number
  title: string
  kind: 'voice' | 'subtitles'
  /** сколько серий есть в этой озвучке (у фильмов 1) */
  episodes: number
  /** ссылка на плеер этой озвучки, без серии */
  link: string
}

interface KodikResult {
  link: string
  type: string
  episodes_count?: number
  last_episode?: number
  translation: { id: number; title: string; type: string }
}

const cache = new Map<string, Promise<KodikTranslation[]>>()

export function fetchKodikTranslations(shikimoriId: string): Promise<KodikTranslation[]> {
  if (!KODIK_TOKEN || !/^\d+$/.test(shikimoriId)) return Promise.resolve([])
  let found = cache.get(shikimoriId)
  if (!found) {
    found = load(shikimoriId)
    cache.set(shikimoriId, found)
    found.catch(() => cache.delete(shikimoriId))
  }
  return found
}

async function load(shikimoriId: string): Promise<KodikTranslation[]> {
  const url = new URL(API)
  url.searchParams.set('token', KODIK_TOKEN)
  url.searchParams.set('shikimori_id', shikimoriId)
  url.searchParams.set('limit', '100')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Kodik ${res.status}`)
  const { results = [] } = (await res.json()) as { results?: KodikResult[] }
  // Одна озвучка может прийти несколькими записями (по сезонам): оставляем ту, где серий больше.
  const byId = new Map<number, KodikTranslation>()
  for (const r of results) {
    const episodes = r.episodes_count ?? r.last_episode ?? 1
    const prev = byId.get(r.translation.id)
    if (prev && prev.episodes >= episodes) continue
    byId.set(r.translation.id, {
      id: r.translation.id,
      title: r.translation.title,
      kind: r.translation.type === 'subtitles' ? 'subtitles' : 'voice',
      episodes,
      link: r.link.startsWith('//') ? `https:${r.link}` : r.link,
    })
  }
  return [...byId.values()]
}

/** Плеер конкретной озвучки на нужной серии. Свой выбор озвучки в плеере Kodik прячем: он есть рядом. */
export function kodikTranslationUrl(link: string, episode: number) {
  const url = new URL(link)
  url.searchParams.set('episode', String(episode))
  url.searchParams.set('translations', 'false')
  return url.toString()
}

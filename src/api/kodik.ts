/**
 * Список озвучек Kodik для тайтла: один запрос к API по id Shikimori.
 * Без токена (VITE_KODIK_TOKEN) ничего не запрашиваем и возвращаем пустой список.
 * Документация: https://kodik-api.com (метод /search).
 */

import type { SkipSpan } from './anilibria'
import { KODIK_TOKEN, kodikHost } from './balancers'

const API = 'https://kodik-api.com/search'

export interface KodikTranslation {
  /** id озвучки у Kodik */
  id: number
  title: string
  kind: 'voice' | 'subtitles'
  /** номер последней серии в этой озвучке (у фильмов 1) */
  episodes: number
  /** с какой серии озвучка начинается: студии, подхватившие длинный сериал на середине, первых серий не имеют */
  first?: number
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
  // episodes_count — сколько серий есть, last_episode — номер последней. У Ван-Пис студия Shachiburi
  // начала с 1069-й: 112 серий, последняя 1180. Раньше брали 112, и сайт считал, что серий 1180 нет нигде.
  const byId = new Map<number, KodikTranslation>()
  for (const r of results) {
    const count = r.episodes_count ?? r.last_episode ?? 1
    const episodes = Math.max(r.last_episode ?? 0, count)
    const first = r.last_episode && count < r.last_episode ? r.last_episode - count + 1 : undefined
    const prev = byId.get(r.translation.id)
    if (prev && prev.episodes >= episodes) continue
    byId.set(r.translation.id, {
      id: r.translation.id,
      title: r.translation.title,
      kind: r.translation.type === 'subtitles' ? 'subtitles' : 'voice',
      episodes,
      first,
      link: r.link.startsWith('//') ? `https:${r.link}` : r.link,
    })
  }
  return [...byId.values()]
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Параметр skip_button плеера Kodik: кнопки «Пропустить опенинг/эндинг», например [opening]1:30-3:00,[ending]21:40-23:10.
 * https://bd.kodikres.com/player-settings#skip_button
 */
export function kodikSkipParam(spans: SkipSpan[]) {
  return spans
    .filter((s) => s.stop > s.start)
    .map((s) => `[${s.kind}]${clock(s.start)}-${clock(s.stop)}`)
    .join(',')
}

/**
 * Плеер конкретной озвучки на нужной серии. Свой выбор озвучки в плеере Kodik прячем: он есть рядом.
 * Кнопку «Продолжить просмотр» Kodik тоже прячем: место в серии сайт запоминает и восстанавливает сам.
 * skips — разметка опенинга и эндинга этой же озвучки в Kodik (из YummyAnime), если она есть.
 */
export function kodikTranslationUrl(link: string, episode: number, skips?: SkipSpan[]) {
  const url = new URL(kodikHost(link))
  url.searchParams.set('episode', String(episode))
  url.searchParams.set('translations', 'false')
  url.searchParams.set('hide_resume_button', 'true')
  const skip = skips && kodikSkipParam(skips)
  if (skip) url.searchParams.set('skip_button', skip)
  return url.toString()
}

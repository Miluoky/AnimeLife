/**
 * YummyAnime: открытый API каталога (api.yani.tv) со ссылками на серии во многих плеерах сразу:
 * Kodik, CVH (видео из VK), Alloha, Aksor, Sibnet. У каждой озвучки бывает несколько плееров, и если один
 * не грузится (блокировка, сбой), серию можно открыть в другом. Ключ не нужен, CORS открыт.
 * Тайтл ищем по названию и берём только тот, у которого тот же id Shikimori.
 * Список серий большой и приходит без сжатия, поэтому на animelife.top он идёт через свой Worker (worker/yummyProxy.js).
 */

import type { SkipSpan } from './anilibria'
import { voiceKey } from './voiceKey'

export { voiceKey }

const API = 'https://api.yani.tv'
const host = globalThis.location?.hostname
const VIDEOS = host === 'animelife.top' || host === 'www.animelife.top' ? `${location.origin}/api/yummy/videos` : `${API}/anime`
const videosUrl = (id: number) => (VIDEOS.startsWith(API) ? `${VIDEOS}/${id}/videos` : `${VIDEOS}/${id}`)

export interface YummyPlayer {
  /** Kodik, CVH, Alloha… */
  name: string
  /** номер серии → адрес iframe */
  urls: Map<number, string>
  /** номер серии → размеченные опенинг и эндинг */
  skips: Map<number, YummySkips>
}

/** Опенинг и эндинг серии и длина видео, для которого они размечены: у другого файла той же серии разметка не подойдёт. */
export interface YummySkips {
  spans: SkipSpan[]
  duration: number
}

export interface YummyVoice {
  title: string
  kind: 'voice' | 'subtitles'
  episodes: number
  /** от надёжного к запасному */
  players: YummyPlayer[]
}

interface SearchItem {
  anime_id: number
  remote_ids?: { shikimori_id?: number | null } | null
}

interface VideoItem {
  number: string
  iframe_url: string
  data: { player: string; dubbing: string }
  skips?: Partial<Record<SkipSpan['kind'], { time: number; length: number } | null>> | null
  duration?: number
}

// Kodik и CVH проверены на нашем сайте; остальные — запасные.
const PLAYER_ORDER = ['Kodik', 'CVH', 'Alloha', 'Aksor', 'Sibnet']
const rank = (name: string) => {
  const i = PLAYER_ORDER.indexOf(name)
  return i < 0 ? PLAYER_ORDER.length : i
}

function skipsOf(v: VideoItem): YummySkips | null {
  const spans: SkipSpan[] = []
  for (const kind of ['opening', 'ending'] as const) {
    const s = v.skips?.[kind]
    if (s && Number.isFinite(s.time) && s.length >= 5) spans.push({ kind, start: s.time, stop: s.time + s.length })
  }
  return spans.length && v.duration && v.duration > 0 ? { spans, duration: v.duration } : null
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`YummyAnime ${res.status}`)
  return res.json()
}

const found = new Map<string, Promise<YummyVoice[] | null>>()

/** Озвучки тайтла с плеерами или null, если в YummyAnime его нет. Ответы запоминаем на сеанс. */
export function findYummy(shikimoriId: string, titles: (string | undefined)[]): Promise<YummyVoice[] | null> {
  let hit = found.get(shikimoriId)
  if (!hit) {
    hit = load(Number(shikimoriId), titles)
    found.set(shikimoriId, hit)
    hit.catch(() => found.delete(shikimoriId))
  }
  return hit
}

async function load(shikimoriId: number, titles: (string | undefined)[]): Promise<YummyVoice[] | null> {
  for (const q of new Set(titles.filter((t): t is string => !!t))) {
    const { response = [] } = await get<{ response?: SearchItem[] }>(`${API}/search?q=${encodeURIComponent(q)}&limit=10`)
    const item = response.find((r) => r.remote_ids?.shikimori_id === shikimoriId)
    if (item) return parseVideos((await get<{ response?: VideoItem[] }>(videosUrl(item.anime_id))).response ?? [])
  }
  return null
}

/** Плоский список «серия × озвучка × плеер» → озвучки с плеерами. Порядок озвучек — по числу серий. */
export function parseVideos(list: VideoItem[]): YummyVoice[] {
  const voices = new Map<string, { title: string; kind: YummyVoice['kind']; players: Map<string, YummyPlayer> }>()
  for (const v of list) {
    const n = Number(v.number)
    if (!Number.isInteger(n) || n < 1 || !v.iframe_url) continue
    const url = v.iframe_url.startsWith('//') ? `https:${v.iframe_url}` : v.iframe_url
    if (!url.startsWith('https://')) continue
    const kind = /^Субтитры/.test(v.data.dubbing) ? 'subtitles' : 'voice'
    const title = v.data.dubbing.replace(/^(Озвучка|Субтитры)\s*/, '') || 'Субтитры'
    const key = `${kind}:${voiceKey(title)}`
    let voice = voices.get(key)
    if (!voice) voices.set(key, (voice = { title, kind, players: new Map() }))
    const name = v.data.player.replace(/^Плеер\s*/, '')
    let player = voice.players.get(name)
    if (!player) voice.players.set(name, (player = { name, urls: new Map(), skips: new Map() }))
    if (player.urls.has(n)) continue
    player.urls.set(n, url)
    const skips = skipsOf(v)
    if (skips) player.skips.set(n, skips)
  }
  return [...voices.values()]
    .map(({ title, kind, players }) => {
      const list = [...players.values()].sort((a, b) => rank(a.name) - rank(b.name))
      return { title, kind, players: list, episodes: Math.max(...list.map((p) => p.urls.size)) }
    })
    .sort((a, b) => b.episodes - a.episodes)
}

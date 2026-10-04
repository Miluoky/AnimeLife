/**
 * Anixart: открытый API приложения с каталогом озвучек. У большинства студий серии лежат
 * в плеере Kodik, и эти ссылки встраиваются на любой сайт без токена.
 * Запросы: POST /search/releases/0 (поиск), GET /episode/{релиз} (озвучки),
 * /episode/{релиз}/{озвучка} (источники) и /episode/{релиз}/{озвучка}/{источник} (серии). CORS открыт.
 * Id Shikimori у Anixart нет, поэтому релиз сверяем по названию и году, как у AnimeVost.
 */

import { bare, norm, type AnimeVostQuery } from './animevost'

const API = 'https://api.anixart.tv'

export interface AnixartVoice {
  /** id озвучки у Anixart */
  type: number
  title: string
  kind: 'voice' | 'subtitles'
  episodes: number
  /** логотип студии 150×150, есть не у всех */
  icon?: string
}

export interface AnixartRelease {
  id: number
  voices: AnixartVoice[]
}

interface SearchItem {
  id: number
  title_ru?: string | null
  title_original?: string | null
  year?: string | null
}

interface TypeItem {
  id: number
  name: string
  is_sub: boolean
  episodes_count: number
  icon?: string | null
}

interface SourceItem {
  id: number
  name: string
  episodes_count: number
}

interface EpisodeItem {
  position: number
  url: string
  iframe: boolean
  is_filler?: boolean
}

/** Серии одной озвучки: адреса встраиваемого плеера и номера филлеров (серий не по сюжету манги). */
export interface AnixartEpisodes {
  urls: Map<number, string>
  fillers: Set<number>
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  if (!res.ok) throw new Error(`Anixart ${path} ${res.status}`)
  return res.json()
}

/** Тот ли это релиз: совпало русское, оригинальное или английское название, а год (если известен) не противоречит. */
export function sameRelease(item: SearchItem, q: AnimeVostQuery): boolean {
  const ru = norm(item.title_ru ?? '')
  const original = norm(item.title_original ?? '')
  const sameName =
    ru === norm(bare(q.title)) || [q.originalTitle, q.englishTitle].some((t) => !!t && original === norm(bare(t)))
  const year = Number(item.year)
  return sameName && (!q.year || !year || year === q.year)
}

const releases = new Map<string, Promise<AnixartRelease | null>>()

/** Релиз Anixart с озвучками или null, если такого тайтла там нет. Ответы запоминаем на сеанс. */
export function findAnixart(key: string, q: AnimeVostQuery): Promise<AnixartRelease | null> {
  let found = releases.get(key)
  if (!found) {
    found = search(q)
    releases.set(key, found)
    found.catch(() => releases.delete(key))
  }
  return found
}

async function search(q: AnimeVostQuery): Promise<AnixartRelease | null> {
  for (const query of new Set([q.title, q.originalTitle, q.englishTitle].filter(Boolean).map((t) => bare(t)))) {
    const res = await call<{ content?: SearchItem[] }>('/search/releases/0', { query, searchBy: 0 })
    const hit = res.content?.find((item) => sameRelease(item, q))
    if (!hit) continue
    const { types = [] } = await call<{ types?: TypeItem[] }>(`/episode/${hit.id}`)
    // Порядок Anixart — по популярности озвучки: его и сохраняем.
    const voices = types
      .filter((t) => t.episodes_count > 0)
      .map((t) => ({ type: t.id, title: t.name.replace(/^Субтитры \| /, ''), kind: t.is_sub ? 'subtitles' : 'voice', episodes: t.episodes_count, icon: t.icon?.startsWith('https://') ? t.icon : undefined }) as AnixartVoice)
    return { id: hit.id, voices }
  }
  return null
}

const episodes = new Map<string, Promise<AnixartEpisodes>>()

/** Серии одной озвучки: номер → адрес iframe (пустая карта — встроить нечего) и филлеры. */
export function anixartEpisodes(release: number, type: number): Promise<AnixartEpisodes> {
  const key = `${release}:${type}`
  let found = episodes.get(key)
  if (!found) {
    found = loadEpisodes(release, type)
    episodes.set(key, found)
    found.catch(() => episodes.delete(key))
  }
  return found
}

async function loadEpisodes(release: number, type: number): Promise<AnixartEpisodes> {
  const { sources = [] } = await call<{ sources?: SourceItem[] }>(`/episode/${release}/${type}`)
  // Kodik встраивается везде; источники с пометкой «не работает» пропускаем.
  const ordered = sources.filter((s) => !/не работает/i.test(s.name)).sort((a, b) => Number(b.name === 'Kodik') - Number(a.name === 'Kodik'))
  const fillers = new Set<number>()
  for (const source of ordered) {
    const list = await call<{ episodes?: EpisodeItem[] }>(`/episode/${release}/${type}/${source.id}`)
    const urls = new Map<number, string>()
    for (const e of list.episodes ?? []) {
      if (e.is_filler) fillers.add(e.position)
      if (e.iframe && /^https:\/\//.test(e.url)) urls.set(e.position, e.url)
    }
    if (urls.size) return { urls, fillers }
  }
  return { urls: new Map(), fillers }
}

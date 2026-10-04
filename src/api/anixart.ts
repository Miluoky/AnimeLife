/**
 * Anixart: открытый API приложения с каталогом озвучек. У большинства студий серии лежат
 * в плеере Kodik, и эти ссылки встраиваются на любой сайт без токена.
 * Запросы: POST /search/releases/0 (поиск), GET /episode/{релиз} (озвучки),
 * /episode/{релиз}/{озвучка} (источники) и /episode/{релиз}/{озвучка}/{источник} (серии). CORS открыт.
 * Id Shikimori у Anixart нет, поэтому релиз сверяем по названию и году, как у AnimeVost.
 */

import { norm, type AnimeVostQuery } from './animevost'

const API = 'https://api.anixart.tv'

export interface AnixartVoice {
  /** id озвучки у Anixart */
  type: number
  title: string
  kind: 'voice' | 'subtitles'
  episodes: number
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
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  if (!res.ok) throw new Error(`Anixart ${path} ${res.status}`)
  return res.json()
}

/** Тот ли это релиз: совпало русское или оригинальное название, а год (если известен) не противоречит. */
export function sameRelease(item: SearchItem, q: AnimeVostQuery): boolean {
  const sameName = norm(item.title_ru ?? '') === norm(q.title) || (!!q.originalTitle && norm(item.title_original ?? '') === norm(q.originalTitle))
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
  for (const query of new Set([q.title, q.originalTitle].filter(Boolean) as string[])) {
    const res = await call<{ content?: SearchItem[] }>('/search/releases/0', { query, searchBy: 0 })
    const hit = res.content?.find((item) => sameRelease(item, q))
    if (!hit) continue
    const { types = [] } = await call<{ types?: TypeItem[] }>(`/episode/${hit.id}`)
    // Порядок Anixart — по популярности озвучки: его и сохраняем.
    const voices = types
      .filter((t) => t.episodes_count > 0)
      .map((t) => ({ type: t.id, title: t.name.replace(/^Субтитры \| /, ''), kind: t.is_sub ? 'subtitles' : 'voice', episodes: t.episodes_count }) as AnixartVoice)
    return { id: hit.id, voices }
  }
  return null
}

const episodes = new Map<string, Promise<Map<number, string>>>()

/** Ссылки на плеер серий одной озвучки: номер → адрес iframe. Пустая карта — встроить нечего. */
export function anixartEpisodes(release: number, type: number): Promise<Map<number, string>> {
  const key = `${release}:${type}`
  let found = episodes.get(key)
  if (!found) {
    found = loadEpisodes(release, type)
    episodes.set(key, found)
    found.catch(() => episodes.delete(key))
  }
  return found
}

async function loadEpisodes(release: number, type: number): Promise<Map<number, string>> {
  const { sources = [] } = await call<{ sources?: SourceItem[] }>(`/episode/${release}/${type}`)
  // Kodik встраивается везде; источники с пометкой «не работает» пропускаем.
  const ordered = sources.filter((s) => !/не работает/i.test(s.name)).sort((a, b) => Number(b.name === 'Kodik') - Number(a.name === 'Kodik'))
  for (const source of ordered) {
    const list = await call<{ episodes?: EpisodeItem[] }>(`/episode/${release}/${type}/${source.id}`)
    const map = new Map<number, string>()
    for (const e of list.episodes ?? []) if (e.iframe && /^https:\/\//.test(e.url)) map.set(e.position, e.url)
    if (map.size) return map
  }
  return new Map()
}

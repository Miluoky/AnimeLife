import { fetchAnimesByIds, fetchUserRates } from '../api/shikimori'
import type { Anime } from './catalog'
import { download, siteUrl } from './ics'
import { mergeImported, type ListEntry, type ListStatus } from './myList'

/**
 * Импорт списка из Shikimori (по нику) и MyAnimeList (файл экспорта .xml или .xml.gz) и экспорт обратно.
 * ID тайтлов на Shikimori совпадают с MyAnimeList, поэтому файл MAL сопоставляется без поиска по названиям.
 */

const shikiStatus: Record<string, ListStatus> = {
  watching: 'watching',
  rewatching: 'watching',
  planned: 'planned',
  on_hold: 'on_hold',
  completed: 'completed',
  dropped: 'dropped',
}

const malStatus: Record<string, ListStatus> = {
  watching: 'watching',
  '1': 'watching',
  completed: 'completed',
  '2': 'completed',
  'on-hold': 'on_hold',
  '3': 'on_hold',
  dropped: 'dropped',
  '4': 'dropped',
  'plan to watch': 'planned',
  '6': 'planned',
}

function card(a: Anime): ListEntry['anime'] {
  const { id, title, year, kind, episodes, ongoing, score, posterUrl, posterSmall, posterSmall2x, posterFill } = a
  return { id, title, year, kind, episodes, ongoing, score, posterUrl, posterSmall, posterSmall2x, posterFill }
}

function entry(a: Anime, status: ListStatus, watched: number, score: number, at: number): ListEntry {
  return {
    anime: card(a),
    status,
    addedAt: at,
    updatedAt: at,
    watched: watched || undefined,
    rating: score >= 1 && score <= 10 ? score : undefined,
    ratedAt: score >= 1 && score <= 10 ? at : undefined,
  }
}

export interface ImportResult {
  total: number
  added: number
}

export async function importFromShikimori(nickname: string): Promise<ImportResult> {
  const name = nickname.trim().replace(/^https?:\/\/shikimori\.[a-z]+\//, '').replace(/\/.*$/, '')
  if (!name) throw new Error('Укажите ник на Shikimori')
  let rates
  try {
    rates = await fetchUserRates(name)
  } catch (e) {
    throw new Error(
      String(e).includes('404') ? 'Такого пользователя на Shikimori нет' : 'Shikimori не ответил, попробуйте позже',
    )
  }
  const entries = rates
    .filter((r) => shikiStatus[r.status])
    .map((r) => entry(r.anime, shikiStatus[r.status], r.episodes, r.score, r.updatedAt))
  return { total: entries.length, added: mergeImported(entries) }
}

async function readText(file: File) {
  if (file.name.endsWith('.gz') && 'DecompressionStream' in window) {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).text()
  }
  return file.text()
}

export async function importFromMal(file: File): Promise<ImportResult> {
  const xml = new DOMParser().parseFromString(await readText(file), 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('Это не файл экспорта MyAnimeList')
  const rows = [...xml.querySelectorAll('anime')]
    .map((n) => ({
      id: n.querySelector('series_animedb_id')?.textContent?.trim() ?? '',
      status: malStatus[(n.querySelector('my_status')?.textContent ?? '').trim().toLowerCase()],
      watched: Number(n.querySelector('my_watched_episodes')?.textContent) || 0,
      score: Number(n.querySelector('my_score')?.textContent) || 0,
    }))
    .filter((r) => /^\d+$/.test(r.id) && r.status)
  if (!rows.length) throw new Error('В файле не нашлось тайтлов')
  const animes = new Map((await fetchAnimesByIds(rows.map((r) => r.id))).map((a) => [a.id, a]))
  const now = Date.now()
  const entries = rows
    .filter((r) => animes.has(r.id))
    .map((r) => entry(animes.get(r.id)!, r.status, r.watched, r.score, now))
  return { total: entries.length, added: mergeImported(entries) }
}

const toMal: Record<ListStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  planned: 'Plan to Watch',
  on_hold: 'On-Hold',
  dropped: 'Dropped',
}

/** Экспорт в формате MyAnimeList: этот файл понимают MAL, Shikimori, AniList и Kitsu. */
export function exportForMal(list: ListEntry[]) {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)
  const items = list
    .filter((e) => /^\d+$/.test(e.anime.id))
    .map(
      (e) => `  <anime>
    <series_animedb_id>${e.anime.id}</series_animedb_id>
    <series_title><![CDATA[${e.anime.title}]]></series_title>
    <series_episodes>${e.anime.episodes ?? 0}</series_episodes>
    <my_watched_episodes>${e.watched ?? (e.status === 'completed' ? (e.anime.episodes ?? 0) : 0)}</my_watched_episodes>
    <my_score>${e.rating ?? 0}</my_score>
    <my_status>${toMal[e.status]}</my_status>
    <update_on_import>1</update_on_import>
  </anime>`,
    )
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_export_type>1</user_export_type>
    <user_name>${esc('Anime Life')}</user_name>
  </myinfo>
${items.join('\n')}
</myanimelist>
`
  download(new Blob([xml], { type: 'application/xml' }), 'anime-life-list.xml')
}

/** Полная копия списка в JSON: на случай переезда или резервной копии. */
export function exportJson(list: ListEntry[]) {
  const data = { site: siteUrl('/'), exportedAt: new Date().toISOString(), list }
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'anime-life-list.json')
}

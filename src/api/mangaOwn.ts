import { APPWRITE_ENDPOINT, APPWRITE_PROJECT, BACKEND, COMMUNITY_DB } from './config'
import type { Chapter } from './mangadex'

// Главы, которые команды переводчиков загрузили прямо на Anime Life.
// Appwrite: таблица manga_chapters + хранилище manga-pages.
// Core: D1 manga_chapters + R2 (/api/core/manga*).
// R2 пока отложено (биллинг Cloudflare из РФ) — свои главы на Core выключены.

export const OWN_TABLE = 'manga_chapters'
export const OWN_BUCKET = 'manga-pages'
/** id наших глав в адресе читалки начинаются с этой приставки, у глав MangaDex там UUID */
export const OWN_PREFIX = 'al-'
/** false, пока нет R2 / внешнего object storage. Включить вместе с binding MANGA. */
export const OWN_MANGA_ENABLED = false

interface OwnRow {
  $id: string
  mangaId: string
  lang: string
  num: string
  title?: string | null
  team: string
  pages: string[]
}

interface CoreChapterRow {
  id: string
  mangaId: string
  lang: string
  num: string
  title?: string | null
  team: string
  pages: string[]
  pageUrls: string[]
}

export const pageUrl = (fileId: string) =>
  BACKEND === 'core'
    ? `${typeof location !== 'undefined' ? location.origin : ''}/api/core/manga-img/${encodeURIComponent(fileId)}`
    : `${APPWRITE_ENDPOINT}/storage/buckets/${OWN_BUCKET}/files/${encodeURIComponent(fileId)}/view?project=${APPWRITE_PROJECT}`

const toChapter = (r: OwnRow | CoreChapterRow, pageUrls?: string[]): Chapter => {
  const id = '$id' in r ? r.$id : r.id
  const urls = pageUrls ?? ('pageUrls' in r && r.pageUrls?.length ? r.pageUrls : r.pages.map(pageUrl))
  return {
    id: OWN_PREFIX + id,
    num: r.num,
    title: r.title || undefined,
    pages: r.pages.length,
    group: r.team,
    own: true,
    lang: r.lang,
    pageUrls: urls,
  }
}

async function rows<T>(path: string, queries: object[] = []): Promise<T | null> {
  const url = new URL(`${APPWRITE_ENDPOINT}/tablesdb/${COMMUNITY_DB}/tables/${OWN_TABLE}/rows${path}`)
  for (const q of queries) url.searchParams.append('queries[]', JSON.stringify(q))
  const res = await fetch(url, { headers: { 'X-Appwrite-Project': APPWRITE_PROJECT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Appwrite ${res.status}`)
  return res.json() as Promise<T>
}

async function coreChapters(mangaId: string): Promise<Chapter[]> {
  const res = await fetch(`/api/core/manga/chapters?mangaId=${encodeURIComponent(mangaId)}`, { credentials: 'include' })
  if (res.status === 404 || res.status === 503) return []
  if (!res.ok) throw new Error(`Core ${res.status}`)
  const data = (await res.json()) as { chapters?: CoreChapterRow[] }
  return (data.chapters ?? []).map((c) => toChapter(c))
}

async function coreChapter(rowId: string): Promise<Chapter | null> {
  const res = await fetch(`/api/core/manga/chapters/${encodeURIComponent(rowId)}`, { credentials: 'include' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Core ${res.status}`)
  const data = (await res.json()) as { chapter?: CoreChapterRow }
  return data.chapter ? toChapter(data.chapter) : null
}

const cache = new Map<string, Promise<Chapter[]>>()

/** Все наши главы тайтла на всех языках. */
export function fetchOwnChapters(mangaId: string): Promise<Chapter[]> {
  if (BACKEND === 'core') {
    if (!OWN_MANGA_ENABLED) return Promise.resolve([])
    if (!cache.has(mangaId)) {
      const p = coreChapters(mangaId)
      p.catch(() => cache.delete(mangaId))
      cache.set(mangaId, p)
    }
    return cache.get(mangaId)!
  }
  if (!cache.has(mangaId)) {
    const p = rows<{ rows: OwnRow[] }>('', [
      { method: 'equal', attribute: 'mangaId', values: [mangaId] },
      { method: 'limit', values: [1000] },
    ]).then((res) => (res?.rows ?? []).map((r) => toChapter(r)))
    p.catch(() => cache.delete(mangaId))
    cache.set(mangaId, p)
  }
  return cache.get(mangaId)!
}

/** Одна наша глава по id из адреса читалки (без приставки). */
export async function fetchOwnChapter(rowId: string): Promise<Chapter | null> {
  if (BACKEND === 'core') {
    if (!OWN_MANGA_ENABLED) return null
    return coreChapter(rowId)
  }
  const r = await rows<OwnRow>(`/${encodeURIComponent(rowId)}`)
  return r ? toChapter(r) : null
}

export const forget = (mangaId: string) => cache.delete(mangaId)

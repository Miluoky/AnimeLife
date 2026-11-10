import { LEGACY_APPWRITE_PROJECT, LEGACY_APPWRITE_V1 } from './config'
import type { Chapter } from './mangadex'

// Главы, которые команды переводчиков загрузили прямо на Anime Life.
// Core: D1 manga_chapters + R2 (/api/core/manga*).
// R2 пока отложено (биллинг Cloudflare из РФ) — свои главы на Core выключены.

export const OWN_TABLE = 'manga_chapters'
export const OWN_BUCKET = 'manga-pages'
/** id наших глав в адресе читалки начинаются с этой приставки, у глав MangaDex там UUID */
export const OWN_PREFIX = 'al-'
/** false, пока нет R2 / внешнего object storage. Включить вместе с binding MANGA. */
export const OWN_MANGA_ENABLED = false

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

/** Legacy: страницы, ещё лежащие в bucket Appwrite manga-pages (публичный view, без SDK). */
export const legacyMangaPageUrl = (fileId: string) =>
  `${LEGACY_APPWRITE_V1}/storage/buckets/${OWN_BUCKET}/files/${encodeURIComponent(fileId)}/view?project=${LEGACY_APPWRITE_PROJECT}`

export const pageUrl = (fileId: string) =>
  `${typeof location !== 'undefined' ? location.origin : ''}/api/core/manga-img/${encodeURIComponent(fileId)}`

const toChapter = (r: CoreChapterRow, pageUrls?: string[]): Chapter => {
  const urls = pageUrls ?? (r.pageUrls?.length ? r.pageUrls : r.pages.map(pageUrl))
  return {
    id: OWN_PREFIX + r.id,
    num: r.num,
    title: r.title || undefined,
    pages: r.pages.length,
    group: r.team,
    own: true,
    lang: r.lang,
    pageUrls: urls,
  }
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
  if (!OWN_MANGA_ENABLED) return Promise.resolve([])
  if (!cache.has(mangaId)) {
    const p = coreChapters(mangaId)
    p.catch(() => cache.delete(mangaId))
    cache.set(mangaId, p)
  }
  return cache.get(mangaId)!
}

/** Одна наша глава по id из адреса читалки (без приставки). */
export async function fetchOwnChapter(rowId: string): Promise<Chapter | null> {
  if (!OWN_MANGA_ENABLED) return null
  return coreChapter(rowId)
}

export const forget = (mangaId: string) => cache.delete(mangaId)

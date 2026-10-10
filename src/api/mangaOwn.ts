import { APPWRITE_ENDPOINT, APPWRITE_PROJECT, COMMUNITY_DB } from './config'
import type { Chapter } from './mangadex'

// Главы, которые команды переводчиков загрузили прямо на Anime Life (таблица manga_chapters, хранилище manga-pages,
// см. functions/community/setup-manga.mjs). Читаем обычным запросом без SDK Appwrite: он тяжёлый, а чтение публичное.

export const OWN_TABLE = 'manga_chapters'
export const OWN_BUCKET = 'manga-pages'
/** id наших глав в адресе читалки начинаются с этой приставки, у глав MangaDex там UUID */
export const OWN_PREFIX = 'al-'

interface OwnRow {
  $id: string
  mangaId: string
  lang: string
  num: string
  title?: string | null
  team: string
  pages: string[]
}

export const pageUrl = (fileId: string) =>
  `${APPWRITE_ENDPOINT}/storage/buckets/${OWN_BUCKET}/files/${encodeURIComponent(fileId)}/view?project=${APPWRITE_PROJECT}`

const toChapter = (r: OwnRow): Chapter => ({
  id: OWN_PREFIX + r.$id,
  num: r.num,
  title: r.title || undefined,
  pages: r.pages.length,
  group: r.team,
  own: true,
  lang: r.lang,
  pageUrls: r.pages.map(pageUrl),
})

async function rows<T>(path: string, queries: object[] = []): Promise<T | null> {
  const url = new URL(`${APPWRITE_ENDPOINT}/tablesdb/${COMMUNITY_DB}/tables/${OWN_TABLE}/rows${path}`)
  for (const q of queries) url.searchParams.append('queries[]', JSON.stringify(q))
  const res = await fetch(url, { headers: { 'X-Appwrite-Project': APPWRITE_PROJECT } })
  // Таблицы ещё нет или глава удалена: просто нет наших глав.
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Appwrite ${res.status}`)
  return res.json() as Promise<T>
}

const cache = new Map<string, Promise<Chapter[]>>()

/** Все наши главы тайтла на всех языках. */
export function fetchOwnChapters(mangaId: string): Promise<Chapter[]> {
  if (!cache.has(mangaId)) {
    const p = rows<{ rows: OwnRow[] }>('', [
      { method: 'equal', attribute: 'mangaId', values: [mangaId] },
      { method: 'limit', values: [1000] },
    ]).then((res) => (res?.rows ?? []).map(toChapter))
    p.catch(() => cache.delete(mangaId))
    cache.set(mangaId, p)
  }
  return cache.get(mangaId)!
}

/** Одна наша глава по id из адреса читалки (без приставки). */
export async function fetchOwnChapter(rowId: string): Promise<Chapter | null> {
  const r = await rows<OwnRow>(`/${encodeURIComponent(rowId)}`)
  return r ? toChapter(r) : null
}

export const forget = (mangaId: string) => cache.delete(mangaId)

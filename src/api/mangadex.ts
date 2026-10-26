// Главы манги из MangaDex для читалки. На animelife.top и запросы, и картинки страниц идут через Worker
// (worker/mangadexProxy.js): MangaDex не пускает браузер с чужих сайтов и заблокирован в России.

const host = globalThis.location?.hostname
const proxied = host === 'animelife.top' || host === 'www.animelife.top'
const API = proxied ? `${location.origin}/api/mangadex` : 'https://api.mangadex.org'
const IMAGES = proxied ? `${location.origin}/api/mangadex-img` : undefined

/** Языки по-русски. Порядок здесь — порядок кнопок: свои языки сначала. */
export const LANGS: Record<string, string> = {
  ru: 'Русский',
  uk: 'Украинский',
  en: 'Английский',
  ja: 'Японский',
  'ja-ro': 'Японский (ромадзи)',
  ko: 'Корейский',
  zh: 'Китайский',
  'zh-hk': 'Китайский (Гонконг)',
  es: 'Испанский',
  'es-la': 'Испанский (Лат. Ам.)',
  'pt-br': 'Португальский (Бразилия)',
  pt: 'Португальский',
  fr: 'Французский',
  de: 'Немецкий',
  it: 'Итальянский',
  pl: 'Польский',
  tr: 'Турецкий',
  id: 'Индонезийский',
  vi: 'Вьетнамский',
  th: 'Тайский',
  ar: 'Арабский',
  cs: 'Чешский',
  el: 'Греческий',
  la: 'Латынь',
}
const langRank = (l: string) => {
  const i = Object.keys(LANGS).indexOf(l)
  return i === -1 ? 999 : i
}
// Редких языков нет в LANGS: название по-русски даёт сам браузер («румынский» → «Румынский»), код — только если не знает и он.
const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['ru'], { type: 'language', fallback: 'none' }) : undefined
function browserName(l: string) {
  try {
    const name = names?.of(l)
    return name ? name[0].toUpperCase() + name.slice(1) : undefined
  } catch {
    return undefined
  }
}
export const langName = (l: string) => LANGS[l] ?? browserName(l) ?? l.toUpperCase()
export const sortLangs = (langs: string[]) => [...new Set(langs)].sort((a, b) => langRank(a) - langRank(b))

export interface MangadexTitle {
  id: string
  /** языки, на которых есть главы: русский первым */
  langs: string[]
}

export interface Chapter {
  id: string
  /** номер главы как строка: бывают 10.5 и пустые (ваншоты) */
  num: string
  volume?: string
  title?: string
  pages: number
  group?: string
  /** глава загружена командой прямо на Anime Life (src/api/mangaOwn.ts), а не взята с MangaDex */
  own?: boolean
  lang?: string
  /** готовые адреса страниц у наших глав; у глав MangaDex адреса выдаёт at-home */
  pageUrls?: string[]
}

async function api<T>(path: string, params: [string, string][] = []): Promise<T> {
  const url = new URL(`${API}/${path}`)
  for (const [k, v] of params) url.searchParams.append(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MangaDex ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

interface MdManga {
  id: string
  attributes: { links: Record<string, string> | null; availableTranslatedLanguages: (string | null)[] }
}

const found = new Map<string, Promise<MangadexTitle | null>>()

/**
 * Та же манга на MangaDex. Ищем по названиям и берём ту, у которой ссылка на MyAnimeList совпадает с id Shikimori:
 * по одному названию легко попасть в додзинси или антологию.
 */
export function findMangadex(shikiId: string, names: (string | undefined)[]): Promise<MangadexTitle | null> {
  if (!found.has(shikiId)) {
    const search = async () => {
      for (const name of [...new Set(names.filter((n): n is string => Boolean(n)))].slice(0, 3)) {
        const res = await api<{ data: MdManga[] }>('manga', [
          ['title', name],
          ['limit', '20'],
          ['contentRating[]', 'safe'],
          ['contentRating[]', 'suggestive'],
          ['contentRating[]', 'erotica'],
        ])
        const m = res.data.find((d) => d.attributes.links?.mal === shikiId)
        if (m) {
          const langs = m.attributes.availableTranslatedLanguages.filter((l): l is string => Boolean(l))
          return { id: m.id, langs: langs.sort((a, b) => langRank(a) - langRank(b)) }
        }
      }
      return null
    }
    const p = search()
    p.catch(() => found.delete(shikiId))
    found.set(shikiId, p)
  }
  return found.get(shikiId)!
}

interface MdChapter {
  id: string
  attributes: { chapter: string | null; volume: string | null; title: string | null; pages: number; externalUrl: string | null }
  relationships: { type: string; attributes?: { name: string } }[]
}

const lists = new Map<string, Promise<Chapter[]>>()

/** Все главы на одном языке по порядку. Если одну главу перевели несколько команд, берём первый перевод. */
export function fetchChapters(mdId: string, lang: string): Promise<Chapter[]> {
  const key = `${mdId}:${lang}`
  if (!lists.has(key)) {
    const load = async () => {
      const out: Chapter[] = []
      const seen = new Set<string>()
      for (let offset = 0; offset < 5000; offset += 500) {
        const res = await api<{ data: MdChapter[]; total: number }>(`manga/${mdId}/feed`, [
          ['translatedLanguage[]', lang],
          ['limit', '500'],
          ['offset', String(offset)],
          ['order[volume]', 'asc'],
          ['order[chapter]', 'asc'],
          ['includes[]', 'scanlation_group'],
          ['includeExternalUrl', '0'],
          ['includeUnavailable', '0'],
          ['contentRating[]', 'safe'],
          ['contentRating[]', 'suggestive'],
          ['contentRating[]', 'erotica'],
        ])
        for (const c of res.data) {
          const num = c.attributes.chapter ?? ''
          if (c.attributes.externalUrl || !c.attributes.pages || (num && seen.has(num))) continue
          seen.add(num)
          out.push({
            id: c.id,
            num,
            volume: c.attributes.volume ?? undefined,
            title: c.attributes.title || undefined,
            pages: c.attributes.pages,
            group: c.relationships.find((r) => r.type === 'scanlation_group')?.attributes?.name,
          })
        }
        if (offset + 500 >= res.total) break
      }
      // Тома без номера MangaDex ставит в конец: сортируем по номеру главы, чтобы порядок был сквозным.
      return out.sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0))
    }
    const p = load()
    p.catch(() => lists.delete(key))
    lists.set(key, p)
  }
  return lists.get(key)!
}

/** Адреса картинок главы. saver — сжатые версии, вдвое-втрое легче. */
export async function fetchPages(chapterId: string, saver: boolean): Promise<string[]> {
  const res = await api<{ baseUrl: string; chapter: { hash: string; data: string[]; dataSaver: string[] } }>(`at-home/server/${chapterId}`)
  const files = saver ? res.chapter.dataSaver : res.chapter.data
  const dir = `${saver ? 'data-saver' : 'data'}/${res.chapter.hash}`
  return files.map((f) => (IMAGES ? `${IMAGES}/${dir}/${f}?n=${encodeURIComponent(res.baseUrl)}` : `${res.baseUrl}/${dir}/${f}`))
}

/** Запасной адрес картинки: напрямую с основного сервера MangaDex (вне России работает и без Worker). */
export const fallbackPage = (src: string) => src.replace(/^.*?\/(data(?:-saver)?\/)/, 'https://uploads.mangadex.org/$1').replace(/\?.*$/, '')

export const chapterLabel = (c: Pick<Chapter, 'num' | 'title'>) => (c.num ? `Глава ${c.num}` : c.title || 'Ваншот')

// Выбранный язык и место чтения храним в браузере, как историю просмотра.
const LANG_KEY = 'anime.mangaLang.v1'
const PROGRESS_KEY = 'anime.mangaProgress.v1'

export interface ReadProgress {
  lang: string
  chapterId: string
  num: string
  at: number
  /** название и обложка для полки «Читаю» в разделе /manga */
  title?: string
  image?: string
  /** страница, на которой остановились (с 1), в постраничном режиме и в ленте */
  page?: number
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

export const preferredLang = () => readJson<string>(LANG_KEY, 'ru')
export function setPreferredLang(lang: string) {
  try {
    localStorage.setItem(LANG_KEY, JSON.stringify(lang))
  } catch {
    // Без хранилища язык просто не запомнится.
  }
}

/** Всё, что читали: свежее первым. */
export const allProgress = () =>
  Object.entries(readJson<Record<string, ReadProgress>>(PROGRESS_KEY, {}))
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.at - a.at)

export const readProgress = (mangaId: string) => readJson<Record<string, ReadProgress>>(PROGRESS_KEY, {})[mangaId]
export function saveProgress(mangaId: string, p: ReadProgress) {
  try {
    const all = readJson<Record<string, ReadProgress>>(PROGRESS_KEY, {})
    all[mangaId] = p
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
  } catch {
    // Без хранилища место чтения не запомнится.
  }
}

/**
 * Главы на одном языке из обоих источников: наши (загруженные командами) и MangaDex.
 * Если одну главу есть в обоих, берём нашу: её команда выложила для читателей Anime Life.
 */
export async function mergeChapters(own: Chapter[], mdId: string | undefined, lang: string): Promise<Chapter[]> {
  const ours = own.filter((c) => c.lang === lang)
  const md = mdId ? await fetchChapters(mdId, lang) : []
  const taken = new Set(ours.map((c) => c.num))
  return [...ours, ...md.filter((c) => !c.num || !taken.has(c.num))].sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0))
}

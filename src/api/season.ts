import { cleanDescription, graphql } from './shikimori'
import { seasonQuery } from './seasonQuery'

// Сезонный чарт (/season) грузится отдельно, поэтому и запрос живёт здесь, а не в основном бандле.
// Один запрос GraphQL на формат отдаёт всё для карточки: постер, студию, жанры, описание и дату следующей серии.
// Прокси на animelife.top пропускает ровно такой запрос (SEASON в worker/shikiProxy.js): поля менять вместе.

export type SeasonName = 'winter' | 'spring' | 'summer' | 'fall'

export interface SeasonCode {
  name: SeasonName
  year: number
}

export const SEASON_LABELS: Record<SeasonName, string> = { winter: 'Зима', spring: 'Весна', summer: 'Лето', fall: 'Осень' }
const ORDER: SeasonName[] = ['winter', 'spring', 'summer', 'fall']

export function currentSeason(now = new Date()): SeasonCode {
  const m = now.getMonth()
  // Декабрь относится к зиме следующего года, как у Shikimori.
  if (m === 11) return { name: 'winter', year: now.getFullYear() + 1 }
  return { name: ORDER[Math.floor((m + 1) / 3)], year: now.getFullYear() }
}

export function parseSeason(code: string | null): SeasonCode | undefined {
  const m = code?.match(/^(winter|spring|summer|fall)_(\d{4})$/)
  if (!m) return undefined
  const year = Number(m[2])
  return year >= 1960 && year <= 2100 ? { name: m[1] as SeasonName, year } : undefined
}

export const seasonCode = (s: SeasonCode) => `${s.name}_${s.year}`

export function shiftSeason(s: SeasonCode, by: number): SeasonCode {
  const i = ORDER.indexOf(s.name) + by
  return { name: ORDER[((i % 4) + 4) % 4], year: s.year + Math.floor(i / 4) }
}

export const FORMATS = [
  { id: 'tv', title: 'Сериалы', kinds: 'tv', pages: 2 },
  { id: 'movie', title: 'Фильмы', kinds: 'movie', pages: 1 },
  { id: 'other', title: 'OVA, ONA, спешлы', kinds: 'ova,ona,special,tv_special', pages: 1 },
] as const
export type FormatId = (typeof FORMATS)[number]['id']

export interface SeasonAnime {
  id: string
  title: string
  originalTitle: string
  kind: string
  score?: number
  status: 'anons' | 'ongoing' | 'released'
  episodes?: number
  episodesAired?: number
  airedOn?: string
  nextEpisodeAt?: string
  minutes?: number
  poster?: string
  poster2x?: string
  genres: string[]
  studio?: string
  description: string
  /** место по популярности внутри формата, с 1 */
  rank: number
}

interface Raw {
  id: string
  name: string
  russian: string | null
  kind: string | null
  score: number | null
  status: SeasonAnime['status']
  episodes: number
  episodesAired: number
  airedOn: { date: string | null } | null
  nextEpisodeAt: string | null
  duration: number | null
  poster: { mainUrl: string; main2xUrl: string } | null
  genres: { russian: string; kind: string }[]
  studios: { name: string }[]
  description: string | null
}

const KIND_LABELS: Record<string, string> = { tv: 'ТВ', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'ТВ-спешл' }

// Первое предложение-два: в карточке чарта место под три-четыре строки.
function shortText(text: string) {
  const plain = cleanDescription(text).replace(/\s+/g, ' ')
  if (plain.length <= 260) return plain
  const cut = plain.slice(0, 260)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 200))}…`
}

export async function fetchSeason(season: SeasonCode, format: FormatId): Promise<SeasonAnime[]> {
  const f = FORMATS.find((x) => x.id === format)!
  const code = seasonCode(season)
  const pages: Raw[][] = []
  for (let page = 1; page <= f.pages; page++) {
    const res = await graphql<{ data?: { animes: Raw[] } }>(seasonQuery(code, f.kinds, page))
    const list = res.data?.animes ?? []
    pages.push(list)
    if (list.length < 50) break
  }
  const seen = new Set<string>()
  return pages
    .flat()
    .filter((a) => !seen.has(a.id) && seen.add(a.id))
    .map((a, i) => ({
      id: a.id,
      title: a.russian || a.name,
      originalTitle: a.name,
      kind: (a.kind && KIND_LABELS[a.kind]) || 'Аниме',
      score: a.score || undefined,
      status: a.status,
      episodes: a.episodes || undefined,
      episodesAired: a.episodesAired || undefined,
      airedOn: a.airedOn?.date ?? undefined,
      nextEpisodeAt: (a.status !== 'released' && a.nextEpisodeAt) || undefined,
      minutes: a.duration || undefined,
      poster: a.poster?.mainUrl,
      poster2x: a.poster?.main2xUrl,
      genres: (a.genres ?? []).filter((g) => g.kind !== 'demographic').map((g) => g.russian).slice(0, 3),
      studio: a.studios?.[0]?.name,
      description: shortText(a.description ?? ''),
      rank: i + 1,
    }))
}

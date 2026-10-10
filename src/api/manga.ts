import { splitDescription, type TextPart } from './character'
import { absolute, fetchRelated, get, mangaKinds, type Related, type ShikiImage } from './shikimori'

// Страница манги грузится отдельно, поэтому и запросы к Shikimori живут здесь, а не в основном бандле.

export interface MangaPage {
  id: string
  title: string
  originalTitle?: string
  english?: string
  japanese?: string
  kind: string
  image?: string
  score?: number
  status: string
  year?: number
  volumes?: number
  chapters?: number
  genres: string[]
  publishers: string[]
  description: TextPart[]
  related: Related[]
  /** официальные сайты и магазины, где читать легально */
  links: { url: string; title: string }[]
}

interface ShikiMangaFull {
  id: number
  name: string
  russian: string | null
  english: string[] | null
  japanese: string[] | null
  image: ShikiImage
  kind: string | null
  score: string
  status: string
  volumes: number
  chapters: number
  aired_on: string | null
  description: string | null
  genres: { russian: string; name: string }[]
  publishers: { name: string }[]
}

const statuses: Record<string, string> = {
  anons: 'Анонс',
  ongoing: 'Выходит',
  released: 'Завершена',
  paused: 'Приостановлена',
  discontinued: 'Прекращена',
}

// Ссылки «Где читать»: официальные сайты и сервисы, без вики и баз данных.
const linkTitles: Record<string, string> = {
  official_site: 'Официальный сайт',
  amazon: 'Amazon',
  bookwalker: 'BookWalker',
  mangaplus: 'MANGA Plus',
  mangaup: 'Manga UP!',
  viz: 'VIZ',
  kodansha: 'Kodansha',
  yen_press: 'Yen Press',
  webtoon: 'Webtoon',
}

/** Манга или ранобэ: описание, тома и главы, связанные аниме и манга, где читать. */
export async function fetchManga(id: string): Promise<MangaPage> {
  const safe = encodeURIComponent(id)
  // Ранобэ Shikimori тоже отдаёт по /mangas/:id, отдельный адрес /ranobe не нужен.
  const [m, related, links] = await Promise.all([
    get<ShikiMangaFull>(`/mangas/${safe}`),
    fetchRelated(id, 'mangas').catch(() => []),
    get<{ kind: string; url: string }[]>(`/mangas/${safe}/external_links`).catch(() => []),
  ])
  const aired = m.aired_on ? new Date(m.aired_on) : undefined
  return {
    id: String(m.id),
    title: m.russian || m.name,
    originalTitle: m.russian ? m.name : undefined,
    english: m.english?.[0] || undefined,
    japanese: m.japanese?.[0] || undefined,
    kind: (m.kind && mangaKinds[m.kind]) || 'Манга',
    image: absolute(m.image?.original),
    score: Number(m.score) || undefined,
    status: statuses[m.status] ?? '',
    year: aired?.getFullYear(),
    volumes: m.volumes || undefined,
    chapters: m.chapters || undefined,
    genres: (m.genres ?? []).map((g) => g.russian || g.name),
    publishers: (m.publishers ?? []).map((p) => p.name),
    description: splitDescription(m.description),
    related,
    links: links.filter((l) => linkTitles[l.kind]).map((l) => ({ url: l.url, title: linkTitles[l.kind] })),
  }
}

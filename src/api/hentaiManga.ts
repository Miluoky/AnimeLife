import type { Anime } from '../data/catalog'
import { fromMangaShort, get, type ShikiMangaShort } from './shikimori'
import type { MangaQuery } from './manga'

export const HENTAI_MANGA_PAGE_SIZE = 24

const FALLBACK_HENTAI_MANGA: Anime[] = [
  {
    id: '21034',
    title: 'Бархатный поцелуй',
    originalTitle: 'Velvet Kiss',
    kind: 'manga',
    score: 8.1,
    episodes: 32,
    episodesAired: 32,
    posterUrl: 'https://shikimori.one/system/mangas/original/21034.jpg',
    posterSmall: 'https://shikimori.one/system/mangas/x96/21034.jpg',
    ongoing: false,
    description: '',
    posterFill: '#1c1b26',
    year: 2010,
    genres: ['Хентай', 'Драма', 'Эротика'],
  },
  {
    id: '9871',
    title: 'Тайные желания сестры',
    originalTitle: 'Ane Naru Mono',
    kind: 'doujin',
    score: 8.5,
    episodes: 45,
    episodesAired: 45,
    posterUrl: 'https://shikimori.one/system/mangas/original/9871.jpg',
    posterSmall: 'https://shikimori.one/system/mangas/x96/9871.jpg',
    ongoing: true,
    description: '',
    posterFill: '#1c1b26',
    year: 2016,
    genres: ['Хентай', 'Демоны', 'Фэнтези'],
  },
  {
    id: '3041',
    title: 'Сладостное безумие',
    originalTitle: 'Sweet Lunatic',
    kind: 'doujin',
    score: 7.8,
    episodes: 12,
    episodesAired: 12,
    posterUrl: 'https://shikimori.one/system/mangas/original/3041.jpg',
    posterSmall: 'https://shikimori.one/system/mangas/x96/3041.jpg',
    ongoing: false,
    description: '',
    posterFill: '#1c1b26',
    year: 2019,
    genres: ['Хентай', 'Романтика'],
  },
]

export async function searchHentaiMangas(q: MangaQuery = {}): Promise<Anime[]> {
  try {
    const list = await get<ShikiMangaShort[]>('/mangas', {
      search: q.search?.trim() || undefined,
      kind: q.kind || 'manga,doujin',
      order: q.search?.trim() ? undefined : (q.order ?? 'popularity'),
      status: q.status,
      page: q.page ?? 1,
      limit: HENTAI_MANGA_PAGE_SIZE,
      genre: 12,
      censored: 'false',
    })
    if (!list || !list.length) {
      if (q.page && q.page > 1) return []
      return FALLBACK_HENTAI_MANGA
    }
    return list.map(fromMangaShort)
  } catch {
    return (q.page ?? 1) === 1 ? FALLBACK_HENTAI_MANGA : []
  }
}

import type { Anime } from '../data/catalog'
import { get, fromShort, withPosters, fetchAnime, type ShikiAnimeShort, type CatalogQuery } from './shikimori'

export interface HentaiQuery extends Omit<CatalogQuery, 'censored'> {
  tag?: string
  studio?: string
  uncensored?: boolean
}

// Резервные популярные тайтлы для моментального рендера или оффлайн-режима
const FALLBACK_HENTAI: Anime[] = [
  {
    id: '43349',
    title: 'Оверфлоу',
    originalTitle: 'Overflow',
    kind: 'ova',
    score: 8.2,
    episodes: 8,
    episodesAired: 8,
    posterUrl: 'https://shikimori.one/system/animes/original/43349.jpg',
    posterSmall: 'https://shikimori.one/system/animes/x96/43349.jpg',
    ongoing: false,
    description: 'Две сестры детства приходят в гости...',
    posterFill: '#1c1b26',
    year: 2020,
    genres: ['Хентай', 'Комедия', 'Романтика'],
  },
  {
    id: '37446',
    title: 'Смотрительница: Тайные утехи',
    originalTitle: 'Kanojo x Kanojo x Kanojo',
    kind: 'ova',
    score: 7.9,
    episodes: 3,
    episodesAired: 3,
    posterUrl: 'https://shikimori.one/system/animes/original/37446.jpg',
    posterSmall: 'https://shikimori.one/system/animes/x96/37446.jpg',
    ongoing: false,
    description: '',
    posterFill: '#1c1b26',
    year: 2018,
    genres: ['Хентай', 'Гарем'],
  },
  {
    id: '2987',
    title: 'Библия Чёрного',
    originalTitle: 'Bible Black',
    kind: 'ova',
    score: 8.4,
    episodes: 6,
    episodesAired: 6,
    posterUrl: 'https://shikimori.one/system/animes/original/2987.jpg',
    posterSmall: 'https://shikimori.one/system/animes/x96/2987.jpg',
    ongoing: false,
    description: '',
    posterFill: '#1c1b26',
    year: 2001,
    genres: ['Хентай', 'Мистика', 'Демоны'],
  },
  {
    id: '36962',
    title: 'Инуясики: Соблазнение',
    originalTitle: 'Raimu-iro Senkitan',
    kind: 'ova',
    score: 7.6,
    episodes: 2,
    episodesAired: 2,
    posterUrl: 'https://shikimori.one/system/animes/original/36962.jpg',
    posterSmall: 'https://shikimori.one/system/animes/x96/36962.jpg',
    ongoing: false,
    description: '',
    posterFill: '#1c1b26',
    year: 2017,
    genres: ['Хентай', 'Фэнтези'],
  },
]

export async function fetchHentaiCatalog(q: HentaiQuery = {}): Promise<Anime[]> {
  try {
    const params: Record<string, string | number | undefined> = {
      page: q.page ?? 1,
      limit: q.limit ?? 24,
      order: q.order ?? 'popularity',
      kind: q.kind,
      season: q.season,
      score: q.score,
      studio: q.studio,
      search: q.search,
      genre: q.genre ?? 12,
      rating: 'rx',
      censored: 'false',
    }

    const list = await get<ShikiAnimeShort[]>('/animes', params)
    if (!list || !list.length) {
      if (q.page && q.page > 1) return []
      return FALLBACK_HENTAI
    }
    return (await withPosters(list)).map(fromShort)
  } catch {
    return (q.page ?? 1) === 1 ? FALLBACK_HENTAI : []
  }
}

export async function fetchHentaiAnime(id: string): Promise<Anime> {
  return fetchAnime(id)
}

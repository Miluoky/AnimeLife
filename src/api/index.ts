import { useEffect, useState } from 'react'
import { demoCatalog, demoGenres, getDemoAnime, type Anime } from '../data/catalog'
import {
  fetchAnime,
  fetchCharacters,
  fetchTitleDetails,
  fetchAllGenres,
  fetchCatalog,
  fetchGenres,
  fetchRelated,
  fetchSchedule,
  fetchScreenshots,
  fetchSimilar,
  fetchStatsInfo,
  fetchWatchLinks,
  type CatalogOrder,
  type Character,
  type ScoreStats,
  type TitleVideo,
  type CatalogQuery,
  type Genre,
  type Related,
  type ScheduleItem,
  type StatsInfo,
  type WatchLink,
} from './shikimori'

export type {
  CatalogOrder,
  CatalogQuery,
  Character,
  Genre,
  Related,
  ScheduleItem,
  ScoreStats,
  StatsInfo,
  TitleVideo,
  WatchLink,
}

export interface Loaded<T> {
  data: T
  /** true, если API недоступно и показаны демо-данные */
  demo: boolean
}

function demoList(q: CatalogQuery): Anime[] {
  if ((q.page ?? 1) > 1) return []
  const genre = demoGenres.find((g) => g.id === q.genre)?.title
  const search = q.search?.toLowerCase()
  return demoCatalog.filter(
    (a) =>
      (!q.status || (q.status === 'ongoing') === a.ongoing) &&
      (!genre || a.genres.includes(genre)) &&
      (!search || a.title.toLowerCase().includes(search) || a.originalTitle?.toLowerCase().includes(search)),
  )
}

// Демо-данные используют текстовые id, а Shikimori числовые: так их и различаем.
const isDemoId = (id: string) => !/^\d+$/.test(id)

export async function loadCatalog(q: CatalogQuery): Promise<Loaded<Anime[]>> {
  try {
    return { data: await fetchCatalog(q), demo: false }
  } catch (e) {
    console.warn('Каталог Shikimori недоступен, показываю демо-данные', e)
    return { data: demoList(q), demo: true }
  }
}

export async function loadAnime(id: string): Promise<Loaded<Anime | undefined>> {
  if (isDemoId(id)) return { data: getDemoAnime(id), demo: true }
  try {
    return { data: await fetchAnime(id), demo: false }
  } catch (e) {
    console.warn('Тайтл не загрузился', e)
    return { data: undefined, demo: true }
  }
}

export async function loadGenres(): Promise<Loaded<Genre[]>> {
  try {
    return { data: await fetchGenres(), demo: false }
  } catch {
    return { data: demoGenres, demo: true }
  }
}

export async function loadAllGenres(): Promise<Loaded<Genre[]>> {
  try {
    return { data: await fetchAllGenres(), demo: false }
  } catch {
    return { data: demoGenres, demo: true }
  }
}

export async function loadSchedule(): Promise<Loaded<ScheduleItem[]>> {
  try {
    return { data: await fetchSchedule(), demo: false }
  } catch (e) {
    console.warn('Расписание недоступно', e)
    return { data: [], demo: true }
  }
}

export interface TitleExtras {
  related: Related[]
  similar: Anime[]
  screenshots: string[]
  watchLinks: WatchLink[]
  characters: Character[]
  videos: TitleVideo[]
  scores?: ScoreStats
}

/** Дополнения к странице тайтла. Каждое грузится отдельно: если одно упало, остальные всё равно покажем. */
export async function loadTitleExtras(id: string): Promise<TitleExtras> {
  if (isDemoId(id)) return { related: [], similar: [], screenshots: [], watchLinks: [], characters: [], videos: [] }
  const [related, similar, screenshots, watchLinks, characters, details] = await Promise.allSettled([
    fetchRelated(id),
    fetchSimilar(id),
    fetchScreenshots(id),
    fetchWatchLinks(id),
    fetchCharacters(id),
    fetchTitleDetails(id),
  ])
  return {
    related: related.status === 'fulfilled' ? related.value : [],
    similar: similar.status === 'fulfilled' ? similar.value : [],
    screenshots: screenshots.status === 'fulfilled' ? screenshots.value : [],
    watchLinks: watchLinks.status === 'fulfilled' ? watchLinks.value : [],
    characters: characters.status === 'fulfilled' ? characters.value : [],
    videos: details.status === 'fulfilled' ? details.value.videos : [],
    scores: details.status === 'fulfilled' ? details.value.scores : undefined,
  }
}

export interface AsyncState<T> {
  loading: boolean
  value?: T
}

/** Загружает данные при изменении deps и отбрасывает устаревшие ответы. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true })
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ loading: true, value: s.value }))
    load().then((value) => {
      if (!cancelled) setState({ loading: false, value })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

/** Данные для статистики профиля. Демо-тайтлы берём из демо-каталога, без сети статистика будет неполной. */
export async function loadStatsInfo(ids: string[]): Promise<Map<string, StatsInfo>> {
  const real = ids.filter((id) => !isDemoId(id))
  const out = await fetchStatsInfo(real).catch(() => new Map<string, StatsInfo>())
  for (const id of ids.filter(isDemoId)) {
    const a = getDemoAnime(id)
    if (a)
      out.set(id, {
        episodes: a.episodes ?? 0,
        episodesAired: a.episodesAired ?? 0,
        duration: a.episodeMinutes ?? 24,
        kind: a.kind,
        genres: a.genres,
      })
  }
  return out
}

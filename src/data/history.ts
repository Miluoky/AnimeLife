import type { Anime } from './catalog'
import { createLocalStore } from './localStore'

// История просмотра хранится в браузере, пока нет аккаунтов.
const LIMIT = 12

export interface HistoryEntry {
  animeId: string
  title: string
  posterUrl?: string
  posterFill: string
  episode: number
  totalEpisodes: number
  updatedAt: number
}

const store = createLocalStore<HistoryEntry[]>('anime.history.v1', [])

export const getHistory = store.get
export const useHistory = store.use

/** Для синхронизации с аккаунтом. */
export const historyStore = store

export function getProgress(animeId: string): HistoryEntry | undefined {
  return store.get().find((h) => h.animeId === animeId)
}

export function saveProgress(anime: Anime, episode: number, totalEpisodes: number) {
  const entry: HistoryEntry = {
    animeId: anime.id,
    title: anime.title,
    posterUrl: anime.posterUrl,
    posterFill: anime.posterFill,
    episode,
    totalEpisodes,
    updatedAt: Date.now(),
  }
  store.set([entry, ...store.get().filter((h) => h.animeId !== anime.id)].slice(0, LIMIT))
}

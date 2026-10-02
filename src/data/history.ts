import { useSyncExternalStore } from 'react'
import type { Anime } from './catalog'

// История просмотра хранится в браузере, пока нет аккаунтов.
const KEY = 'anime.history.v1'
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

let cache: HistoryEntry[] | undefined
const listeners = new Set<() => void>()

function read(): HistoryEntry[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as HistoryEntry[]
  } catch {
    cache = []
  }
  return cache
}

export function getHistory(): HistoryEntry[] {
  return read()
}

export function getProgress(animeId: string): HistoryEntry | undefined {
  return read().find((h) => h.animeId === animeId)
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
  cache = [entry, ...read().filter((h) => h.animeId !== anime.id)].slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Приватный режим или переполненное хранилище: история живёт до перезагрузки.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getHistory, getHistory)
}

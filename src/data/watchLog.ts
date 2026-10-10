import type { Anime } from './catalog'
import { createLocalStore } from './localStore'

/**
 * Журнал просмотра для «Итогов года» и опыта за неделю: какая серия, когда, в какой озвучке.
 * Одна запись на серию в день; живёт в браузере, хранит последние MAX записей.
 */
export interface LogEntry {
  /** день по местному времени, ГГГГ-ММ-ДД */
  d: string
  /** час начала просмотра, 0–23 */
  h: number
  /** время записи, мс */
  at: number
  a: string
  e: number
  /** минут в серии */
  m: number
  /** озвучка */
  v?: string
}

export interface LogTitle {
  t: string
  p?: string
  k: string
  g: string[]
}

interface Log {
  entries: LogEntry[]
  titles: Record<string, LogTitle>
}

const MAX = 8000
export const watchLogStore = createLocalStore<Log>('anime.watchlog.v1', { entries: [], titles: {} })

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function logEpisode(anime: Anime, episode: number, voice?: string) {
  const now = Date.now()
  const d = dayKey(now)
  const log = watchLogStore.get()
  const same = log.entries.findIndex((x) => x.a === anime.id && x.e === episode && x.d === d)
  const entry: LogEntry = { d, h: new Date(now).getHours(), at: now, a: anime.id, e: episode, m: anime.episodeMinutes || 24, v: voice || undefined }
  const entries = same >= 0 ? log.entries.map((x, i) => (i === same ? { ...x, v: voice || x.v } : x)) : [...log.entries, entry].slice(-MAX)
  const titles = {
    ...log.titles,
    [anime.id]: { t: anime.title, p: anime.posterSmall ?? anime.posterUrl, k: anime.kind, g: anime.genres.slice(0, 4) },
  }
  watchLogStore.set({ entries, titles })
}

/**
 * Где зритель остановился внутри серии: тайтл и серия → секунда. Живёт в localStorage этого браузера.
 * Пишут свой плеер (AniLibria, AnimeVost) и Kodik через postMessage; при следующем открытии серии плеер продолжает с этого места.
 */

const KEY = 'anime.positions.v1'
const MAX = 300
// Меньше 30 секунд — не стоит продолжать; последние полторы минуты — эндинг, серию считаем досмотренной.
const MIN = 30
const TAIL = 90

interface Entry {
  t: number
  d: number
  at: number
}

function read(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function write(all: Record<string, Entry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Приватный режим или переполненное хранилище: продолжить с места не получится, остальное работает.
  }
}

export interface SyncedPlaybackPosition {
  animeId?: string | number
  ep: number
  episode?: number
  t: number
  d: number
  at: number
}

const listeners = new Set<() => void>()

export function subscribePositions(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify() {
  listeners.forEach((l) => l())
}

const key = (animeId: string, episode: number) => `${animeId}:${episode}`

/** Секунда, с которой продолжить серию, или null — смотреть с начала. */
export function getPosition(animeId: string, episode: number): number | null {
  const e = read()[key(animeId, episode)]
  return e && e.t >= MIN && (!e.d || e.t < e.d - TAIL) ? e.t : null
}

/** Запоминает место в серии; в начале и в самом конце серии запись удаляется. */
export function savePosition(animeId: string, episode: number, t: number, d = 0) {
  const all = read()
  const k = key(animeId, episode)
  let changed = false
  if (!Number.isFinite(t) || t < MIN || (d > 0 && t >= d - TAIL)) {
    if (k in all) {
      delete all[k]
      changed = true
    }
  } else {
    all[k] = { t: Math.floor(t), d: Number.isFinite(d) ? Math.floor(d) : 0, at: Date.now() }
    const keys = Object.keys(all)
    if (keys.length > MAX) {
      keys.sort((a, b) => all[a].at - all[b].at)
      for (const old of keys.slice(0, keys.length - MAX)) delete all[old]
    }
    changed = true
  }
  if (changed) {
    write(all)
    notify()
  }
}

/** Возвращает топ-20 самых свежих позиций для синхронизации с аккаунтом */
export function getRecentPositionsForSync(): Record<string, SyncedPlaybackPosition> {
  const all = read()
  const latestByAnime = new Map<string, { ep: number; t: number; d: number; at: number }>()
  for (const [k, v] of Object.entries(all)) {
    const colon = k.lastIndexOf(':')
    if (colon === -1) continue
    const animeId = k.slice(0, colon)
    const ep = parseInt(k.slice(colon + 1), 10)
    if (!animeId || isNaN(ep) || v.t < MIN) continue
    const existing = latestByAnime.get(animeId)
    if (!existing || v.at > existing.at) {
      latestByAnime.set(animeId, { ep, t: v.t, d: v.d, at: v.at })
    }
  }
  const sorted = [...latestByAnime.entries()]
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 20)

  const result: Record<string, SyncedPlaybackPosition> = {}
  for (const [animeId, pos] of sorted) {
    result[animeId] = {
      animeId,
      ep: pos.ep,
      episode: pos.ep,
      t: pos.t,
      d: pos.d,
      at: pos.at,
    }
  }
  return result
}

/**
 * Объединяет локальные позиции с облачными при входе пользователя.
 * При конфликте побеждает более свежая отметка времени.
 */
export function reconcilePositions(remote: Record<string, SyncedPlaybackPosition> | undefined) {
  if (!remote || typeof remote !== 'object') return
  const all = read()
  let changed = false
  for (const [animeId, pos] of Object.entries(remote)) {
    if (!pos) continue
    const ep = typeof pos.ep === 'number' ? pos.ep : pos.episode
    if (typeof ep !== 'number' || typeof pos.t !== 'number' || pos.t < MIN) continue
    const k = key(animeId, ep)
    const local = all[k]
    if (!local || (pos.at && pos.at > local.at)) {
      all[k] = {
        t: Math.floor(pos.t),
        d: typeof pos.d === 'number' && Number.isFinite(pos.d) ? Math.floor(pos.d) : 0,
        at: pos.at || Date.now(),
      }
      changed = true
    }
  }
  if (changed) {
    write(all)
    notify()
  }
}

/** Последняя просмотренная серия и секунда для тайтла (для возобновления) */
export function getLastPositionForAnime(animeId: string): { ep: number; t: number; d: number; at: number } | null {
  const all = read()
  let best: { ep: number; t: number; d: number; at: number } | null = null
  const prefix = `${animeId}:`
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(prefix)) continue
    const ep = parseInt(k.slice(prefix.length), 10)
    if (isNaN(ep) || v.t < MIN) continue
    if (!best || v.at > best.at) {
      best = { ep, t: v.t, d: v.d, at: v.at }
    }
  }
  return best
}


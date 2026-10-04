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
  if (!Number.isFinite(t) || t < MIN || (d > 0 && t >= d - TAIL)) {
    if (!(k in all)) return
    delete all[k]
  } else {
    all[k] = { t: Math.floor(t), d: Number.isFinite(d) ? Math.floor(d) : 0, at: Date.now() }
    const keys = Object.keys(all)
    if (keys.length > MAX) {
      keys.sort((a, b) => all[a].at - all[b].at)
      for (const old of keys.slice(0, keys.length - MAX)) delete all[old]
    }
  }
  write(all)
}


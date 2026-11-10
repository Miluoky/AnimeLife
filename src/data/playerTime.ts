/**
 * Где сейчас идёт серия: своё видео и Kodik (через postMessage) сообщают время сюда.
 * Нужно ссылке «Поделиться моментом» и комментариям поверх видео.
 */
let now = 0
let lastEmit = 0
const listeners = new Set<(t: number) => void>()

export function emitPlayerTime(t: number) {
  if (!Number.isFinite(t)) return
  const prev = now
  now = t
  if (!listeners.size) return
  // Kodik шлёт time_update очень часто — слушателям хватает ~4 раза в секунду.
  const ms = performance.now()
  if (ms - lastEmit < 250 && Math.abs(t - prev) < 1.5) return
  lastEmit = ms
  listeners.forEach((l) => l(t))
}

export const playerTime = () => now

export function onPlayerTime(listener: (t: number) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

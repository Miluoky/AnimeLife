/**
 * Где сейчас идёт серия: своё видео и Kodik (через postMessage) сообщают время сюда.
 * Нужно ссылке «Поделиться моментом» и комментариям поверх видео.
 */
let now = 0
const listeners = new Set<(t: number) => void>()

export function emitPlayerTime(t: number) {
  if (!Number.isFinite(t)) return
  now = t
  listeners.forEach((l) => l(t))
}

export const playerTime = () => now

export function onPlayerTime(listener: (t: number) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

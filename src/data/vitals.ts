// Расчёт CLS и INP по записям PerformanceObserver (data/quality.ts). Отдельно, чтобы проверять без браузера.

export interface Shift {
  value: number
  startTime: number
  hadRecentInput?: boolean
}

/** CLS по правилам Google: самое большое «окно» сдвигов (паузы меньше 1 с, окно не длиннее 5 с), сдвиги после ввода не в счёт. */
export function clsOf(shifts: Shift[]) {
  let worst = 0
  let sum = 0
  let first = 0
  let last = 0
  for (const s of shifts) {
    if (s.hadRecentInput) continue
    if (sum && s.startTime - last < 1000 && s.startTime - first < 5000) sum += s.value
    else {
      sum = s.value
      first = s.startTime
    }
    last = s.startTime
    worst = Math.max(worst, sum)
  }
  return worst
}

/** INP: самое долгое взаимодействие, а если их много — 98-й процентиль (одно из каждых 50 отбрасываем). */
export function inpOf(durations: number[]) {
  if (!durations.length) return undefined
  const sorted = [...durations].sort((a, b) => b - a)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))]
}

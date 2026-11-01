import { createLocalStore } from './localStore'
import { listStore, type ListEntry } from './myList'
import { dayKey, watchLogStore, type LogEntry } from './watchLog'

/** Серий за день, после которых день считается плотным. Как «дни подряд» в итогах, но только тяжёлые дни. */
const HEAVY = 4
/** Сколько таких дней подряд, чтобы мягко предложить паузу. */
const STREAK = 5
const WEEK = 7 * 24 * 60 * 60 * 1000

/** До какого момента баннер «Сделайте паузу» скрыт. 0 — ещё не закрывали. */
export const burnoutDismissStore = createLocalStore<number>('anime.burnout.dismiss.v1', 0)

function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return dayKey(date.getTime())
}

/** Пять календарных дней подряд, в каждом не меньше четырёх серий. Сегодня ещё может не набраться — тогда смотрим вчерашний край. */
export function heavyStreak(entries: Pick<LogEntry, 'd'>[], now = Date.now()) {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.d, (counts.get(e.d) ?? 0) + 1)
  const today = dayKey(now)
  const end = (counts.get(today) ?? 0) >= HEAVY ? today : addDays(today, -1)
  for (let i = 0; i < STREAK; i++) {
    if ((counts.get(addDays(end, -i)) ?? 0) < HEAVY) return false
  }
  return true
}

export function burnoutVisible(entries = watchLogStore.get().entries, now = Date.now()) {
  if (now < burnoutDismissStore.get()) return false
  return heavyStreak(entries, now)
}

export function dismissBurnout(now = Date.now()) {
  burnoutDismissStore.set(now + WEEK)
}

/** Короткое название из «Буду смотреть» или «Брошено». Если таких нет — случайный тайтл. */
export function pausePick(list: ListEntry[] = listStore.get()): { title: string; to: string } {
  const pick = list.find((e) => e.status === 'planned') ?? list.find((e) => e.status === 'dropped')
  if (!pick) return { title: 'Что посмотреть?', to: '/random' }
  const raw = pick.anime.title
  const title = raw.length > 32 ? `${raw.slice(0, 30).trim()}…` : raw
  return { title, to: `/anime/${pick.anime.id}` }
}

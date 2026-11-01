import { createLocalStore } from './localStore'
import { listStore } from './myList'

/**
 * Вкладка «Смотрю»: какие серии тайтлов из «Смотрю» (и с колокольчиком) уже вышли, а зритель их ещё не видел.
 * Здесь только хранилище и счётчик для нижнего меню, чтобы не тянуть в основной код запросы к Shikimori:
 * сама проверка — в inboxCheck.ts, её подключают, когда браузер свободен или открыта вкладка.
 */

export interface InboxItem {
  id: string
  title: string
  poster?: string
  posterFill: string
  /** сколько серий уже вышло */
  aired: number
  /** всего серий, если известно */
  total?: number
  ongoing: boolean
  /** онгоинг: номер и время следующей серии */
  nextEp?: number
  nextAt?: number
}

/** Серия, у которой с прошлой проверки вырос счётчик вышедших. */
export interface EpisodeArrival {
  id: string
  title: string
  ep: number
  /** когда заметили, мс */
  at: number
}

export interface InboxState {
  /** когда последний раз проверяли Shikimori */
  checkedAt: number
  items: InboxItem[]
  /** сколько серий было вышедшими, когда зритель последний раз открывал вкладку: всё, что выше, — «новое» */
  seen: Record<string, number>
  /** выход серий с момента, когда начали вести журнал; старше двух недель выкидываем */
  arrived?: EpisodeArrival[]
  /** с какого момента журнал полный: раньше этой даты «за неделю» не обещает полноту */
  trackingSince?: number
}

export const inboxStore = createLocalStore<InboxState>('anime.inbox.v1', { checkedAt: 0, items: [], seen: {} })

/** Сколько серий просмотрено у тайтла по «Моему списку». */
export const watchedOf = (id: string) => listStore.get().find((e) => e.anime.id === id)?.watched ?? 0

/** Есть невиданная зрителем вышедшая серия, о которой он ещё не знает. */
export const isFresh = (item: InboxItem, state: InboxState = inboxStore.get()) =>
  item.aired > watchedOf(item.id) && item.aired > (state.seen[item.id] ?? 0)

/** Число тайтлов с новыми сериями: для кружка на вкладке «Смотрю». */
export function useInboxCount() {
  const state = inboxStore.use()
  listStore.use()
  return state.items.filter((i) => isFresh(i, state)).length
}

/** Окно сводки «За неделю». */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const ARRIVAL_KEEP_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Журнал вышедших серий между двумя проверками. Первый снимок и тайтл, только что добавленный в «Смотрю»,
 * не считаем новостью недели: иначе в сводку попало бы всё, что уже вышло.
 */
export function nextArrivalLog(prev: InboxState, nextItems: InboxItem[], now = Date.now()): Pick<InboxState, 'arrived' | 'trackingSince'> {
  const trackingSince = prev.trackingSince ?? now
  if (!prev.checkedAt) return { arrived: prev.arrived ?? [], trackingSince }
  const had = new Map(prev.items.map((i) => [i.id, i.aired]))
  const added: EpisodeArrival[] = []
  for (const item of nextItems) {
    const before = had.get(item.id)
    if (before == null || item.aired <= before) continue
    const to = Math.min(item.aired, before + 30)
    for (let ep = before + 1; ep <= to; ep++) added.push({ id: item.id, title: item.title, ep, at: now })
  }
  const key = (a: EpisodeArrival) => `${a.id}:${a.ep}`
  const kept = (prev.arrived ?? []).filter((a) => now - a.at < ARRIVAL_KEEP_MS && now >= a.at)
  const seen = new Set(kept.map(key))
  return { arrived: [...kept, ...added.filter((a) => !seen.has(key(a)))].slice(-400), trackingSince }
}

/** Зритель открыл вкладку: всё, что сейчас вышло, больше не «новое». */
export function markInboxSeen() {
  const state = inboxStore.get()
  const seen = { ...state.seen }
  let changed = false
  for (const i of state.items) {
    if ((seen[i.id] ?? 0) < i.aired) {
      seen[i.id] = i.aired
      changed = true
    }
  }
  if (changed) inboxStore.set({ ...state, seen })
}

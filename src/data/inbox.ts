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

export interface InboxState {
  /** когда последний раз проверяли Shikimori */
  checkedAt: number
  items: InboxItem[]
  /** сколько серий было вышедшими, когда зритель последний раз открывал вкладку: всё, что выше, — «новое» */
  seen: Record<string, number>
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

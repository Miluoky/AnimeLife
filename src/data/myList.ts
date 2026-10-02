import type { Anime, AnimeCard } from './catalog'
import { createLocalStore } from './localStore'

// «Мой список» хранится в браузере, пока нет аккаунтов.
export type ListStatus = 'watching' | 'planned' | 'completed' | 'dropped'

export const listStatuses: { id: ListStatus; title: string }[] = [
  { id: 'watching', title: 'Смотрю' },
  { id: 'planned', title: 'Буду смотреть' },
  { id: 'completed', title: 'Просмотрено' },
  { id: 'dropped', title: 'Брошено' },
]

export interface ListEntry {
  /** Снимок тайтла: хватает, чтобы нарисовать карточку без запроса к API. */
  anime: AnimeCard
  status: ListStatus
  addedAt: number
  /** когда последний раз меняли статус, для синхронизации между устройствами */
  updatedAt?: number
}

const store = createLocalStore<ListEntry[]>('anime.mylist.v1', [])

export const useMyList = store.use

/** Удалённые тайтлы и время удаления: чтобы при синхронизации они не вернулись с другого устройства. */
const removedStore = createLocalStore<Record<string, number>>('anime.mylist.removed.v1', {})

/** Для синхронизации с аккаунтом. */
export const listStore = store
export { removedStore }

export function setListStatus(anime: Anime, status: ListStatus | undefined) {
  const rest = store.get().filter((e) => e.anime.id !== anime.id)
  if (!status) {
    removedStore.set({ ...removedStore.get(), [anime.id]: Date.now() })
    store.set(rest)
    return
  }
  const { id, title, year, kind, episodes, ongoing, score, posterUrl, posterFill } = anime
  const prev = store.get().find((e) => e.anime.id === anime.id)
  store.set([
    {
      anime: { id, title, year, kind, episodes, ongoing, score, posterUrl, posterFill },
      status,
      addedAt: prev?.addedAt ?? Date.now(),
      updatedAt: Date.now(),
    },
    ...rest,
  ])
}

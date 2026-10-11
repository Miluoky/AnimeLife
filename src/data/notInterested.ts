import { createLocalStore } from './localStore'

/**
 * «Не интересно», как на Netflix: тайтл пропадает из рекомендаций и больше туда не попадает.
 * Храним ID и время, когда скрыли; вернуть можно в профиле или кнопкой «Отменить».
 */
export const notInterestedStore = createLocalStore<Record<string, number>>('anime.notinterested.v1', {})
export const useNotInterested = notInterestedStore.use

export function setNotInterested(id: string, on: boolean) {
  const next = { ...notInterestedStore.get() }
  if (on) next[id] = Date.now()
  else delete next[id]
  notInterestedStore.set(next)
}

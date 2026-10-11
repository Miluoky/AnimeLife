import { createLocalStore } from './localStore'

/**
 * «Без спойлеров», как на Crunchyroll: у серий, до которых зритель ещё не дошёл, кадр размыт,
 * а название скрыто. Настройка общая для всех тайтлов и живёт в браузере.
 */
export const noSpoilersStore = createLocalStore<boolean>('anime.nospoil.v1', false)
export const useNoSpoilers = noSpoilersStore.use

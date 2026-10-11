import { createLocalStore } from './localStore'

/**
 * Знакомство при первом входе: любимые жанры и тайтлы, которые зритель отметил.
 * Пока «Мой список» пуст, рекомендации на главной строятся по отмеченным тайтлам.
 */
export interface Taste {
  genres: number[]
  liked: { id: string; title: string }[]
  /** прошёл знакомство или закрыл его */
  done: boolean
}

export const tasteStore = createLocalStore<Taste>('anime.taste.v1', { genres: [], liked: [], done: false })

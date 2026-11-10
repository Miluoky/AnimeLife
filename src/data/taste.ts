import { createLocalStore } from './localStore'

/**
 * Знакомство при первом входе: любимые жанры и тайтлы, которые зритель отметил.
 * Пока «Мой список» пуст, рекомендации на главной строятся по отмеченным тайтлам.
 */
export interface Taste {
  genres: number[]
  liked: { id: string; title: string }[]
  /** прошёл знакомство до конца */
  done: boolean
  /** «Не сейчас»: карточку прячем до этой метки, потом снова показываем */
  snoozeUntil?: number
}

export const TASTE_SNOOZE_MS = 7 * 864e5

export const tasteStore = createLocalStore<Taste>('anime.taste.v1', { genres: [], liked: [], done: false })

/** Карточку знакомства не показываем: уже прошёл или отложил. */
export function tasteOnboardingHidden(taste: Taste, now = Date.now()) {
  return taste.done || (!!taste.snoozeUntil && taste.snoozeUntil > now)
}

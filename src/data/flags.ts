import { createLocalStore } from './localStore'

/**
 * Разовые события для достижений: «был в комнате», «смотрел ночью» и т. п. Время первого раза.
 * Синхронизируются с аккаунтом вместе со списком.
 */
export type Flag = 'joinedRoom' | 'hostedRoom' | 'nightOwl' | 'wroteReview' | 'imported' | 'commented' | 'quizStreak' | 'invitedFriend'

export const flagsStore = createLocalStore<Partial<Record<Flag, number>>>('anime.flags.v1', {})

export function markFlag(flag: Flag) {
  if (flagsStore.get()[flag]) return
  flagsStore.set({ ...flagsStore.get(), [flag]: Date.now() })
}

/** Объединение с аккаунтом: остаётся самое раннее время. */
export function mergeFlags(a: Partial<Record<Flag, number>> = {}, b: Partial<Record<Flag, number>> = {}) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b) as [Flag, number][]) out[k] = Math.min(out[k] ?? v, v)
  return out
}

import { createLocalStore } from './localStore'

/** Личная пометка серии. На сервер не уходит: только этот браузер. */
export const REACTIONS = [
  { id: 'masterpiece', label: 'шедевр' },
  { id: 'filler', label: 'филлер' },
  { id: 'cried', label: 'плакал' },
  { id: 'rewatch', label: 'пересмотреть' },
  { id: 'vibe', label: 'вайб' },
  { id: 'cringe', label: 'кринж' },
] as const

export type ReactionId = (typeof REACTIONS)[number]['id']

const store = createLocalStore<Record<string, ReactionId>>('anime.episode.reactions.v1', {})

export const useEpisodeReactions = store.use

export const reactionKey = (animeId: string, episode: number) => `${animeId}:${episode}`

/** Повторный выбор той же реакции снимает её. */
export function toggleEpisodeReaction(animeId: string, episode: number, id: ReactionId) {
  const key = reactionKey(animeId, episode)
  const next = { ...store.get() }
  if (next[key] === id) delete next[key]
  else next[key] = id
  store.set(next)
}

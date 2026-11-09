import { createLocalStore } from './localStore'

/** Личная пометка серии. Синхронизируется в prefs аккаунта (с потолком), чтобы не потерять при смене браузера. */
export const REACTIONS = [
  { id: 'masterpiece', label: 'шедевр' },
  { id: 'filler', label: 'филлер' },
  { id: 'cried', label: 'плакал' },
  { id: 'rewatch', label: 'пересмотреть' },
  { id: 'vibe', label: 'вайб' },
  { id: 'cringe', label: 'кринж' },
] as const

export type ReactionId = (typeof REACTIONS)[number]['id']
export type EpisodeReactionsMap = Record<string, ReactionId>

const IDS = new Set<string>(REACTIONS.map((r) => r.id))
/** Чтобы prefs не раздувались: последние по ключу (animeId:ep) достаточно для привычки. */
const SYNC_CAP = 400

const store = createLocalStore<EpisodeReactionsMap>('anime.episode.reactions.v1', {})

export const useEpisodeReactions = store.use
export const episodeReactionsStore = store

export const reactionKey = (animeId: string, episode: number) => `${animeId}:${episode}`

export const reactionLabel = (id: ReactionId | undefined) => REACTIONS.find((r) => r.id === id)?.label

/** Повторный выбор той же реакции снимает её. */
export function toggleEpisodeReaction(animeId: string, episode: number, id: ReactionId) {
  const key = reactionKey(animeId, episode)
  const next = { ...store.get() }
  if (next[key] === id) delete next[key]
  else next[key] = id
  store.set(next)
}

export function mergeEpisodeReactions(a: EpisodeReactionsMap = {}, b: EpisodeReactionsMap = {}): EpisodeReactionsMap {
  const out: EpisodeReactionsMap = { ...a }
  for (const [key, id] of Object.entries(b)) {
    if (IDS.has(id)) out[key] = id
  }
  const keys = Object.keys(out)
  if (keys.length <= SYNC_CAP) return out
  // Старые ключи (меньший animeId/ep в лексическом порядке) отбрасываем — свежие пометки важнее.
  const keep = keys.sort().slice(-SYNC_CAP)
  return Object.fromEntries(keep.map((k) => [k, out[k]]))
}

/** Реакции одного тайтла: серия → подпись, для сетки на странице аниме. */
export function reactionsForAnime(animeId: string, map: EpisodeReactionsMap = store.get()) {
  const prefix = `${animeId}:`
  const out: { episode: number; id: ReactionId; label: string }[] = []
  for (const [key, id] of Object.entries(map)) {
    if (!key.startsWith(prefix) || !IDS.has(id)) continue
    const episode = Number(key.slice(prefix.length))
    if (!Number.isInteger(episode) || episode < 1) continue
    const label = reactionLabel(id)
    if (label) out.push({ episode, id, label })
  }
  return out.sort((a, b) => a.episode - b.episode)
}

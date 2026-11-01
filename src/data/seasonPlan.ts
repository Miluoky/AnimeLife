import { createLocalStore } from './localStore'

/** Тайтл, который зритель взял в личную сетку сезона. */
export interface SeasonPlanItem {
  id: string
  title: string
  episodes?: number
}

/** Ключ — код сезона (`winter_2026`), значение — отмеченные тайтлы. */
const store = createLocalStore<Record<string, SeasonPlanItem[]>>('anime.season.plan.v1', {})

export const useSeasonPlan = store.use

export function toggleSeasonPlan(seasonId: string, item: SeasonPlanItem) {
  const all = { ...store.get() }
  const cur = all[seasonId] ?? []
  const next = cur.some((x) => x.id === item.id) ? cur.filter((x) => x.id !== item.id) : [...cur, item]
  if (next.length) all[seasonId] = next
  else delete all[seasonId]
  store.set(all)
}

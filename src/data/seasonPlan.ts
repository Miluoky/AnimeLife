import { createLocalStore } from './localStore'

/** Тайтл, который зритель взял в личную сетку сезона. */
export interface SeasonPlanItem {
  id: string
  title: string
  episodes?: number
}

export type SeasonPlanMap = Record<string, SeasonPlanItem[]>

/** Ключ — код сезона (`winter_2026`), значение — отмеченные тайтлы. */
const store = createLocalStore<SeasonPlanMap>('anime.season.plan.v1', {})

export const useSeasonPlan = store.use
export const seasonPlanStore = store

export function toggleSeasonPlan(seasonId: string, item: SeasonPlanItem) {
  const all = { ...store.get() }
  const cur = all[seasonId] ?? []
  const next = cur.some((x) => x.id === item.id) ? cur.filter((x) => x.id !== item.id) : [...cur, item]
  if (next.length) all[seasonId] = next
  else delete all[seasonId]
  store.set(all)
}

/** Объединение сеток с двух устройств: по сезону и id тайтла, без дублей. */
export function mergeSeasonPlans(a: SeasonPlanMap = {}, b: SeasonPlanMap = {}): SeasonPlanMap {
  const out: SeasonPlanMap = {}
  for (const seasonId of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const byId = new Map<string, SeasonPlanItem>()
    for (const item of [...(a[seasonId] ?? []), ...(b[seasonId] ?? [])]) {
      if (!item?.id) continue
      const prev = byId.get(item.id)
      if (!prev || (item.episodes ?? 0) > (prev.episodes ?? 0)) byId.set(item.id, item)
    }
    if (byId.size) out[seasonId] = [...byId.values()]
  }
  return out
}

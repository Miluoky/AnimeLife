import { fetchAnimesByIds, fetchSchedule } from '../api/shikimori'
import { inboxStore, type InboxItem } from './inbox'
import { watchingIds } from './push'

/** Чаще раза в 20 минут Shikimori не спрашиваем: серии выходят раз в неделю. */
const EVERY_MS = 20 * 60_000

let running: Promise<void> | undefined

/** Проверить, какие серии вышли у тайтлов из «Смотрю». force — не смотреть на время прошлой проверки. */
export function checkInbox(force = false): Promise<void> {
  const state = inboxStore.get()
  if (!force && Date.now() - state.checkedAt < EVERY_MS) return Promise.resolve()
  running ??= run().finally(() => (running = undefined))
  return running
}

async function run() {
  const ids = watchingIds()
  if (!ids.length) {
    inboxStore.set({ ...inboxStore.get(), checkedAt: Date.now(), items: [] })
    return
  }
  const [animes, schedule] = await Promise.all([fetchAnimesByIds(ids), fetchSchedule().catch(() => [])])
  const wanted = new Set(ids)
  const next = new Map(schedule.filter((s) => wanted.has(s.anime.id)).map((s) => [s.anime.id, s]))
  const items: InboxItem[] = animes
    .filter((a) => wanted.has(a.id) && !a.upcoming)
    .map((a) => {
      const soon = next.get(a.id)
      return {
        id: a.id,
        title: a.title,
        poster: a.posterSmall ?? a.posterUrl,
        posterFill: a.posterFill,
        aired: a.ongoing ? a.episodesAired ?? 0 : a.episodes ?? a.episodesAired ?? 0,
        total: a.episodes,
        ongoing: a.ongoing,
        nextEp: soon?.episode,
        nextAt: soon?.at.getTime(),
      }
    })
  const prev = inboxStore.get()
  // Новый тайтл в «Смотрю»: уже вышедшие серии не считаем новостью, ждём следующую.
  const seen = { ...prev.seen }
  for (const i of items) if (!(i.id in seen) && prev.checkedAt) seen[i.id] = i.aired
  inboxStore.set({ checkedAt: Date.now(), items, seen })
}

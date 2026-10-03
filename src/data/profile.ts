import { COMMUNITY_DB, tablesDB } from '../api/appwrite'
import { unlocked, listFacts, type ListFacts } from './achievements'
import { callCommunity } from './community'
import { flagsStore } from './flags'
import { listStore, type ListEntry } from './myList'

/** Открытый профиль /u/:id: имя, о себе, счётчики, любимое, что смотрит сейчас, достижения. */
export interface ProfileSummary {
  facts: ListFacts
  counts: Record<string, number>
  meanRating?: number
  favorites: ListEntry['anime'][]
  watching: (ListEntry['anime'] & { watched?: number })[]
  recent: ListEntry['anime'][]
  achievements: string[]
}

export interface PublicProfile {
  $id: string
  name: string
  about?: string
  updatedAt: number
  summary: ProfileSummary
}

// В профиль уходят только карточки (без лишних полей), чтобы строка оставалась небольшой.
const slim = ({ id, title, year, kind, episodes, ongoing, posterSmall, posterUrl, posterFill, score }: ListEntry['anime']) => ({
  id,
  ongoing,
  title,
  year,
  kind,
  episodes,
  posterSmall: posterSmall ?? posterUrl,
  posterUrl: posterSmall ? undefined : posterUrl,
  posterFill,
  score,
})

export function buildSummary(list = listStore.get()): ProfileSummary {
  const rated = list.filter((e) => e.rating)
  const counts: Record<string, number> = {}
  for (const e of list) counts[e.status] = (counts[e.status] ?? 0) + 1
  const byChange = (a: ListEntry, b: ListEntry) => (b.updatedAt ?? b.addedAt) - (a.updatedAt ?? a.addedAt)
  return {
    facts: listFacts(list),
    counts,
    meanRating: rated.length ? Math.round((rated.reduce((n, e) => n + e.rating!, 0) / rated.length) * 10) / 10 : undefined,
    favorites: [...rated]
      .sort((a, b) => b.rating! - a.rating! || byChange(a, b))
      .slice(0, 12)
      .map((e) => slim(e.anime)),
    watching: list
      .filter((e) => e.status === 'watching')
      .sort(byChange)
      .slice(0, 12)
      .map((e) => ({ ...slim(e.anime), watched: e.watched })),
    recent: list
      .filter((e) => e.status === 'completed')
      .sort(byChange)
      .slice(0, 12)
      .map((e) => slim(e.anime)),
    achievements: [...unlocked(list, flagsStore.get())],
  }
}

export const publishProfile = (about?: string) =>
  callCommunity({ action: 'profile-save', about, summary: JSON.stringify(buildSummary()) })

export const hideProfile = () => callCommunity({ action: 'profile-hide' })

export async function loadProfile(userId: string): Promise<PublicProfile | null> {
  try {
    const row = (await tablesDB.getRow({ databaseId: COMMUNITY_DB, tableId: 'profiles', rowId: userId })) as unknown as {
      $id: string
      name: string
      about?: string
      updatedAt: number
      summary: string
    }
    return { ...row, summary: JSON.parse(row.summary) as ProfileSummary }
  } catch {
    return null
  }
}

let started = false
let timer: ReturnType<typeof setTimeout> | undefined
let about: string | undefined

/** Профиль открыт: после изменений в списке обновляем его не чаще раза в минуту. */
export function autoPublish(currentAbout?: string) {
  if (currentAbout !== undefined) about = currentAbout
  if (started) return
  started = true
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void publishProfile(about).catch(() => undefined), 60_000)
  }
  listStore.subscribe(later)
  flagsStore.subscribe(later)
}

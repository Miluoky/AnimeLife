import { COMMUNITY_DB, tablesDB } from '../api/appwrite'
import { unlocked, listFacts, type ListFacts } from './achievements'
import { callCommunity } from './community'
import { flagsStore } from './flags'
import { listStore, type ListEntry, type ListStatus } from './myList'
import { profileStyleStore, type ProfileStyle } from './profileStyle'
import { watchLogStore } from './watchLog'
import { totalXp, weekXp, monthXp } from './xp'

/** Открытый профиль /u/:id: имя, о себе, счётчики, любимое, что смотрит сейчас, достижения. */
export interface ProfileSummary {
  facts: ListFacts
  counts: Record<string, number>
  meanRating?: number
  favorites: ListEntry['anime'][]
  watching: (ListEntry['anime'] & { watched?: number })[]
  recent: ListEntry['anime'][]
  achievements: string[]
  /** опыт для уровня и топа зрителей */
  xp?: number
  week?: { key: number; xp: number }
  /** опыт за месяц по журналу: топ месяца и итоги в Telegram-канале */
  month?: { key: number; xp: number }
  /** весь список коротко: [id, оценка или 0, номер статуса] — для «Совпадения вкусов» */
  rates?: [string, number, number][]
  style?: ProfileStyle
  /** витрина: тайтлы, которые зритель выбрал сам */
  showcase?: ListEntry['anime'][]
}

export const STATUS_ORDER: ListStatus[] = ['watching', 'planned', 'completed', 'on_hold', 'dropped']
/** Строка профиля в базе не больше 60 000 символов: длинный список урезаем. */
const MAX_RATES = 1500

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
  const base = {
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
  const style = profileStyleStore.get()
  const byId = new Map(list.map((e) => [e.anime.id, e]))
  return {
    ...base,
    xp: totalXp(list, base.achievements.length),
    week: weekXp(watchLogStore.get().entries),
    month: monthXp(watchLogStore.get().entries),
    rates: [...list]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, MAX_RATES)
      .map((e) => [e.anime.id, e.rating ?? 0, STATUS_ORDER.indexOf(e.status)]),
    style,
    showcase: (style.showcase ?? []).flatMap((id) => (byId.has(id) ? [slim(byId.get(id)!.anime)] : [])).slice(0, 6),
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
  profileStyleStore.subscribe(later)
  watchActivity()
}

type Snapshot = Map<string, { status: ListStatus; rating?: number; watched?: number }>
const snapshot = (): Snapshot => new Map(listStore.get().map((e) => [e.anime.id, { status: e.status, rating: e.rating, watched: e.watched }]))

/** Изменения в списке уходят в ленту подписчиков: новый статус, оценка, просмотренная серия. */
function watchActivity() {
  let prev = snapshot()
  let queue: Promise<unknown> = Promise.resolve()
  listStore.subscribe(() => {
    const next = snapshot()
    const events: [Parameters<typeof import('./social').sendActivity>, string][] = []
    for (const e of listStore.get()) {
      const before = prev.get(e.anime.id)
      const anime = { id: e.anime.id, title: e.anime.title, poster: e.anime.posterSmall ?? e.anime.posterUrl }
      if (!before || before.status !== e.status) events.push([['status', anime, 0, e.status], e.anime.id])
      if (e.rating && e.rating !== before?.rating) events.push([['rating', anime, e.rating], e.anime.id])
      if (e.watched && e.watched > (before?.watched ?? 0) && e.status === 'watching') events.push([['episode', anime, e.watched], e.anime.id])
    }
    prev = next
    // Импорт списка — не новости: больше пяти событий разом не шлём.
    if (!events.length || events.length > 5) return
    queue = queue.then(async () => {
      const { sendActivity } = await import('./social')
      for (const [args] of events) await sendActivity(...args).catch(() => undefined)
    })
  })
}

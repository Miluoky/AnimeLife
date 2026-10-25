import type { ListEntry } from './myList'
import type { LogEntry } from './watchLog'
import { inviteStore, type InviteStats } from './inviteStore'

/**
 * Опыт и уровни зрителя. Опыт считается по списку и достижениям, неделя — по журналу просмотра.
 * Сервер принимает число и только отсекает явную накрутку (functions/community/src/profile.js).
 */
export const XP = { episode: 10, completed: 50, rating: 5, achievement: 100, invite: 200, invited: 50 }

/** За друзей по ссылке опыт идёт максимум за столько человек: дальше это уже не друзья, а реклама. */
export const INVITE_CAP = 50

export function totalXp(list: ListEntry[], achievements: number, invites: InviteStats = inviteStore.get()) {
  let xp = achievements * XP.achievement
  xp += Math.min(invites.invited, INVITE_CAP) * XP.invite + (invites.invitedBy ? XP.invited : 0)
  for (const e of list) {
    xp += (e.watched ?? (e.status === 'completed' ? e.anime.episodes ?? 0 : 0)) * XP.episode
    if (e.status === 'completed') xp += XP.completed
    if (e.rating) xp += XP.rating
  }
  return xp
}

/** Номер недели ГГГГНН по ISO (UTC), как на сервере. */
export function weekKey(t = Date.now()) {
  const d = new Date(t)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const week = Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
  return date.getUTCFullYear() * 100 + week
}

export function weekXp(entries: LogEntry[], t = Date.now()) {
  const key = weekKey(t)
  return { key, xp: entries.filter((e) => weekKey(e.at) === key).length * XP.episode }
}

/** Месяц ГГГГММ (UTC), как на сервере и в итогах месяца в Telegram-канале. */
export function monthKey(t = Date.now()) {
  const d = new Date(t)
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1
}

export function monthXp(entries: LogEntry[], t = Date.now()) {
  const key = monthKey(t)
  return { key, xp: entries.filter((e) => monthKey(e.at) === key).length * XP.episode }
}

/** Сколько опыта нужно для уровня n: 100, 300, 600… */
export const xpFor = (level: number) => 50 * level * (level - 1)

export function levelOf(xp: number) {
  let level = 1
  while (xpFor(level + 1) <= xp) level++
  const from = xpFor(level)
  const to = xpFor(level + 1)
  return { level, progress: (xp - from) / (to - from), next: to - xp, rank: rankOf(level) }
}

const RANKS: [number, string][] = [
  [30, 'Легенда'],
  [22, 'Сэнсэй'],
  [15, 'Сэмпай'],
  [10, 'Отаку'],
  [6, 'Любитель'],
  [3, 'Зритель'],
  [1, 'Новичок'],
]

export const rankOf = (level: number) => RANKS.find(([min]) => level >= min)![1]

import { callCommunity } from './community'
import { createLocalStore } from './localStore'
import type { ProfileSummary } from './profile'

/** Социальная часть сайта: подписки и лента, топ зрителей, подборки зрителей, клубы, оценки серий. */

// --- Подписки и лента ---

export interface Activity {
  $id: string
  userId: string
  name: string
  kind: 'status' | 'rating' | 'episode'
  animeId: string
  title: string
  poster?: string
  status?: string
  value: number
  at: number
}

export const follow = (userId: string) => callCommunity<{ followers: number }>({ action: 'follow', userId })
export const unfollow = (userId: string) => callCommunity<{ followers: number }>({ action: 'unfollow', userId })

export async function followCounts(userId: string) {
  const res = await fetch(`/api/core/social/counts?userId=${encodeURIComponent(userId)}`, { credentials: 'include' })
  if (!res.ok) return { followers: 0, following: 0 }
  return (await res.json()) as { followers: number; following: number }
}

export async function isFollowing(me: string, userId: string) {
  const res = await fetch(
    `/api/core/social/is-following?me=${encodeURIComponent(me)}&userId=${encodeURIComponent(userId)}`,
    { credentials: 'include' },
  )
  if (!res.ok) return false
  return !!(await res.json() as { following: boolean }).following
}

export async function followingIds(me: string) {
  const res = await fetch(`/api/core/social/following?me=${encodeURIComponent(me)}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { ids: string[] }).ids ?? []
}

/** Лента: события людей, на которых подписан; без подписок — все открытые профили. */
export async function loadFeed(ids?: string[]) {
  if (ids && !ids.length) return []
  const q = ids?.length ? `?ids=${encodeURIComponent(ids.slice(0, 100).join(','))}` : ''
  const res = await fetch(`/api/core/social/feed${q}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { activity: Activity[] }).activity ?? []
}

export const sendActivity = (kind: Activity['kind'], anime: { id: string; title: string; poster?: string }, value: number, status?: string) =>
  callCommunity({ action: 'activity-add', kind, anime, value, status })

// --- Люди и топ ---

export interface ProfileRow {
  $id: string
  name: string
  about?: string
  updatedAt: number
  xp?: number
  weekXp?: number
  monthXp?: number
  summary: string
}

export const parseSummary = (row: ProfileRow): Partial<ProfileSummary> => {
  try {
    return JSON.parse(row.summary)
  } catch {
    return {}
  }
}

export async function loadPeople() {
  const res = await fetch('/api/core/social/top', { credentials: 'include' })
  if (!res.ok) return []
  return (((await res.json()) as { profiles: ProfileRow[] }).profiles ?? []).slice(0, 30)
}

export async function loadLeaders(period: 'week' | 'month' | 'all') {
  // week/month ключи в Core пока не считаем — топ по xp.
  void period
  const res = await fetch('/api/core/social/top', { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { profiles: ProfileRow[] }).profiles ?? []
}

// --- Подборки зрителей ---

export interface CollectionItem {
  id: string
  title: string
  poster?: string
  year?: number
  kind?: string
  note?: string
}

export interface UserCollection {
  $id: string
  ownerId: string
  ownerName: string
  title: string
  about?: string
  items: string
  count: number
  cover?: string
  likes: number
  updatedAt: number
}

export const collectionItems = (c: UserCollection): CollectionItem[] => {
  try {
    return JSON.parse(c.items)
  } catch {
    return []
  }
}

export async function loadCollection(id: string) {
  const res = await fetch(`/api/core/collections?id=${encodeURIComponent(id)}`, { credentials: 'include' })
  if (!res.ok) return null
  return ((await res.json()) as { collection: UserCollection }).collection ?? null
}

export async function loadCollections(order: 'popular' | 'new' = 'popular', ownerId?: string) {
  const q = new URLSearchParams({ order: order === 'new' ? 'new' : 'popular' })
  if (ownerId) q.set('ownerId', ownerId)
  const res = await fetch(`/api/core/collections?${q}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { collections: UserCollection[] }).collections ?? []
}

export const saveCollection = (c: { id?: string; title: string; about: string; items: CollectionItem[] }) =>
  callCommunity<{ collection: UserCollection }>({ action: 'ucol-save', ...c }).then((r) => r.collection)

export const deleteCollection = (id: string) => callCommunity({ action: 'ucol-delete', id })
export const likeCollection = (id: string) => callCommunity<{ liked: boolean; likes: number }>({ action: 'ucol-like', id })
export const myCollectionLikes = () => callCommunity<{ liked: string[] }>({ action: 'ucol-my-likes' }).then((r) => r.liked)

// --- Клубы ---

export interface Club {
  $id: string
  ownerId: string
  ownerName: string
  title: string
  about?: string
  members: number
  posts: number
  at: number
  lastAt: number
}

export interface ClubPost {
  $id: string
  clubId: string
  userId: string
  name: string
  text: string
  at: number
  hidden?: boolean
}

export async function loadClubs(order: 'active' | 'big' = 'active') {
  const res = await fetch(`/api/core/clubs?order=${order === 'big' ? 'big' : 'active'}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { clubs: Club[] }).clubs ?? []
}

export async function loadClub(id: string) {
  const res = await fetch(`/api/core/clubs?id=${encodeURIComponent(id)}`, { credentials: 'include' })
  if (!res.ok) return null
  return ((await res.json()) as { club: Club }).club ?? null
}

export async function loadClubPosts(clubId: string) {
  const res = await fetch(`/api/core/clubs/posts?clubId=${encodeURIComponent(clubId)}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { posts: ClubPost[] }).posts ?? []
}

export async function myClubIds(userId: string) {
  const res = await fetch(`/api/core/clubs/member?userId=${encodeURIComponent(userId)}`, { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { ids: string[] }).ids ?? []
}

export const createClub = (title: string, about: string) => callCommunity<{ club: Club }>({ action: 'club-create', title, about }).then((r) => r.club)
export const deleteClub = (clubId: string) => callCommunity({ action: 'club-delete', clubId })
export const joinClub = (clubId: string) => callCommunity<{ members: number }>({ action: 'club-join', clubId })
export const leaveClub = (clubId: string) => callCommunity<{ members: number }>({ action: 'club-leave', clubId })
export const postToClub = (clubId: string, text: string) => callCommunity<{ post: ClubPost }>({ action: 'club-post', clubId, text }).then((r) => r.post)
export const deleteClubPost = (postId: string) => callCommunity({ action: 'club-post-delete', postId })
export const reportClubPost = (postId: string) => callCommunity<{ hidden?: boolean; already?: boolean }>({ action: 'club-post-report', postId })

/** Цель клуба на этом устройстве. Общая для участников копия — запись на стене с меткой #цель. */
export interface ClubGoal {
  animeId: string
  title: string
  episode: number
  /** ГГГГ-ММ-ДД, если срок задан */
  deadline?: string
  setAt: number
}

export const clubGoalStore = createLocalStore<Record<string, ClubGoal>>('anime.club.goal.v1', {})

export function saveClubGoal(clubId: string, goal: ClubGoal) {
  clubGoalStore.set({ ...clubGoalStore.get(), [clubId]: goal })
}

function ruDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Текст записи на стене: первая строка для людей, вторая — чтобы цель можно было прочитать с любой стены. */
export function clubGoalText(g: Pick<ClubGoal, 'animeId' | 'title' | 'episode' | 'deadline'>) {
  const title = g.title.replace(/[«»\r\n]/g, '').trim().slice(0, 120) || 'Аниме'
  const when = g.deadline ? ` Срок: ${ruDay(g.deadline)}.` : ''
  const mark = `#цель anime:${g.animeId} ep:${g.episode}${g.deadline ? ` until:${g.deadline}` : ''}`
  return `Цель клуба: «${title}» — досмотреть до серии ${g.episode}.${when}\n${mark}`
}

const GOAL_MARK = /#цель\s+anime:(\d+)\s+ep:(\d+)(?:\s+until:(\d{4}-\d{2}-\d{2}))?/

export function parseClubGoal(text: string, at: number): ClubGoal | null {
  const m = GOAL_MARK.exec(text)
  if (!m) return null
  const episode = Number(m[2])
  if (!Number.isFinite(episode) || episode < 1) return null
  const title = /«([^»]+)»/.exec(text)?.[1]?.trim() || 'Аниме'
  return { animeId: m[1], title, episode, deadline: m[3] || undefined, setAt: at }
}

/** Самая свежая цель среди записей (они приходят от новых к старым). */
export function goalFromPosts(posts: { text: string; at: number }[]): ClubGoal | null {
  for (const p of posts) {
    const g = parseClubGoal(p.text, p.at)
    if (g) return g
  }
  return null
}

/** Локальная цель и цель со стены: показываем ту, что поставили позже. Пока стена грузится — локальную. */
export function activeClubGoal(local: ClubGoal | undefined, posts: { text: string; at: number }[] | null): ClubGoal | null {
  const wall = posts ? goalFromPosts(posts) : null
  if (!local) return wall
  if (!wall) return local
  return local.setAt >= wall.setAt ? local : wall
}

// --- Оценки серий ---

export interface EpisodeScore {
  animeId: string
  episode: number
  avg: number
  votes: number
}

export async function loadEpisodeScore(animeId: string, episode: number) {
  const res = await fetch(
    `/api/core/social/episode-score?animeId=${encodeURIComponent(animeId)}&episode=${encodeURIComponent(String(episode))}`,
    { credentials: 'include' },
  )
  if (!res.ok) return null
  return ((await res.json()) as { score: EpisodeScore | null }).score ?? null
}

export const loadBestEpisodes = async (animeId: string) => {
  const res = await fetch(`/api/core/social/best-episodes?animeId=${encodeURIComponent(animeId)}`, { credentials: 'include' })
  if (!res.ok) return [] as EpisodeScore[]
  return ((await res.json()) as { scores: EpisodeScore[] }).scores ?? []
}

export const rateEpisode = (animeId: string, episode: number, score: number) =>
  callCommunity<{ score: number; avg: number; votes: number }>({ action: 'episode-rate', animeId, episode, score })

export const myEpisodeRate = (animeId: string, episode: number) =>
  callCommunity<{ score: number }>({ action: 'episode-my-rate', animeId, episode }).then((r) => r.score)

import { Query } from 'appwrite'
import { COMMUNITY_DB, tablesDB } from '../api/appwrite'
import { callCommunity } from './community'
import type { ProfileSummary } from './profile'
import { weekKey, monthKey } from './xp'

/** Социальная часть сайта: подписки и лента, топ зрителей, подборки зрителей, клубы, оценки серий. Пишет функция community. */

const list = async <T>(tableId: string, queries: string[]) =>
  (await tablesDB.listRows({ databaseId: COMMUNITY_DB, tableId, queries })) as unknown as { total: number; rows: T[] }

const one = async <T>(tableId: string, rowId: string) => {
  try {
    return (await tablesDB.getRow({ databaseId: COMMUNITY_DB, tableId, rowId })) as unknown as T
  } catch {
    return null
  }
}

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
  const [followers, following] = await Promise.all([
    list('follows', [Query.equal('followeeId', userId), Query.limit(1)]),
    list('follows', [Query.equal('followerId', userId), Query.limit(1)]),
  ])
  return { followers: followers.total, following: following.total }
}

export async function isFollowing(me: string, userId: string) {
  const r = await list('follows', [Query.equal('followerId', me), Query.equal('followeeId', userId), Query.limit(1)])
  return r.total > 0
}

export async function followingIds(me: string) {
  const r = await list<{ followeeId: string }>('follows', [Query.equal('followerId', me), Query.limit(500)])
  return r.rows.map((x) => x.followeeId)
}

/** Лента: события людей, на которых подписан; без подписок — все открытые профили. */
export async function loadFeed(ids?: string[]) {
  if (ids && !ids.length) return []
  const queries = [Query.orderDesc('at'), Query.limit(60)]
  if (ids) queries.unshift(Query.equal('userId', ids.slice(0, 100)))
  return (await list<Activity>('activity', queries)).rows
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

export const loadPeople = () =>
  list<ProfileRow>('profiles', [Query.orderDesc('updatedAt'), Query.limit(30)]).then((r) => r.rows)

export function loadLeaders(period: 'week' | 'month' | 'all') {
  const queries =
    period === 'week'
      ? [Query.equal('weekKey', weekKey()), Query.greaterThan('weekXp', 0), Query.orderDesc('weekXp'), Query.limit(50)]
      : period === 'month'
        ? [Query.equal('monthKey', monthKey()), Query.greaterThan('monthXp', 0), Query.orderDesc('monthXp'), Query.limit(50)]
        : [Query.greaterThan('xp', 0), Query.orderDesc('xp'), Query.limit(50)]
  return list<ProfileRow>('profiles', queries).then((r) => r.rows)
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

export const loadCollection = (id: string) => one<UserCollection>('user_collections', id)

export function loadCollections(order: 'popular' | 'new' = 'popular', ownerId?: string) {
  const queries = [Query.equal('hidden', false), order === 'popular' ? Query.orderDesc('likes') : Query.orderDesc('updatedAt'), Query.limit(48)]
  if (ownerId) queries.unshift(Query.equal('ownerId', ownerId))
  return list<UserCollection>('user_collections', queries).then((r) => r.rows)
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

export const loadClubs = (order: 'active' | 'big' = 'active') =>
  list<Club>('clubs', [order === 'active' ? Query.orderDesc('lastAt') : Query.orderDesc('members'), Query.limit(60)]).then((r) => r.rows)

export const loadClub = (id: string) => one<Club>('clubs', id)

export const loadClubPosts = (clubId: string) =>
  list<ClubPost>('club_posts', [Query.equal('clubId', clubId), Query.equal('hidden', false), Query.orderDesc('at'), Query.limit(100)]).then((r) => r.rows)

export async function myClubIds(userId: string) {
  const r = await list<{ clubId: string }>('club_members', [Query.equal('userId', userId), Query.limit(200)])
  return r.rows.map((x) => x.clubId)
}

export const createClub = (title: string, about: string) => callCommunity<{ club: Club }>({ action: 'club-create', title, about }).then((r) => r.club)
export const deleteClub = (clubId: string) => callCommunity({ action: 'club-delete', clubId })
export const joinClub = (clubId: string) => callCommunity<{ members: number }>({ action: 'club-join', clubId })
export const leaveClub = (clubId: string) => callCommunity<{ members: number }>({ action: 'club-leave', clubId })
export const postToClub = (clubId: string, text: string) => callCommunity<{ post: ClubPost }>({ action: 'club-post', clubId, text }).then((r) => r.post)
export const deleteClubPost = (postId: string) => callCommunity({ action: 'club-post-delete', postId })
export const reportClubPost = (postId: string) => callCommunity<{ hidden?: boolean; already?: boolean }>({ action: 'club-post-report', postId })

// --- Оценки серий ---

export interface EpisodeScore {
  animeId: string
  episode: number
  avg: number
  votes: number
}

export async function loadEpisodeScore(animeId: string, episode: number) {
  const r = await list<EpisodeScore>('episode_scores', [Query.equal('animeId', animeId), Query.equal('episode', episode), Query.limit(1)])
  return r.rows[0] ?? null
}

export const loadBestEpisodes = (animeId: string) =>
  list<EpisodeScore>('episode_scores', [Query.equal('animeId', animeId), Query.greaterThan('votes', 0), Query.orderDesc('avg'), Query.limit(6)]).then(
    (r) => r.rows,
  )

export const rateEpisode = (animeId: string, episode: number, score: number) =>
  callCommunity<{ score: number; avg: number; votes: number }>({ action: 'episode-rate', animeId, episode, score })

export const myEpisodeRate = (animeId: string, episode: number) =>
  callCommunity<{ score: number }>({ action: 'episode-my-rate', animeId, episode }).then((r) => r.score)

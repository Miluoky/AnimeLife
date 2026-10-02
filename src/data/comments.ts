import { Query } from 'appwrite'
import { COMMUNITY_DB, tablesDB } from '../api/appwrite'
import { callCommunity } from './community'

/** Обсуждение серии: комментарии с пометкой «спойлер», как на Crunchyroll и AniList. */
export interface EpisodeComment {
  $id: string
  animeId: string
  episode: number
  userId: string
  name: string
  text: string
  spoiler: boolean
  at: number
}

export async function loadComments(animeId: string, episode: number): Promise<EpisodeComment[]> {
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'comments',
    queries: [
      Query.equal('animeId', animeId),
      Query.equal('episode', episode),
      Query.equal('hidden', false),
      Query.orderDesc('at'),
      Query.limit(100),
    ],
  })
  return res.rows as unknown as EpisodeComment[]
}

export const saveComment = (animeId: string, episode: number, text: string, spoiler: boolean) =>
  callCommunity<{ comment: EpisodeComment }>({ action: 'comment-save', animeId, episode, text, spoiler }).then(
    (r) => r.comment,
  )

export const deleteComment = (commentId: string) => callCommunity({ action: 'comment-delete', commentId })

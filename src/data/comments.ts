import { callCommunity } from './community'

/** Комментарии: episode ≥ 1 — к серии, episode = 0 — к тайтлу на странице аниме. */
export const TITLE_COMMENTS_EPISODE = 0

export interface EpisodeComment {
  $id: string
  animeId: string
  episode: number
  userId: string
  name: string
  text: string
  spoiler: boolean
  at: number
  reports?: number
  hidden?: boolean
  /** ответ на комментарий: его id и имя автора */
  replyTo?: string | null
  replyName?: string | null
}

function targetOf(animeId: string, episode: number) {
  return episode > 0 ? `${animeId}:${episode}` : animeId
}

export async function loadComments(animeId: string, episode: number): Promise<EpisodeComment[]> {
  const targetId = targetOf(animeId, episode)
  const res = await fetch(`/api/core/comments?targetId=${encodeURIComponent(targetId)}`, { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as {
    comments: {
      $id: string
      $createdAt?: string
      userId: string
      userName?: string
      name?: string
      text: string
      hidden?: boolean
      spoiler?: boolean
      at?: number
      reports?: number
      replyTo?: string | null
      replyName?: string | null
      animeId?: string
      episode?: number
    }[]
  }
  return (data.comments ?? []).map((c) => ({
    $id: c.$id,
    animeId: c.animeId || animeId,
    episode: c.episode ?? episode,
    userId: c.userId,
    name: c.name || c.userName || 'Зритель',
    text: c.text,
    spoiler: !!c.spoiler,
    at: typeof c.at === 'number' ? c.at : Date.parse(c.$createdAt || '') || Date.now(),
    hidden: c.hidden,
    reports: c.reports,
    replyTo: c.replyTo ?? null,
    replyName: c.replyName ?? null,
  }))
}

export const saveComment = (animeId: string, episode: number, text: string, spoiler: boolean, replyTo?: string) =>
  callCommunity<{ comment: EpisodeComment }>({ action: 'comment-save', animeId, episode, text, spoiler, replyTo }).then(
    (r) => r.comment,
  )

export const deleteComment = (commentId: string) => callCommunity({ action: 'comment-delete', commentId })

export const reportComment = (commentId: string) =>
  callCommunity<{ hidden?: boolean; already?: boolean }>({ action: 'comment-report', commentId })

export const loadCommentModeration = () =>
  callCommunity<{ comments: EpisodeComment[] }>({ action: 'comment-mod-list' }).then((r) => r.comments)

export const moderateComment = (commentId: string, decision: 'hide' | 'show' | 'delete') =>
  callCommunity<{ comment?: EpisodeComment }>({ action: 'comment-mod-action', commentId, decision })

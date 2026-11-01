import { callCommunity } from './community'
import { createLocalStore } from './localStore'

export interface WallComment {
  id: string
  profileId?: string
  userId: string
  name: string
  avatarUrl?: string
  frame?: string
  text: string
  at: number
  likes: number
  liked?: boolean
  replyToName?: string
  hidden?: boolean
  pending?: boolean
}

/** Локальный кеш комментариев стены для мгновенного рендера и офлайн-режима. Без фейковых mock-данных. */
export const wallCacheStore = createLocalStore<Record<string, WallComment[]>>('anime.profile.wall.v2', {})

/** Загрузить записи стены с сервера Appwrite с фоллбэком на локальный кеш при сбоях сети */
export async function fetchWallComments(profileId: string): Promise<WallComment[]> {
  try {
    const res = await callCommunity<{ comments: WallComment[] }>({ action: 'wall-list', profileId })
    const comments = res.comments ?? []
    const cache = wallCacheStore.get()
    wallCacheStore.set({ ...cache, [profileId]: comments })
    return comments
  } catch (err) {
    // Graceful offline fallback
    const cached = wallCacheStore.get()[profileId] || []
    return cached
  }
}

/** Опубликовать запись на стене профиля */
export async function sendWallPost(params: {
  profileId: string
  text: string
  replyToName?: string
  avatarUrl?: string
  frame?: string
}): Promise<{ comment: WallComment; held?: string }> {
  const res = await callCommunity<{ comment: WallComment; held?: string }>({
    action: 'wall-post',
    profileId: params.profileId,
    text: params.text,
    replyToName: params.replyToName,
    avatarUrl: params.avatarUrl,
    frame: params.frame,
  })

  const newComment: WallComment = {
    ...res.comment,
    id: res.comment.id || (res.comment as any).$id,
  }

  const cache = wallCacheStore.get()
  const current = cache[params.profileId] || []
  wallCacheStore.set({
    ...cache,
    [params.profileId]: [newComment, ...current.filter((c) => c.id !== newComment.id)],
  })

  return { comment: newComment, held: res.held }
}

/** Удалить запись со стены (автор, владелец профиля или админ) */
export async function removeWallPost(commentId: string, profileId: string): Promise<void> {
  await callCommunity({ action: 'wall-delete', commentId })
  const cache = wallCacheStore.get()
  const current = cache[profileId] || []
  wallCacheStore.set({
    ...cache,
    [profileId]: current.filter((c) => c.id !== commentId),
  })
}

/** Поставить / снять лайк записи на стене */
export async function toggleWallPostLike(
  commentId: string,
  profileId: string,
): Promise<{ liked: boolean; likes: number }> {
  const res = await callCommunity<{ liked: boolean; likes: number }>({ action: 'wall-like', commentId })
  const cache = wallCacheStore.get()
  const current = cache[profileId] || []
  wallCacheStore.set({
    ...cache,
    [profileId]: current.map((c) => (c.id === commentId ? { ...c, likes: res.likes, liked: res.liked } : c)),
  })
  return res
}

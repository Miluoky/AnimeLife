/** Ошибка от Core API для отзывов и уведомлений, её текст можно показать как есть. */
export class CommunityError extends Error {
  name = 'CommunityError'
}

/** Пишем через `/api/core/action`: сервер знает, кто вошёл. */
export async function callCommunity<T = { ok?: boolean }>(body: object): Promise<T> {
  const { coreAction } = await import('../api/core')
  try {
    return await coreAction<T>((body as { action: string }).action, body as Record<string, unknown>)
  } catch (e) {
    throw new CommunityError(e instanceof Error ? e.message : 'Нет связи с сервером. Попробуйте ещё раз.')
  }
}

export interface Review {
  $id: string
  $createdAt: string
  $updatedAt: string
  animeId: string
  userId: string
  userName?: string
  rating?: number | null
  text: string
  likes?: number
  reports?: number
  hidden?: boolean
}

export const REVIEW_MIN = 20
export const REVIEW_MAX = 3000

/** Отзывы тайтла без скрытых модератором. */
export async function loadReviews(animeId: string, _userId?: string): Promise<Review[]> {
  void _userId
  const res = await fetch(`/api/core/reviews?animeId=${encodeURIComponent(animeId)}`, { credentials: 'include' })
  if (!res.ok) throw new CommunityError('Не удалось загрузить отзывы.')
  const data = (await res.json()) as { reviews: Review[] }
  return data.reviews ?? []
}

export interface MyVotes {
  liked: string[]
  reported: string[]
}

export const loadMyVotes = (animeId: string) => callCommunity<MyVotes>({ action: 'review-my-votes', animeId })

export const likeReview = (reviewId: string) =>
  callCommunity<{ liked: boolean; likes: number }>({ action: 'review-like', reviewId })

export const reportReview = (reviewId: string, captcha?: string) =>
  callCommunity<{ hidden?: boolean }>({ action: 'review-report', reviewId, captcha })

export const loadModeration = () => callCommunity<{ reviews: Review[] }>({ action: 'mod-list' }).then((r) => r.reviews)

export interface ModCounts {
  reviews: number
  comments: number
  chat: number
  clubs: number
  takedowns: number
  total: number
}

export const loadModCounts = () => callCommunity<ModCounts>({ action: 'mod-counts' })

export const moderateReview = (reviewId: string, decision: 'hide' | 'show' | 'delete') =>
  callCommunity<{ review?: Review }>({ action: 'mod-action', reviewId, decision })

export async function saveReview(animeId: string, text: string, rating?: number, captcha?: string): Promise<Review> {
  const reply = await callCommunity<{ review: Review }>({
    action: 'review-save',
    animeId,
    text,
    rating: rating ?? null,
    captcha,
  })
  return reply.review
}

export async function deleteReview(animeId: string) {
  await callCommunity({ action: 'review-delete', animeId })
}

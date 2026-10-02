import { ExecutionMethod, Query } from 'appwrite'
import { COMMUNITY_DB, COMMUNITY_FUNCTION, functions, tablesDB } from '../api/appwrite'

/** Ошибка от функции отзывов и уведомлений, её текст можно показать как есть. */
export class CommunityError extends Error {
  name = 'CommunityError'
}

/** Пишем через функцию: она сама знает, кто вошёл, поэтому чужое имя в отзыве подставить нельзя. */
export async function callCommunity<T = { ok?: boolean }>(body: object): Promise<T> {
  let run
  try {
    run = await functions.createExecution({
      functionId: COMMUNITY_FUNCTION,
      body: JSON.stringify(body),
      async: false,
      method: ExecutionMethod.POST,
    })
  } catch {
    throw new CommunityError('Нет связи с сервером. Попробуйте ещё раз.')
  }
  let reply: { error?: string } = {}
  try {
    reply = JSON.parse(run.responseBody || '{}')
  } catch {
    // ответ не JSON: ниже покажем общую ошибку
  }
  if (reply.error || run.responseStatusCode >= 300) {
    throw new CommunityError(reply.error ?? 'Сервер не ответил. Попробуйте ещё раз.')
  }
  return reply as T
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

/** Отзывы тайтла без скрытых модератором. Свой отзыв приходит отдельно, даже если он скрыт. */
export async function loadReviews(animeId: string, userId?: string): Promise<Review[]> {
  const list = (queries: string[]) =>
    tablesDB
      .listRows({
        databaseId: COMMUNITY_DB,
        tableId: 'reviews',
        queries: [Query.equal('animeId', animeId), ...queries],
      })
      .then((res) => res.rows as unknown as Review[])
  const [visible, own] = await Promise.all([
    list([Query.equal('hidden', false), Query.orderDesc('$updatedAt'), Query.limit(100)]),
    userId ? list([Query.equal('userId', userId), Query.limit(1)]) : Promise.resolve([]),
  ])
  return [...own, ...visible.filter((r) => !own.some((o) => o.$id === r.$id))]
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

// Модерация: функция проверяет метку admin у пользователя, сайт только показывает кнопки.
export const loadModeration = () => callCommunity<{ reviews: Review[] }>({ action: 'mod-list' }).then((r) => r.reviews)

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

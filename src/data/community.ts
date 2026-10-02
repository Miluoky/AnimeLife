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
}

export const REVIEW_MIN = 20
export const REVIEW_MAX = 3000

export async function loadReviews(animeId: string): Promise<Review[]> {
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'reviews',
    queries: [Query.equal('animeId', animeId), Query.orderDesc('$updatedAt'), Query.limit(50)],
  })
  return res.rows as unknown as Review[]
}

export async function saveReview(animeId: string, text: string, rating?: number): Promise<Review> {
  const reply = await callCommunity<{ review: Review }>({
    action: 'review-save',
    animeId,
    text,
    rating: rating ?? null,
  })
  return reply.review
}

export async function deleteReview(animeId: string) {
  await callCommunity({ action: 'review-delete', animeId })
}

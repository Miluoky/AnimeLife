/**
 * Отзывы, комментарии, аналитика — бывший Appwrite Function `community` (часть).
 */

import { err, json, userFromRequest } from './auth.js'
import { stampContentModeration } from './moderation.js'
import { coreCacheHeaders } from './router.js'
import { randomId } from './crypto.js'

const REVIEW_MIN = 20
const REVIEW_MAX = 3000
const COMMENT_MAX = 2000
const REPORTS_TO_HIDE = 3

function iso(ts) {
  return new Date(ts).toISOString()
}

function isAdmin(session) {
  return (session?.user?.labels || []).includes('admin')
}

function parseTarget(targetId) {
  const m = /^(\d{1,10}):(\d+)$/.exec(String(targetId || ''))
  if (m) return { animeId: m[1], episode: Number(m[2]) }
  if (/^\d{1,10}$/.test(targetId || '')) return { animeId: String(targetId), episode: 0 }
  return { animeId: '', episode: 0 }
}

function rowReview(r) {
  return {
    $id: r.id,
    $createdAt: iso(r.created_at),
    $updatedAt: iso(r.updated_at),
    animeId: r.anime_id,
    userId: r.user_id,
    userName: r.author_name,
    rating: r.rating,
    text: r.text,
    likes: r.likes,
    reports: r.reports,
    hidden: !!r.hidden,
    moderated: !!r.moderated,
  }
}

function rowComment(c) {
  return {
    $id: c.id,
    $createdAt: iso(c.created_at),
    userId: c.user_id,
    userName: c.author_name,
    targetId: c.target_id,
    text: c.text,
    hidden: !!c.hidden,
  }
}

function rowEpisodeComment(c) {
  const { animeId, episode } = parseTarget(c.target_id)
  return {
    $id: c.id,
    animeId,
    episode,
    userId: c.user_id,
    name: c.author_name,
    text: c.text,
    spoiler: false,
    at: c.created_at,
    reports: c.reports ?? 0,
    hidden: !!c.hidden,
  }
}

export async function handleCommunityGet(request, env, path) {
  const url = new URL(request.url)
  if (path === '/reviews' && request.method === 'GET') {
    const animeId = String(url.searchParams.get('animeId') || '')
    if (!/^\d{1,10}$/.test(animeId)) return err('animeId', 400)
    const session = await userFromRequest(env, request)
    const visible = await env.DB.prepare(
      'SELECT * FROM reviews WHERE anime_id = ? AND hidden = 0 ORDER BY updated_at DESC LIMIT 100',
    )
      .bind(animeId)
      .all()
    let own = []
    if (session) {
      const mine = await env.DB.prepare('SELECT * FROM reviews WHERE anime_id = ? AND user_id = ? LIMIT 1')
        .bind(animeId, session.user.$id)
        .first()
      if (mine) own = [mine]
    }
    const rows = [...own, ...(visible.results || []).filter((r) => !own.some((o) => o.id === r.id))]
    return json({ reviews: rows.map(rowReview) }, 200, coreCacheHeaders(15, { varyCookie: true }))
  }

  if (path === '/comments' && request.method === 'GET') {
    const targetId = String(url.searchParams.get('targetId') || '')
    if (!targetId || targetId.length > 64) return err('targetId', 400)
    const visible = await env.DB.prepare(
      'SELECT * FROM comments WHERE target_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 200',
    )
      .bind(targetId)
      .all()
    return json({ comments: (visible.results || []).map(rowComment) }, 200, coreCacheHeaders(15))
  }

  return null
}

export async function handleCommunityAction(env, session, body) {
  const action = body.action

  if (action === 'review-save') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const animeId = String(body.animeId || '')
    const text = String(body.text || '').trim()
    if (!/^\d{1,10}$/.test(animeId)) return err('Неверный тайтл.', 400)
    if (text.length < REVIEW_MIN || text.length > REVIEW_MAX) {
      return err(`Отзыв от ${REVIEW_MIN} до ${REVIEW_MAX} символов.`, 400)
    }
    const rating = body.rating == null ? null : Math.max(1, Math.min(10, Math.floor(Number(body.rating))))
    const now = Date.now()
    const existing = await env.DB.prepare('SELECT id FROM reviews WHERE user_id = ? AND anime_id = ?')
      .bind(session.user.$id, animeId)
      .first()
    const author = session.user.name || 'Зритель'
    if (existing) {
      await env.DB.prepare(
        'UPDATE reviews SET text = ?, rating = ?, author_name = ?, updated_at = ?, hidden = 0 WHERE id = ?',
      )
        .bind(text, rating, author, now, existing.id)
        .run()
      const row = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?').bind(existing.id).first()
      return json({ ok: true, review: rowReview(row) })
    }
    const id = randomId(12)
    await env.DB.prepare(
      `INSERT INTO reviews (id, user_id, anime_id, text, rating, author_name, hidden, reports, likes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    )
      .bind(id, session.user.$id, animeId, text, rating, author, now, now)
      .run()
    return json({
      ok: true,
      review: rowReview({
        id,
        user_id: session.user.$id,
        anime_id: animeId,
        text,
        rating,
        author_name: author,
        hidden: 0,
        reports: 0,
        likes: 0,
        created_at: now,
        updated_at: now,
      }),
    })
  }

  if (action === 'review-delete') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const animeId = String(body.animeId || '')
    await env.DB.prepare('DELETE FROM reviews WHERE user_id = ? AND anime_id = ?')
      .bind(session.user.$id, animeId)
      .run()
    return json({ ok: true })
  }

  if (action === 'review-like') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const reviewId = String(body.reviewId || '')
    const review = await env.DB.prepare('SELECT id, likes FROM reviews WHERE id = ?').bind(reviewId).first()
    if (!review) return err('Отзыв не найден.', 404)
    const voteId = `${session.user.$id}:like:${reviewId}`
    const existing = await env.DB.prepare('SELECT id FROM votes WHERE id = ?').bind(voteId).first()
    if (existing) {
      await env.DB.prepare('DELETE FROM votes WHERE id = ?').bind(voteId).run()
      const likes = Math.max(0, (review.likes || 0) - 1)
      await env.DB.prepare('UPDATE reviews SET likes = ? WHERE id = ?').bind(likes, reviewId).run()
      return json({ liked: false, likes })
    }
    await env.DB.prepare('INSERT INTO votes (id, user_id, target_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(voteId, session.user.$id, reviewId, 'like', Date.now())
      .run()
    const likes = (review.likes || 0) + 1
    await env.DB.prepare('UPDATE reviews SET likes = ? WHERE id = ?').bind(likes, reviewId).run()
    return json({ liked: true, likes })
  }

  if (action === 'review-report') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const reviewId = String(body.reviewId || '')
    const review = await env.DB.prepare('SELECT id, reports, user_id FROM reviews WHERE id = ?').bind(reviewId).first()
    if (!review) return err('Отзыв не найден.', 404)
    if (review.user_id === session.user.$id) return err('Свой отзыв пожаловаться нельзя.', 400)
    const voteId = `${session.user.$id}:report:${reviewId}`
    const existing = await env.DB.prepare('SELECT id FROM votes WHERE id = ?').bind(voteId).first()
    if (existing) return json({ ok: true, already: true })
    await env.DB.prepare('INSERT INTO votes (id, user_id, target_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(voteId, session.user.$id, reviewId, 'report', Date.now())
      .run()
    const reports = (review.reports || 0) + 1
    const hidden = reports >= REPORTS_TO_HIDE ? 1 : 0
    await env.DB.prepare('UPDATE reviews SET reports = ?, hidden = CASE WHEN ? = 1 THEN 1 ELSE hidden END WHERE id = ?')
      .bind(reports, hidden, reviewId)
      .run()
    return json({ ok: true, hidden: !!hidden })
  }

  if (action === 'review-my-votes') {
    if (!session) return json({ liked: [], reported: [] })
    const animeId = String(body.animeId || '')
    const reviews = await env.DB.prepare('SELECT id FROM reviews WHERE anime_id = ?').bind(animeId).all()
    const ids = (reviews.results || []).map((r) => r.id)
    if (!ids.length) return json({ liked: [], reported: [] })
    const liked = []
    const reported = []
    for (const id of ids) {
      const like = await env.DB.prepare('SELECT id FROM votes WHERE id = ?').bind(`${session.user.$id}:like:${id}`).first()
      if (like) liked.push(id)
      const report = await env.DB.prepare('SELECT id FROM votes WHERE id = ?')
        .bind(`${session.user.$id}:report:${id}`)
        .first()
      if (report) reported.push(id)
    }
    return json({ liked, reported })
  }

  if (action === 'comment-save') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const animeId = String(body.animeId || '')
    const episode = Math.max(0, Math.floor(Number(body.episode) || 0))
    const text = String(body.text || '').trim()
    if (!/^\d{1,10}$/.test(animeId) || text.length < 2 || text.length > COMMENT_MAX) {
      return err('Неверный комментарий.', 400)
    }
    const targetId = episode > 0 ? `${animeId}:${episode}` : animeId
    const id = randomId(12)
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO comments (id, user_id, target_id, text, author_name, hidden, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
      .bind(id, session.user.$id, targetId, text, session.user.name || 'Зритель', now)
      .run()
    const name = session.user.name || 'Зритель'
    return json({
      comment: {
        $id: id,
        $createdAt: iso(now),
        animeId,
        episode,
        userId: session.user.$id,
        name,
        text,
        spoiler: !!body.spoiler,
        at: now,
        replyTo: body.replyTo || null,
      },
    })
  }

  if (action === 'comment-delete') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const commentId = String(body.commentId || '')
    const row = await env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ?').bind(commentId).first()
    if (!row) return err('Не найдено.', 404)
    const admin = (session.user.labels || []).includes('admin')
    if (row.user_id !== session.user.$id && !admin) return err('Нет прав.', 403)
    await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run()
    return json({ ok: true })
  }

  if (action === 'comment-report') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const commentId = String(body.commentId || '')
    const row = await env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ?').bind(commentId).first()
    if (!row) return err('Не найдено.', 404)
    const voteId = `${session.user.$id}:creport:${commentId}`
    if (await env.DB.prepare('SELECT id FROM votes WHERE id = ?').bind(voteId).first()) {
      return json({ ok: true, already: true })
    }
    await env.DB.prepare('INSERT INTO votes (id, user_id, target_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(voteId, session.user.$id, commentId, 'creport', Date.now())
      .run()
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE target_id = ? AND kind = ?')
      .bind(commentId, 'creport')
      .first()
    const reports = Number(count?.n) || 0
    const commentRow = await env.DB.prepare('SELECT moderated FROM comments WHERE id = ?').bind(commentId).first()
    const moderated = !!commentRow?.moderated
    const hidden = reports >= REPORTS_TO_HIDE && !moderated
    await env.DB.prepare('UPDATE comments SET reports = ?, hidden = CASE WHEN ? = 1 THEN 1 ELSE hidden END WHERE id = ?')
      .bind(reports, hidden ? 1 : 0, commentId)
      .run()
    if (hidden) return json({ hidden: true })
    return json({ ok: true })
  }

  if (action === 'mod-counts') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const countWhere = async (table, extra = '') => {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE reports > 0 OR hidden = 1${extra}`,
      ).first()
      return Number(row?.n) || 0
    }
    const [reviews, comments, chat, clubs, takedowns] = await Promise.all([
      countWhere('reviews'),
      countWhere('comments'),
      countWhere('community_chat'),
      countWhere('club_posts'),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM takedowns WHERE status = ?`).bind('new').first().then((r) => Number(r?.n) || 0),
    ])
    return json({ reviews, comments, chat, clubs, takedowns, total: reviews + comments + chat + clubs + takedowns })
  }

  if (action === 'mod-list') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const res = await env.DB.prepare(
      'SELECT * FROM reviews WHERE reports > 0 OR hidden = 1 ORDER BY reports DESC LIMIT 100',
    ).all()
    return json({ reviews: (res.results || []).map(rowReview) })
  }

  if (action === 'mod-action') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const reviewId = String(body.reviewId || '')
    const review = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?').bind(reviewId).first()
    if (!review) return err('Отзыв не найден.', 404)
    if (body.decision === 'delete') {
      await env.DB.prepare('DELETE FROM votes WHERE target_id = ?').bind(reviewId).run()
      await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(reviewId).run()
      return json({ ok: true })
    }
    if (body.decision !== 'hide' && body.decision !== 'show') return err('Неизвестное действие модератора.', 400)
    const hidden = body.decision === 'hide' ? 1 : 0
    await env.DB.prepare('UPDATE reviews SET hidden = ?, moderated = 1 WHERE id = ?').bind(hidden, reviewId).run()
    await stampContentModeration(env, 'reviews', reviewId, session.user.$id)
    const row = await env.DB.prepare('SELECT * FROM reviews WHERE id = ?').bind(reviewId).first()
    return json({ review: rowReview(row) })
  }

  if (action === 'comment-mod-list') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const res = await env.DB.prepare(
      'SELECT * FROM comments WHERE reports > 0 OR hidden = 1 ORDER BY reports DESC LIMIT 100',
    ).all()
    return json({ comments: (res.results || []).map(rowEpisodeComment) })
  }

  if (action === 'comment-mod-action') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const commentId = String(body.commentId || '')
    const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(commentId).first()
    if (!comment) return err('Комментарий не найден.', 404)
    if (body.decision === 'delete') {
      await env.DB.prepare('DELETE FROM votes WHERE target_id = ? AND kind = ?').bind(commentId, 'creport').run()
      await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run()
      return json({ ok: true })
    }
    if (body.decision !== 'hide' && body.decision !== 'show') return err('Неизвестное действие модератора.', 400)
    const hidden = body.decision === 'hide' ? 1 : 0
    await env.DB.prepare('UPDATE comments SET hidden = ?, moderated = 1 WHERE id = ?').bind(hidden, commentId).run()
    await stampContentModeration(env, 'comments', commentId, session.user.$id)
    const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(commentId).first()
    return json({ comment: rowEpisodeComment(row) })
  }

  if (action === 'room-time') {
    return json({ serverNow: Date.now() })
  }

  if (action === 'profile-hide') {
    if (!session) return err('Войдите в аккаунт.', 401)
    await env.DB.prepare('UPDATE profiles SET hidden = 1, updated_at = ? WHERE user_id = ?')
      .bind(Date.now(), session.user.$id)
      .run()
    return json({ ok: true })
  }

  return null
}

/**
 * Точка входа для действий, которые раньше шли в Appwrite Function `community`.
 */

import { err, json, userFromRequest } from './auth.js'
import { handleAnalyticsAction } from './analytics.js'
import { handleCommunityAction } from './community.js'
import { handlePushAction } from './push.js'
import { handleRoomAction } from './rooms.js'
import { handleSocialAction } from './social.js'
import { handleChatAction } from './chat.js'
import { handleClubsAction } from './clubs.js'
import { handleMiscAction } from './misc.js'
import { handleAccountAction } from './account.js'
import { handleShikiAction } from './shiki.js'

const IMPLEMENTED = new Set([
  'health',
  'list-init',
  'profile-get',
  'profile-save',
  'profile-hide',
  'review-save',
  'review-delete',
  'review-like',
  'review-report',
  'review-my-votes',
  'comment-save',
  'comment-delete',
  'comment-report',
  'analytics-track',
  'analytics-stats',
  'quality-track',
  'quality-stats',
  'error-report',
  'error-list',
  'error-clear',
  'room-time',
  'room-create',
  'room-control',
  'room-message',
  'room-message-delete',
  'room-close',
  'room-presence',
  'room-signal',
  'rooms-cleanup',
  'community-chat-send',
  'community-chat-delete',
  'community-chat-report',
  'community-chat-mod-list',
  'community-chat-mod-action',
  'community-chat-cleanup',
  'follow',
  'unfollow',
  'activity-add',
  'ucol-save',
  'ucol-delete',
  'ucol-like',
  'ucol-my-likes',
  'club-create',
  'club-delete',
  'club-join',
  'club-leave',
  'club-post',
  'club-post-delete',
  'club-post-report',
  'push-subscribe',
  'push-unsubscribe',
  'tg-status',
  'tg-subscribe',
  'tg-unsubscribe',
  'wall-list',
  'wall-post',
  'wall-delete',
  'wall-like',
  'notif-list',
  'notif-read',
  'invite-stats',
  'invite-claim',
  'takedown-create',
  'takedown-list',
  'takedown-status',
  'account-export',
  'account-delete',
  'mod-list',
  'mod-action',
  'comment-mod-list',
  'comment-mod-action',
  'episode-rate',
  'episode-my-rate',
  'shiki-connect',
  'shiki-status',
  'shiki-disconnect',
  'shiki-push',
])

export async function handleAction(request, env) {
  if (request.method.toUpperCase() !== 'POST') return err('POST only', 405)
  let body
  try {
    body = await request.json()
  } catch {
    return err('JSON', 400)
  }
  const action = String(body?.action || '')
  if (!action) return err('Нужен action', 400)

  if (action === 'health') {
    return json({ ok: true, backend: 'core', implemented: [...IMPLEMENTED] })
  }

  const session = await userFromRequest(env, request)

  if (action === 'list-init') {
    if (!session) return err('Не авторизован', 401)
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO lists (user_id, data, updated_at) VALUES (?, '[]', ?)
       ON CONFLICT(user_id) DO NOTHING`,
    )
      .bind(session.user.$id, now)
      .run()
    return json({ ok: true })
  }

  if (action === 'profile-get') {
    const id = String(body.userId || session?.user?.$id || '')
    if (!id) return err('userId', 400)
    const row = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ? AND hidden = 0').bind(id).first()
    if (!row) {
      const u = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first()
      if (!u) return err('Нет профиля', 404)
      return json({ profile: { userId: u.id, name: u.name, about: '', summary: {}, xp: 0, level: 1 } })
    }
    let summary = {}
    try {
      summary = JSON.parse(row.summary || '{}')
    } catch {
      summary = {}
    }
    return json({
      profile: {
        userId: row.user_id,
        name: row.name,
        about: row.about,
        summary,
        xp: row.xp,
        level: row.level,
        updatedAt: row.updated_at,
      },
    })
  }

  if (action === 'profile-save') {
    if (!session) return err('Не авторизован', 401)
    const name = String(body.name ?? session.user.name).slice(0, 64)
    const about = String(body.about ?? '').slice(0, 300)
    const summary = typeof body.summary === 'string' ? body.summary : JSON.stringify(body.summary ?? {})
    const now = Date.now()
    let xp = 0
    try {
      const parsed = JSON.parse(summary)
      xp = Math.max(0, Math.min(5_000_000, Math.floor(Number(parsed?.xp) || 0)))
    } catch {
      // empty
    }
    await env.DB.prepare(
      `INSERT INTO profiles (user_id, name, about, summary, xp, level, hidden, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name, about = excluded.about, summary = excluded.summary,
         xp = excluded.xp, hidden = 0, updated_at = excluded.updated_at`,
    )
      .bind(session.user.$id, name, about, summary.slice(0, 60_000), xp, now)
      .run()
    if (name !== session.user.name) {
      await env.DB.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
        .bind(name, now, session.user.$id)
        .run()
    }
    return json({ ok: true })
  }

  for (const handler of [
    handleRoomAction,
    handleChatAction,
    handleSocialAction,
    handleShikiAction,
    handleClubsAction,
    handlePushAction,
    handleCommunityAction,
    handleAnalyticsAction,
    handleAccountAction,
  ]) {
    const handled = await handler(env, session, body)
    if (handled) return handled
  }

  const misc = await handleMiscAction(env, session, body, request)
  if (misc) return misc

  return err(`Действие «${action}» ещё переносится в Core`, 501, 501)
}

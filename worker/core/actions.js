/**
 * Точка входа для действий, которые раньше шли в Appwrite Function `community`.
 */

import { err, json, userFromRequest } from './auth.js'
import { handleCommunityAction } from './community.js'
import { handleRoomAction } from './rooms.js'
import { handleSocialAction } from './social.js'

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
  'room-time',
  'room-create',
  'room-control',
  'room-message',
  'room-message-delete',
  'room-close',
  'room-presence',
  'room-signal',
  'rooms-cleanup',
  'follow',
  'unfollow',
  'activity-add',
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

  for (const handler of [handleRoomAction, handleSocialAction, handleCommunityAction]) {
    const handled = await handler(env, session, body)
    if (handled) return handled
  }

  return err(`Действие «${action}» ещё переносится в Core`, 501, 501)
}

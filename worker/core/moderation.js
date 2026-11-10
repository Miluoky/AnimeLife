/**
 * Бан аккаунтов и аудит (who/when/reason).
 */

import { err, json } from './auth.js'
import { purgeUserSessions } from './account.js'

const BAN_REASON_MAX = 500

function isAdmin(session) {
  return (session?.user?.labels || []).includes('admin')
}

async function findUser(env, body) {
  const id = String(body.userId ?? '').trim()
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  if (id) return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (email) return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
  return null
}

function mapUserBan(row) {
  if (!row) return null
  return {
    userId: row.id,
    email: row.email,
    name: row.name || '',
    active: !!row.status,
    moderatedBy: row.moderated_by || null,
    moderatedAt: row.moderated_at ?? null,
    banReason: row.ban_reason || null,
  }
}

export async function handleModerationAction(env, session, body) {
  const action = body.action

  if (action === 'user-ban' || action === 'user-unban') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const row = await findUser(env, body)
    if (!row) return err('Пользователь не найден.', 404)
    if (row.id === session.user.$id) return err('Нельзя заблокировать себя.', 400)
    const now = Date.now()
    if (action === 'user-ban') {
      const reason = String(body.reason ?? '')
        .trim()
        .slice(0, BAN_REASON_MAX)
      await env.DB.prepare(
        'UPDATE users SET status = 0, moderated_by = ?, moderated_at = ?, ban_reason = ?, updated_at = ? WHERE id = ?',
      )
        .bind(session.user.$id, now, reason || null, now, row.id)
        .run()
      await purgeUserSessions(env, row.id)
    } else {
      await env.DB.prepare(
        'UPDATE users SET status = 1, moderated_by = ?, moderated_at = ?, ban_reason = NULL, updated_at = ? WHERE id = ?',
      )
        .bind(session.user.$id, now, now, row.id)
        .run()
    }
    const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.id).first()
    return json({ ok: true, user: mapUserBan(updated) })
  }

  if (action === 'user-ban-lookup') {
    if (!session) return err('Войдите, чтобы модерировать.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const row = await findUser(env, body)
    if (!row) return err('Пользователь не найден.', 404)
    let moderatorName = ''
    if (row.moderated_by) {
      const mod = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(row.moderated_by).first()
      moderatorName = mod?.name || ''
    }
    return json({ user: { ...mapUserBan(row), moderatorName } })
  }

  return null
}

export async function stampContentModeration(env, table, id, moderatorId) {
  const now = Date.now()
  try {
    await env.DB.prepare(`UPDATE ${table} SET moderated_by = ?, moderated_at = ? WHERE id = ?`)
      .bind(moderatorId, now, id)
      .run()
  } catch {
    // Колонки аудита ещё не накатились — moderated=1 достаточно.
  }
}

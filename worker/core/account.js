/**
 * Выгрузка и удаление аккаунта (152-ФЗ) — порт functions/community/src/account.js на D1.
 */

import { dropSession, err, json } from './auth.js'
import { sha256Hex } from './crypto.js'

const SECRET_FIELDS = new Set(['access', 'refresh', 'p256dh', 'auth', 'password_hash'])

/** [таблица, колонка user id, подпись в выгрузке] */
const OWNED = [
  ['lists', 'user_id', 'lists'],
  ['profiles', 'user_id', 'profiles'],
  ['shiki_links', 'user_id', 'shiki_links'],
  ['reviews', 'user_id', 'reviews'],
  ['comments', 'user_id', 'comments'],
  ['votes', 'user_id', 'votes'],
  ['community_chat', 'user_id', 'community_chat'],
  ['messages', 'user_id', 'messages'],
  ['room_members', 'user_id', 'room_members'],
  ['activity', 'user_id', 'activity'],
  ['user_collections', 'owner_id', 'user_collections'],
  ['collection_likes', 'user_id', 'collection_likes'],
  ['clubs', 'owner_id', 'clubs'],
  ['club_members', 'user_id', 'club_members'],
  ['club_posts', 'user_id', 'club_posts'],
  ['follows', 'follower_id', 'follows'],
  ['follows', 'following_id', 'follows (подписчики)'],
  ['episode_votes', 'user_id', 'episode_votes'],
  ['notifications', 'user_id', 'notifications'],
  ['push_subs', 'user_id', 'push'],
  ['invites', 'user_id', 'invites'],
  ['invites', 'inviter_id', 'invites (приглашённые)'],
  ['profile_wall', 'user_id', 'profile_wall'],
  ['profile_wall_likes', 'user_id', 'profile_wall_likes'],
  ['oauth_links', 'user_id', 'oauth_links'],
]

function stripRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_FIELDS.has(k)) continue
    if (k === 'id') out.$id = v
    else if (k === 'user_id') out.userId = v
    else if (k === 'owner_id') out.ownerId = v
    else if (k === 'follower_id') out.followerId = v
    else if (k === 'following_id') out.followeeId = v
    else if (k.endsWith('_at')) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      out[camel] = typeof v === 'number' && v > 1e12 ? new Date(v).toISOString() : v
    } else out[k] = v
    if (k === 'data' && typeof v === 'string') {
      try {
        const parsed = JSON.parse(v)
        for (const sk of SECRET_FIELDS) delete parsed[sk]
        out.data = parsed
      } catch {
        // keep string
      }
    }
  }
  return out
}

async function rowsOf(env, table, column, userId) {
  if (column === 'user_id' && table === 'lists') {
    const row = await env.DB.prepare('SELECT * FROM lists WHERE user_id = ?').bind(userId).first()
    return row ? [row] : []
  }
  if (column === 'user_id' && table === 'profiles') {
    const row = await env.DB.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first()
    return row ? [row] : []
  }
  if (column === 'user_id' && table === 'shiki_links') {
    const row = await env.DB.prepare('SELECT * FROM shiki_links WHERE user_id = ?').bind(userId).first()
    return row ? [row] : []
  }
  const out = []
  for (let offset = 0; offset < 20_000; offset += 100) {
    const res = await env.DB.prepare(
      `SELECT * FROM ${table} WHERE ${column} = ? LIMIT 100 OFFSET ?`,
    )
      .bind(userId, offset)
      .all()
    const page = res.results || []
    out.push(...page)
    if (page.length < 100) break
  }
  return out
}

async function deleteRows(env, table, column, userId) {
  if (table === 'lists' || table === 'profiles' || table === 'shiki_links') {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run()
    return
  }
  await env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(userId).run()
}

async function accountExport(env, session) {
  const user = session.user
  const row = session.row
  const tables = {}
  for (const [table, column, label] of OWNED) {
    const rows = await rowsOf(env, table, column, user.$id)
    if (rows.length) tables[label] = rows.map(stripRow)
  }
  let prefs = user.prefs ?? {}
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.$id,
      name: user.name,
      email: user.email,
      registered: user.registration ?? new Date(row.created_at).toISOString(),
      prefs,
    },
    tables,
  }
}

export async function purgeUserSessions(env, userId) {
  const res = await env.DB.prepare('SELECT id FROM sessions WHERE user_id = ?').bind(userId).all()
  for (const s of res.results || []) {
    await dropSession(env, s.id)
  }
}

async function accountDelete(env, session, body) {
  const userId = session.user.$id
  if (String(body.confirm ?? '').trim().toUpperCase() !== 'УДАЛИТЬ') {
    return err('Чтобы удалить аккаунт, введите слово УДАЛИТЬ.', 400)
  }

  const cols = await env.DB.prepare('SELECT id FROM user_collections WHERE owner_id = ?').bind(userId).all()
  for (const col of cols.results || []) {
    await env.DB.prepare('DELETE FROM collection_likes WHERE collection_id = ?').bind(col.id).run()
  }

  const clubs = await env.DB.prepare('SELECT id FROM clubs WHERE owner_id = ?').bind(userId).all()
  for (const club of clubs.results || []) {
    await env.DB.prepare('DELETE FROM club_posts WHERE club_id = ?').bind(club.id).run()
    await env.DB.prepare('DELETE FROM club_members WHERE club_id = ?').bind(club.id).run()
  }

  let removed = 0
  const seen = new Set()
  for (const [table, column] of OWNED) {
    const key = `${table}:${column}`
    if (seen.has(key)) continue
    seen.add(key)
    const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
      .bind(userId)
      .first()
    await deleteRows(env, table, column, userId)
    removed += Number(before?.n) || 0
  }

  await env.DB.prepare('DELETE FROM profile_wall WHERE profile_id = ?').bind(userId).run()
  await purgeUserSessions(env, userId)
  await dropSession(env, session.token)

  const del = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
  const accountDeleted = (del.meta?.changes ?? 0) > 0

  return json({ ok: true, removed, accountDeleted })
}

async function sessionRevokeKey(token) {
  return `r${(await sha256Hex(token)).slice(0, 28)}`
}

async function sessionByRevokeKey(env, userId, key) {
  const res = await env.DB.prepare(
    'SELECT id, user_id, created_at, expires_at, user_agent FROM sessions WHERE user_id = ?',
  )
    .bind(userId)
    .all()
  for (const row of res.results || []) {
    if ((await sessionRevokeKey(row.id)) === key) return row
  }
  return null
}

function mapSessionRow(row, currentToken) {
  return {
    revokeKey: null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent || 'Неизвестно',
    current: row.id === currentToken,
  }
}

export async function handleAccountAction(env, session, body, request) {
  const action = body.action

  if (action === 'sessions-list') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const res = await env.DB.prepare(
      'SELECT id, created_at, expires_at, user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
    )
      .bind(session.user.$id)
      .all()
    const sessions = []
    for (const row of res.results || []) {
      const mapped = mapSessionRow(row, session.token)
      mapped.revokeKey = await sessionRevokeKey(row.id)
      sessions.push(mapped)
    }
    return json({ sessions })
  }

  if (action === 'session-revoke') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const key = String(body.revokeKey ?? '').trim()
    if (!key) return err('Нужен revokeKey.', 400)
    const row = await sessionByRevokeKey(env, session.user.$id, key)
    if (!row) return err('Сессия не найдена.', 404)
    const endedCurrent = row.id === session.token
    await dropSession(env, row.id)
    return json({ ok: true, endedCurrent })
  }

  if (action === 'account-export') {
    if (!session) return err('Войдите в аккаунт.', 401)
    return json(await accountExport(env, session))
  }
  if (action === 'account-delete') {
    if (!session) return err('Войдите в аккаунт.', 401)
    return accountDelete(env, session, body)
  }
  return null
}

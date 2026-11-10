/** Синк «Мой список» (замена таблицы lists Appwrite). */

import { err, json, userFromRequest } from './auth.js'

export async function handleLists(request, env, path) {
  const method = request.method.toUpperCase()
  const session = await userFromRequest(env, request)
  if (!session) return err('Не авторизован', 401)
  const uid = session.user.$id

  if (path === '/lists/me' && method === 'GET') {
    const row = await env.DB.prepare('SELECT data, updated_at FROM lists WHERE user_id = ?').bind(uid).first()
    if (!row) return json({ data: [], updatedAt: null })
    let data = []
    try {
      data = JSON.parse(row.data || '[]')
    } catch {
      data = []
    }
    return json({ data, updatedAt: row.updated_at })
  }

  if (path === '/lists/me' && method === 'PUT') {
    let body
    try {
      body = await request.json()
    } catch {
      return err('JSON', 400)
    }
    if (!Array.isArray(body?.data)) return err('Нужен data: []', 400)
    const data = JSON.stringify(body.data).slice(0, 2_000_000)
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO lists (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
      .bind(uid, data, now)
      .run()
    return json({ ok: true, updatedAt: now })
  }

  return err('Not found', 404)
}

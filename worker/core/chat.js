/**
 * Общий чат сообщества на D1. Клиент опрашивает GET /api/core/chat (без Realtime).
 */

import { err, json } from './auth.js'
import { heldReason, rejectSpam, ChatUserError } from './automod.js'
import { randomId, sha256Hex } from './crypto.js'

const MAX_TEXT = 500
const CHAT_LIMIT = 100
const MESSAGES_PER_10S = 5
const REPORTS_PER_10M = 10
const REPORTS_TO_HIDE = 3
const MESSAGE_TTL = 7 * 24 * 60 * 60 * 1000
const MSG_ID_RE = /^[a-zA-Z0-9._-]{1,36}$/

function rowToMessage(row) {
  return {
    $id: row.id,
    userId: row.user_id,
    name: row.name,
    text: row.text,
    at: row.at,
    reports: row.reports ?? 0,
    hidden: !!row.hidden,
    moderated: !!row.moderated,
  }
}

function isAdmin(session) {
  return (session?.user?.labels || []).includes('admin')
}

async function getMessage(env, messageId) {
  if (!MSG_ID_RE.test(String(messageId ?? ''))) return null
  return env.DB.prepare('SELECT * FROM community_chat WHERE id = ?').bind(messageId).first()
}

async function deleteReports(env, messageId) {
  await env.DB.prepare('DELETE FROM community_chat_reports WHERE message_id = ?').bind(messageId).run()
}

async function reportId(messageId, userId) {
  const h = (await sha256Hex(`community-chat:${messageId}:${userId}`)).slice(0, 32)
  return `r${h}`
}

export async function handleChatGet(request, env, path) {
  if (path !== '/chat' || request.method !== 'GET') return null
  const res = await env.DB.prepare(
    'SELECT * FROM community_chat WHERE hidden = 0 ORDER BY at DESC LIMIT ?',
  )
    .bind(CHAT_LIMIT)
    .all()
  const messages = (res.results || []).map(rowToMessage).reverse()
  return json({ messages })
}

export async function handleChatAction(env, session, body) {
  const action = body.action

  if (action === 'community-chat-send') {
    if (!session) return err('Войдите, чтобы писать в общий чат.', 401)
    let message = String(body.text ?? '').trim().replace(/\s+/g, ' ')
    if (!message) return err('Напишите сообщение.', 400)
    if (message.length > MAX_TEXT) return err(`Сообщение длиннее ${MAX_TEXT} символов.`, 400)

    const now = Date.now()
    const recent = await env.DB.prepare(
      `SELECT text FROM community_chat WHERE user_id = ? AND at > ? ORDER BY at DESC LIMIT ?`,
    )
      .bind(session.user.$id, now - 10_000, MESSAGES_PER_10S)
      .all()
    if ((recent.results || []).length >= MESSAGES_PER_10S) {
      return err('Не так быстро: подождите пару секунд.', 400)
    }
    try {
      rejectSpam(message, (recent.results || []).map((r) => r.text))
    } catch (e) {
      return err(e instanceof ChatUserError ? e.message : 'Сообщение отклонено.', 400)
    }
    if (heldReason(message)) return err('В общем чате нельзя мат и ссылки на чужие сайты.', 400)

    const id = randomId(12)
    const name = (session.user.name || 'Зритель').slice(0, 64)
    await env.DB.prepare(
      `INSERT INTO community_chat (id, user_id, name, text, at, hidden, reports, moderated)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
    )
      .bind(id, session.user.$id, name, message, now)
      .run()
    return json({ message: { $id: id, userId: session.user.$id, name, text: message, at: now } })
  }

  if (action === 'community-chat-delete') {
    if (!session) return err('Войдите, чтобы удалять сообщения.', 401)
    const messageId = String(body.messageId ?? '')
    if (!MSG_ID_RE.test(messageId)) return err('Сообщение не найдено.', 400)
    const row = await getMessage(env, messageId)
    if (!row) return json({ ok: true })
    if (row.user_id !== session.user.$id && !isAdmin(session)) {
      return err('Удалить это сообщение может только его автор или модератор.', 403)
    }
    await deleteReports(env, messageId)
    await env.DB.prepare('DELETE FROM community_chat WHERE id = ?').bind(messageId).run()
    return json({ ok: true })
  }

  if (action === 'community-chat-report') {
    if (!session) return err('Войдите, чтобы жаловаться на сообщение.', 401)
    const messageId = String(body.messageId ?? '')
    const row = await getMessage(env, messageId)
    if (!row) return err('Сообщение не найдено.', 404)
    if (row.user_id === session.user.$id) return err('На своё сообщение жаловаться нельзя.', 400)

    const rid = await reportId(row.id, session.user.$id)
    const existing = await env.DB.prepare('SELECT id FROM community_chat_reports WHERE id = ?').bind(rid).first()
    if (existing) return json({ ok: true, already: true, hidden: !!row.hidden })

    const now = Date.now()
    const recent = await env.DB.prepare(
      `SELECT id FROM community_chat_reports WHERE user_id = ? AND at > ? LIMIT ?`,
    )
      .bind(session.user.$id, now - 10 * 60 * 1000, REPORTS_PER_10M)
      .all()
    if ((recent.results || []).length >= REPORTS_PER_10M) {
      return err('Слишком много жалоб. Попробуйте позже.', 400)
    }

    await env.DB.prepare(
      'INSERT INTO community_chat_reports (id, message_id, user_id, at) VALUES (?, ?, ?, ?)',
    )
      .bind(rid, row.id, session.user.$id, now)
      .run()

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM community_chat_reports WHERE message_id = ?',
    )
      .bind(row.id)
      .first()
    const reports = Number(countRow?.n) || 0
    const hidden = !!row.hidden || (!row.moderated && reports >= REPORTS_TO_HIDE)
    await env.DB.prepare('UPDATE community_chat SET reports = ?, hidden = ? WHERE id = ?')
      .bind(reports, hidden ? 1 : 0, row.id)
      .run()
    return json({ ok: true, already: false, hidden })
  }

  if (action === 'community-chat-mod-list') {
    if (!session) return err('Войдите, чтобы модерировать чат.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const res = await env.DB.prepare(
      `SELECT * FROM community_chat WHERE reports > 0 OR hidden = 1 ORDER BY reports DESC LIMIT 100`,
    ).all()
    return json({ messages: (res.results || []).map(rowToMessage) })
  }

  if (action === 'community-chat-mod-action') {
    if (!session) return err('Войдите, чтобы модерировать чат.', 401)
    if (!isAdmin(session)) return err('Нужны права модератора.', 403)
    const messageId = String(body.messageId ?? '')
    const row = await getMessage(env, messageId)
    if (!row) return err('Сообщение не найдено.', 404)

    if (body.decision === 'delete') {
      await deleteReports(env, row.id)
      await env.DB.prepare('DELETE FROM community_chat WHERE id = ?').bind(row.id).run()
      return json({ ok: true })
    }
    if (body.decision !== 'hide' && body.decision !== 'show') return err('Неизвестное действие модератора.', 400)
    const hidden = body.decision === 'hide' ? 1 : 0
    await env.DB.prepare('UPDATE community_chat SET hidden = ?, moderated = 1 WHERE id = ?')
      .bind(hidden, row.id)
      .run()
    const updated = await getMessage(env, row.id)
    return json({ message: rowToMessage(updated) })
  }

  if (action === 'community-chat-cleanup') {
    const cut = Date.now() - MESSAGE_TTL
    let deleted = 0
    for (let page = 0; page < 10; page++) {
      const old = await env.DB.prepare(
        'SELECT id FROM community_chat WHERE at < ? LIMIT 100',
      )
        .bind(cut)
        .all()
      const rows = old.results || []
      for (const row of rows) {
        await deleteReports(env, row.id)
        await env.DB.prepare('DELETE FROM community_chat WHERE id = ?').bind(row.id).run()
        deleted++
      }
      if (rows.length < 100) break
    }
    return json({ ok: true, deleted })
  }

  return null
}

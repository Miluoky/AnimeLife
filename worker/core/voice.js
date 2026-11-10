/**
 * Голос «Вместе» на D1: присутствие и WebRTC-сигналы. Клиент — polling (без Realtime).
 */

import { err, json, userFromRequest } from './auth.js'
import { randomId, sha256Hex } from './crypto.js'

export const MEMBER_TTL_MS = 2 * 60 * 1000
export const VOICE_LIMIT = 6
const MAX_SIGNAL = 20_000
const MEMBER_STORE_TTL = 3600 * 1000
const SIGNAL_STORE_TTL = 10 * 60 * 1000

async function memberRowId(roomId, userId) {
  const h = await sha256Hex(`${roomId}:${userId}`)
  return 'm' + h.slice(0, 32)
}

async function roomExists(env, roomId) {
  const code = String(roomId || '').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) return null
  return env.DB.prepare('SELECT code, updated_at FROM rooms WHERE code = ?').bind(code).first()
}

function parseMember(row) {
  return {
    $id: row.id,
    roomId: row.room_code,
    userId: row.user_id,
    name: row.name || '',
    voice: !!row.voice,
    muted: !!row.muted,
    at: Number(row.at),
  }
}

function parseSignal(row) {
  return {
    $id: row.id,
    roomId: row.room_code,
    from: row.sender_id,
    to: row.receiver_id,
    kind: row.kind,
    data: row.data,
    at: Number(row.at),
  }
}

/** Активная строка присутствия (heartbeat не старше MEMBER_TTL_MS). */
async function activeMember(env, roomId, userId, { voiceOnly = false } = {}) {
  const id = await memberRowId(roomId, userId)
  const now = Date.now()
  const row = await env.DB.prepare(
    'SELECT voice, muted, at FROM room_members WHERE id = ? AND at > ?',
  )
    .bind(id, now - MEMBER_TTL_MS)
    .first()
  if (!row) return null
  if (voiceOnly && !row.voice) return null
  return row
}

async function pruneStaleVoice(env, roomCode = null) {
  const now = Date.now()
  if (roomCode) {
    await env.DB.prepare('DELETE FROM room_signals WHERE room_code = ? AND at < ?')
      .bind(roomCode, now - SIGNAL_STORE_TTL)
      .run()
  } else {
    await env.DB.prepare('DELETE FROM room_signals WHERE at < ?').bind(now - SIGNAL_STORE_TTL).run()
  }
}

/** Сигналы для адресата; после выдачи строки удаляются (одноразовые SDP). */
async function pullSignals(env, roomCode, receiverId, since, { consume = true } = {}) {
  await pruneStaleVoice(env, roomCode)
  const res = await env.DB.prepare(
    'SELECT * FROM room_signals WHERE room_code = ? AND receiver_id = ? AND at > ? ORDER BY at ASC LIMIT 50',
  )
    .bind(roomCode, receiverId, since)
    .all()
  const signals = (res.results || []).map(parseSignal)
  if (consume && signals.length) {
    const placeholders = signals.map(() => '?').join(',')
    await env.DB.prepare(`DELETE FROM room_signals WHERE id IN (${placeholders})`)
      .bind(...signals.map((s) => s.$id))
      .run()
  }
  return signals
}

export async function handleVoiceGet(request, env, path) {
  const url = new URL(request.url)

  if (path === '/rooms/member-counts' && request.method === 'GET') {
    const raw = url.searchParams.get('ids') || ''
    const since = Number(url.searchParams.get('since')) || Date.now() - MEMBER_TTL_MS
    const ids = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z0-9]{6}$/.test(s))
    const counts = {}
    if (!ids.length) return json({ counts })
    const placeholders = ids.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT room_code, COUNT(*) AS c FROM room_members WHERE room_code IN (${placeholders}) AND at > ? GROUP BY room_code`,
    )
      .bind(...ids, since)
      .all()
    for (const row of res.results || []) counts[row.room_code] = Number(row.c) || 0
    return json({ counts, serverNow: Date.now() })
  }

  const parts = path.split('/')
  if (parts.length !== 4 || parts[1] !== 'rooms' || request.method !== 'GET') return null

  const roomCode = parts[2]?.toUpperCase()
  const sub = parts[3]
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) return err('Комната не найдена', 404)

  if (sub === 'members') {
    const since = Number(url.searchParams.get('since')) || Date.now() - MEMBER_TTL_MS
    const res = await env.DB.prepare(
      'SELECT * FROM room_members WHERE room_code = ? AND at > ? ORDER BY at DESC LIMIT 100',
    )
      .bind(roomCode, since)
      .all()
    return json({ members: (res.results || []).map(parseMember), serverNow: Date.now() })
  }

  if (sub === 'signals') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Войдите.', 401)
    const me = session.user.$id
    const since = Number(url.searchParams.get('since')) || 0
    const signals = await pullSignals(env, roomCode, me, since)
    return json({ signals, serverNow: Date.now() })
  }

  return null
}

export async function roomPresence(env, session, body) {
  if (!session) return err('Войдите, чтобы войти в комнату.', 401)
  const room = await roomExists(env, body.roomId)
  if (!room) return err('Комната не найдена.', 404)
  const roomId = room.code
  const user = session.user
  const id = await memberRowId(roomId, user.$id)

  if (body.leave) {
    await env.DB.prepare('DELETE FROM room_members WHERE id = ?').bind(id).run()
    return json({ ok: true, serverNow: Date.now() })
  }

  const now = Date.now()
  const voice = Boolean(body.voice)
  if (voice) {
    const res = await env.DB.prepare(
      'SELECT user_id FROM room_members WHERE room_code = ? AND voice = 1 AND at > ? LIMIT ?',
    )
      .bind(roomId, now - MEMBER_TTL_MS, VOICE_LIMIT + 1)
      .all()
    const others = (res.results || []).filter((r) => r.user_id !== user.$id)
    if (others.length >= VOICE_LIMIT) {
      return err(`В голосовом чате уже ${VOICE_LIMIT} человек. Можно писать в чат.`, 400)
    }
  }

  const name = (user.name || 'Зритель').slice(0, 64)
  await env.DB.prepare(
    `INSERT INTO room_members (id, room_code, user_id, name, voice, muted, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, voice = excluded.voice, muted = excluded.muted, at = excluded.at`,
  )
    .bind(id, roomId, user.$id, name, voice ? 1 : 0, body.muted ? 1 : 0, now)
    .run()

  if (now - (room.updated_at ?? 0) > 60_000) {
    await env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE code = ?').bind(now, roomId).run()
  }

  return json({ ok: true, serverNow: Date.now() })
}

export async function roomSignal(env, session, body) {
  if (!session) return err('Войдите, чтобы говорить в комнате.', 401)
  const room = await roomExists(env, body.roomId)
  if (!room) return err('Комната не найдена.', 404)
  if (!['offer', 'answer', 'bye'].includes(body.kind)) return err('Неизвестный сигнал.', 400)

  const roomId = room.code
  const user = session.user
  if (!(await activeMember(env, roomId, user.$id, { voiceOnly: true }))) {
    return err('Сначала войдите в голосовой чат.', 400)
  }

  const to = String(body.to ?? '').trim()
  if (!to || to === user.$id) return err('Некорректный адресат.', 400)
  if (!(await activeMember(env, roomId, to, { voiceOnly: true }))) {
    return err('Собеседник уже вышел из голосового чата.', 400)
  }

  const data = String(body.data ?? '')
  if (data.length > MAX_SIGNAL) return err('Слишком длинный сигнал.', 400)

  const id = randomId(12)
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO room_signals (id, room_code, sender_id, receiver_id, kind, data, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, roomId, user.$id, to, body.kind, data, now)
    .run()

  const since = Number(body.since)
  const signals =
    Number.isFinite(since) && since >= 0
      ? await pullSignals(env, roomId, user.$id, since)
      : undefined

  return json({ ok: true, serverNow: now, ...(signals ? { signals } : {}) })
}

export async function deleteRoomVoice(env, roomCode) {
  const code = String(roomCode || '').toUpperCase()
  await env.DB.prepare('DELETE FROM room_members WHERE room_code = ?').bind(code).run()
  await env.DB.prepare('DELETE FROM room_signals WHERE room_code = ?').bind(code).run()
}

export async function cleanupVoice(env) {
  const now = Date.now()
  await env.DB.prepare('DELETE FROM room_members WHERE at < ?').bind(now - MEMBER_STORE_TTL).run()
  await env.DB.prepare('DELETE FROM room_signals WHERE at < ?').bind(now - SIGNAL_STORE_TTL).run()
}

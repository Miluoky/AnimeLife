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
    const since = Number(url.searchParams.get('since')) || 0
    const me = session.user.$id
    const res = await env.DB.prepare(
      'SELECT * FROM room_signals WHERE room_code = ? AND receiver_id = ? AND at > ? ORDER BY at ASC LIMIT 50',
    )
      .bind(roomCode, me, since)
      .all()
    const signals = (res.results || []).map((row) => ({
      $id: row.id,
      roomId: row.room_code,
      from: row.sender_id,
      to: row.receiver_id,
      kind: row.kind,
      data: row.data,
      at: Number(row.at),
    }))
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
  const selfId = await memberRowId(roomId, user.$id)
  const self = await env.DB.prepare('SELECT voice FROM room_members WHERE id = ?').bind(selfId).first()
  if (!self?.voice) return err('Сначала войдите в голосовой чат.', 400)

  const to = String(body.to ?? '')
  const targetId = await memberRowId(roomId, to)
  const target = await env.DB.prepare('SELECT voice FROM room_members WHERE id = ?').bind(targetId).first()
  if (!target?.voice) return err('Собеседник уже вышел из голосового чата.', 400)

  const data = String(body.data ?? '')
  if (data.length > MAX_SIGNAL) return err('Слишком длинный сигнал.', 400)

  const id = randomId(12)
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO room_signals (id, room_code, sender_id, receiver_id, kind, data, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, roomId, user.$id, to, body.kind, data, now)
    .run()

  return json({ ok: true })
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

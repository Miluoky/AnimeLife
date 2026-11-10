/**
 * Комнаты «Вместе» на D1. Живые обновления на клиенте — короткий polling (без Appwrite Realtime).
 */

import { err, json, userFromRequest } from './auth.js'
import { randomId } from './crypto.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REACTIONS = new Set(['❤️', '😂', '😮', '😭', '🔥', '👏'])
const MAX_MESSAGE = 300
const ROOM_TTL = 6 * 3600 * 1000

function code() {
  let s = ''
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  for (const b of a) s += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return s
}

function parseState(row) {
  let state = {}
  try {
    state = JSON.parse(row.state || '{}')
  } catch {
    state = {}
  }
  return {
    $id: row.code,
    hostId: row.host_id,
    hostName: state.hostName || '',
    animeId: row.anime_id || state.animeId || '',
    animeTitle: row.title || state.animeTitle || 'Аниме',
    poster: state.poster || '',
    episode: row.episode ?? state.episode ?? 1,
    source: state.source || 'trailer',
    videoId: state.videoId || '',
    title: state.roomTitle || '',
    public: !!state.public,
    controlAll: !!state.controlAll,
    playing: !!state.playing,
    position: Number(state.position) || 0,
    at: Number(state.at) || row.updated_at,
    lastActive: row.updated_at,
    actor: state.actor || '',
    startsAt: state.startsAt ?? null,
  }
}

function packState(room) {
  return JSON.stringify({
    hostName: room.hostName,
    animeId: room.animeId,
    animeTitle: room.animeTitle,
    poster: room.poster,
    episode: room.episode,
    source: room.source,
    videoId: room.videoId,
    roomTitle: room.title,
    public: room.public,
    controlAll: room.controlAll,
    playing: room.playing,
    position: room.position,
    at: room.at,
    actor: room.actor,
    startsAt: room.startsAt ?? null,
  })
}

async function getRow(env, roomId) {
  const codeId = String(roomId || '').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(codeId)) return null
  return env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(codeId).first()
}

export async function handleRoomsGet(request, env, path) {
  const url = new URL(request.url)
  if (path === '/rooms' && request.method === 'GET') {
    const since = Date.now() - 30 * 60 * 1000
    const res = await env.DB.prepare('SELECT * FROM rooms WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 40')
      .bind(since)
      .all()
    const rooms = (res.results || []).map(parseState).filter((r) => r.public)
    return json({ rooms: rooms.slice(0, 30) })
  }

  if (path === '/rooms/upcoming' && request.method === 'GET') {
    const now = Date.now()
    const res = await env.DB.prepare('SELECT * FROM rooms WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 40')
      .bind(now - 14 * 24 * 3600 * 1000)
      .all()
    const rooms = (res.results || [])
      .map(parseState)
      .filter((r) => r.public && r.startsAt && r.startsAt > now)
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 12)
    return json({ rooms })
  }

  if (path.startsWith('/rooms/') && request.method === 'GET') {
    const parts = path.split('/')
    const roomId = parts[2]
    if (parts[3] === 'messages') {
      const res = await env.DB.prepare(
        'SELECT * FROM messages WHERE room_code = ? ORDER BY created_at DESC LIMIT 60',
      )
        .bind(roomId.toUpperCase())
        .all()
      const messages = (res.results || [])
        .map((m) => {
          let extra = {}
          try {
            extra = JSON.parse(m.text.startsWith('{') ? m.text : '{}')
          } catch {
            extra = {}
          }
          // text column: либо plain, либо JSON {kind,text,t}
          if (m.text.startsWith('{')) {
            return {
              $id: m.id,
              roomId: m.room_code,
              userId: m.user_id,
              name: m.author_name,
              text: extra.text || '',
              kind: extra.kind || 'chat',
              t: Number(extra.t) || 0,
              at: m.created_at,
            }
          }
          return {
            $id: m.id,
            roomId: m.room_code,
            userId: m.user_id,
            name: m.author_name,
            text: m.text,
            kind: 'chat',
            t: 0,
            at: m.created_at,
          }
        })
        .reverse()
      return json({ messages })
    }

    const row = await getRow(env, roomId)
    if (!row) return err('Комната не найдена', 404)
    return json({ room: parseState(row), serverNow: Date.now() })
  }

  return null
}

export async function handleRoomAction(env, session, body) {
  const action = body.action

  if (action === 'room-create') {
    if (!session) return err('Войдите, чтобы создать комнату.', 401)
    if (!/^\d{1,10}$/.test(String(body.animeId ?? ''))) return err('Неизвестный тайтл.', 400)
    const now = Date.now()
    const room = {
      hostId: session.user.$id,
      hostName: (session.user.name || 'Зритель').slice(0, 64),
      animeId: String(body.animeId),
      animeTitle: String(body.animeTitle || 'Аниме').slice(0, 255),
      poster: String(body.poster || '').slice(0, 512),
      episode: Math.max(1, Math.floor(Number(body.episode) || 1)),
      source: body.source === 'file' ? 'file' : 'trailer',
      videoId: String(body.videoId || '').slice(0, 20),
      title: String(body.title || '').slice(0, 80),
      public: !!body.public,
      controlAll: !!body.controlAll,
      playing: false,
      position: 0,
      at: now,
      actor: (session.user.name || 'Зритель').slice(0, 64),
      startsAt: body.startsAt != null ? Number(body.startsAt) : null,
    }
    // Одна комната на ведущего.
    await env.DB.prepare('DELETE FROM rooms WHERE host_id = ?').bind(session.user.$id).run()
    let roomCode
    for (let i = 0; i < 8; i++) {
      const c = code()
      const exists = await env.DB.prepare('SELECT code FROM rooms WHERE code = ?').bind(c).first()
      if (exists) continue
      roomCode = c
      await env.DB.prepare(
        `INSERT INTO rooms (code, host_id, anime_id, title, episode, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(c, room.hostId, room.animeId, room.animeTitle, room.episode, packState(room), now, now)
        .run()
      break
    }
    if (!roomCode) return err('Не удалось создать комнату', 500)
    return json({ room: { ...room, $id: roomCode, lastActive: now }, serverNow: Date.now() })
  }

  if (action === 'room-control') {
    if (!session) return err('Войдите.', 401)
    const row = await getRow(env, body.roomId)
    if (!row) return err('Комната не найдена.', 404)
    const room = parseState(row)
    if (room.hostId !== session.user.$id && !room.controlAll) {
      return err('Управляет только ведущий комнаты.', 403)
    }
    const now = Date.now()
    const at = Number(body.at)
    room.playing = !!body.playing
    room.position = Math.max(0, Number(body.position) || 0)
    room.at = Number.isFinite(at) && at <= now + 1000 && at >= now - 10_000 ? Math.round(at) : now
    room.actor = (session.user.name || 'Зритель').slice(0, 64)
    if (body.episode != null) room.episode = Math.max(1, Math.floor(Number(body.episode)))
    if (body.source === 'file' || body.source === 'trailer') room.source = body.source
    if (body.videoId != null) room.videoId = String(body.videoId).slice(0, 20)
    if (body.controlAll != null) room.controlAll = !!body.controlAll
    if (body.public != null) room.public = !!body.public
    if (body.title != null) room.title = String(body.title).slice(0, 80)
    if (body.startsAt !== undefined) room.startsAt = body.startsAt == null ? null : Number(body.startsAt)
    await env.DB.prepare('UPDATE rooms SET episode = ?, state = ?, updated_at = ? WHERE code = ?')
      .bind(room.episode, packState(room), now, room.$id)
      .run()
    return json({ serverNow: Date.now(), room })
  }

  if (action === 'room-message') {
    if (!session) return err('Войдите.', 401)
    const row = await getRow(env, body.roomId)
    if (!row) return err('Комната не найдена.', 404)
    const kind = body.kind === 'reaction' ? 'reaction' : 'chat'
    let text = String(body.text || '').trim().slice(0, MAX_MESSAGE)
    if (kind === 'reaction' && !REACTIONS.has(text)) return err('Неизвестная реакция.', 400)
    if (kind === 'chat' && text.length < 1) return err('Пустое сообщение.', 400)
    const id = randomId(12)
    const now = Date.now()
    const payload = JSON.stringify({ kind, text, t: Number(body.t) || 0 })
    await env.DB.prepare(
      `INSERT INTO messages (id, room_code, user_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, row.code, session.user.$id, (session.user.name || 'Зритель').slice(0, 64), payload, now)
      .run()
    await env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE code = ?').bind(now, row.code).run()
    return json({
      message: {
        $id: id,
        roomId: row.code,
        userId: session.user.$id,
        name: (session.user.name || 'Зритель').slice(0, 64),
        text,
        kind,
        t: Number(body.t) || 0,
        at: now,
      },
    })
  }

  if (action === 'room-message-delete') {
    if (!session) return err('Войдите.', 401)
    const messageId = String(body.messageId || '')
    const msg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first()
    if (!msg) return err('Не найдено.', 404)
    const room = await getRow(env, msg.room_code)
    const admin = (session.user.labels || []).includes('admin')
    if (msg.user_id !== session.user.$id && room?.host_id !== session.user.$id && !admin) {
      return err('Нет прав.', 403)
    }
    await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(messageId).run()
    return json({ ok: true })
  }

  if (action === 'room-close') {
    if (!session) return err('Войдите.', 401)
    const row = await getRow(env, body.roomId)
    if (!row) return err('Комната не найдена.', 404)
    if (row.host_id !== session.user.$id && !(session.user.labels || []).includes('admin')) {
      return err('Закрыть может только ведущий.', 403)
    }
    await env.DB.prepare('DELETE FROM messages WHERE room_code = ?').bind(row.code).run()
    await env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(row.code).run()
    return json({ ok: true })
  }

  if (action === 'room-presence' || action === 'room-signal') {
    // Голос/presence — позже на Durable Objects; пока no-op, чтобы клиент не падал.
    return json({ ok: true })
  }

  if (action === 'rooms-cleanup') {
    const cut = Date.now() - ROOM_TTL
    await env.DB.prepare('DELETE FROM messages WHERE created_at < ?').bind(Date.now() - 24 * 3600 * 1000).run()
    await env.DB.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(cut).run()
    return json({ ok: true })
  }

  return null
}

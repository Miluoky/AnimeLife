import { randomInt } from 'node:crypto'
import { DB, UserError, hash, listRows } from './util.js'

/**
 * Совместный просмотр: комнаты и чат.
 *
 *   room-create {animeId, animeTitle, poster, episode, source, videoId, title, public, controlAll}
 *       создать комнату (у одного человека одна комната: старая закрывается);
 *   room-control {roomId, playing, position, episode?, source?, videoId?, controlAll?, public?, title?, startsAt?}
 *       плей, пауза, перемотка, смена серии. Управляет ведущий или все, если он разрешил;
 *   room-message {roomId, kind: chat|reaction, text, t}  сообщение или реакция в чат;
 *   room-message-delete {messageId}  убрать сообщение (ведущий комнаты или модератор);
 *   room-presence {roomId, voice?, muted?, leave?}  «я в комнате» раз в 45 секунд, флаги голосового чата;
 *   room-signal {roomId, to, kind: offer|answer|bye, data}  сигналы WebRTC для голоса: строку видит только адресат;
 *   room-close {roomId}  закрыть комнату (только ведущий);
 *   room-time  время сервера, чтобы все устройства считали позицию видео одинаково.
 *
 * Состояние комнаты (playing, position, at) хранится в строке rooms. Сайт подписан на неё через
 * Appwrite Realtime и сам досчитывает позицию: position + (сейчас − at), если видео идёт.
 * Читать комнаты и чат может кто угодно по коду, писать только через функцию от имени вошедшего.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REACTIONS = ['❤️', '😂', '😮', '😭', '🔥', '👏']
const MAX_MESSAGE = 300
/** Не больше стольких сообщений от одного человека за 10 секунд. */
const MESSAGES_PER_10S = 5
/** Комната без действий дольше этого закрывается автоматически. */
const ROOM_TTL = 6 * 3600 * 1000
const MESSAGE_TTL = 24 * 3600 * 1000
/** Зритель считается в комнате, если отмечался за последние 2 минуты. */
const MEMBER_TTL = 2 * 60 * 1000
/** Не больше стольких человек в голосовом чате: голос идёт напрямую между браузерами (mesh). */
export const VOICE_LIMIT = 6
const MAX_SIGNAL = 20000

async function signedIn(api, req, what) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError(`Войдите, чтобы ${what}.`)
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

const displayName = (user) => (user.name || 'Зритель').slice(0, 64)

function checkCode(code) {
  const c = String(code ?? '').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(c)) throw new UserError('Комната не найдена.')
  return c
}

async function getRoom(api, code) {
  const row = await api('GET', `${DB}/rooms/rows/${checkCode(code)}`)
  if (row.status === 404) throw new UserError('Комната не найдена или уже закрыта.')
  return row.json
}

const text = (v, max) => String(v ?? '').trim().slice(0, max)

function playback(body) {
  const position = Number(body.position)
  if (!Number.isFinite(position) || position < 0 || position > 24 * 3600) throw new UserError('Неверная позиция видео.')
  return { playing: Boolean(body.playing), position }
}

function source(body, data) {
  if (body.episode != null) {
    const episode = Number(body.episode)
    if (!Number.isInteger(episode) || episode < 1 || episode > 5000) throw new UserError('Неверный номер серии.')
    data.episode = episode
  }
  if (body.source != null) {
    if (!['trailer', 'file'].includes(body.source)) throw new UserError('Неизвестный источник видео.')
    data.source = body.source
  }
  if (body.videoId != null) {
    const videoId = String(body.videoId)
    if (videoId && !/^[\w-]{6,20}$/.test(videoId)) throw new UserError('Неверное видео.')
    data.videoId = videoId
  }
  return data
}

/** Сеанс по расписанию: не раньше чем через 5 минут и не позже чем через 2 недели. */
function startsAt(value, now) {
  if (value == null || value === '') return null
  const t = Number(value)
  if (!Number.isFinite(t) || t < now + 5 * 60 * 1000 || t > now + 14 * 24 * 3600 * 1000)
    throw new UserError('Время сеанса: от 5 минут до 2 недель вперёд.')
  return t
}

export async function roomCreate(api, req, body) {
  const user = await signedIn(api, req, 'создать комнату')
  if (!/^\d{1,10}$/.test(String(body.animeId ?? ''))) throw new UserError('Неизвестный тайтл.')
  const poster = text(body.poster, 512)
  const now = Date.now()
  const data = source(
    { episode: 1, source: 'trailer', videoId: '', ...body },
    {
      hostId: user.$id,
      hostName: displayName(user),
      animeId: String(body.animeId),
      animeTitle: text(body.animeTitle, 255) || 'Аниме',
      poster: /^https:\/\/[\w.-]*shikimori\.(io|one|me)\//.test(poster) ? poster : '',
      title: text(body.title, 80),
      public: Boolean(body.public),
      controlAll: Boolean(body.controlAll),
      playing: false,
      position: 0,
      at: now,
      lastActive: now,
      viewers: 0,
      actor: displayName(user),
      startsAt: startsAt(body.startsAt, now),
    },
  )
  // Одна комната на человека: прошлую закрываем, чтобы список не засорялся.
  for (const old of await listRows(api, 'rooms', [
    { method: 'equal', attribute: 'hostId', values: [user.$id] },
    { method: 'limit', values: [10] },
  ])) {
    await api('DELETE', `${DB}/rooms/rows/${old.$id}`)
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    const exists = await api('GET', `${DB}/rooms/rows/${code}`)
    if (exists.status !== 404) continue
    const row = await api('PUT', `${DB}/rooms/rows/${code}`, { data })
    return { room: row.json, serverNow: Date.now() }
  }
  throw new Error('no free room code')
}

export async function roomControl(api, req, body) {
  const user = await signedIn(api, req, 'управлять просмотром')
  const room = await getRoom(api, body.roomId)
  if (room.hostId !== user.$id && !room.controlAll) throw new UserError('Управляет только ведущий комнаты.')
  const now = Date.now()
  const data = source(body, { ...playback(body), at: now, lastActive: now, actor: displayName(user) })
  // Настройки комнаты (кто управляет, открыта ли она всем, название) меняет только ведущий.
  if (room.hostId === user.$id) {
    if (body.controlAll != null) data.controlAll = Boolean(body.controlAll)
    if (body.public != null) data.public = Boolean(body.public)
    if (body.title != null) data.title = text(body.title, 80)
    if (body.startsAt !== undefined) data.startsAt = startsAt(body.startsAt, now)
  }
  await api('PATCH', `${DB}/rooms/rows/${room.$id}`, { data })
  return { ok: true, serverNow: Date.now() }
}

export async function roomMessage(api, req, body) {
  const user = await signedIn(api, req, 'писать в чат')
  const room = await getRoom(api, body.roomId)
  const kind = body.kind === 'reaction' ? 'reaction' : 'chat'
  const message = text(body.text, MAX_MESSAGE).replace(/\s+/g, ' ')
  if (kind === 'reaction' ? !REACTIONS.includes(message) : !message) throw new UserError('Пустое сообщение.')
  const now = Date.now()
  const recent = await listRows(api, 'messages', [
    { method: 'equal', attribute: 'roomId', values: [room.$id] },
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'greaterThan', attribute: 'at', values: [now - 10_000] },
    { method: 'limit', values: [MESSAGES_PER_10S] },
  ])
  if (recent.length >= MESSAGES_PER_10S) throw new UserError('Не так быстро: подождите пару секунд.')
  const t = Number(body.t)
  const row = await api('POST', `${DB}/messages/rows`, {
    rowId: 'unique()',
    data: {
      roomId: room.$id,
      userId: user.$id,
      name: displayName(user),
      text: message,
      kind,
      t: Number.isFinite(t) && t >= 0 ? t : 0,
      at: now,
    },
  })
  // Отмечаем, что в комнате кто-то есть, но не чаще раза в минуту.
  if (now - (room.lastActive ?? 0) > 60_000) {
    await api('PATCH', `${DB}/rooms/rows/${room.$id}`, { data: { lastActive: now } })
  }
  return { message: row.json }
}

export async function roomClose(api, req, body) {
  const user = await signedIn(api, req, 'закрыть комнату')
  const room = await getRoom(api, body.roomId)
  if (room.hostId !== user.$id) throw new UserError('Закрыть комнату может только ведущий.')
  await api('DELETE', `${DB}/rooms/rows/${room.$id}`)
  const members = await listRows(api, 'members', [
    { method: 'equal', attribute: 'roomId', values: [room.$id] },
    { method: 'limit', values: [100] },
  ])
  await Promise.all(members.map((m) => api('DELETE', `${DB}/members/rows/${m.$id}`)))
  return { ok: true }
}

export async function roomMessageDelete(api, req, body) {
  const user = await signedIn(api, req, 'управлять чатом')
  if (!/^[a-zA-Z0-9]{1,36}$/.test(String(body.messageId ?? ''))) throw new UserError('Сообщение не найдено.')
  const msg = await api('GET', `${DB}/messages/rows/${body.messageId}`)
  if (msg.status === 404) return { ok: true }
  const room = await api('GET', `${DB}/rooms/rows/${msg.json.roomId}`)
  const isAdmin = (user.labels ?? []).includes('admin')
  const isHost = room.status !== 404 && room.json.hostId === user.$id
  if (!isAdmin && !isHost && msg.json.userId !== user.$id) throw new UserError('Убрать сообщение может ведущий.')
  await api('DELETE', `${DB}/messages/rows/${body.messageId}`)
  return { ok: true }
}

const memberId = (roomId, userId) => 'm' + hash(`${roomId}:${userId}`)

export async function roomPresence(api, req, body) {
  const user = await signedIn(api, req, 'войти в комнату')
  const room = await getRoom(api, body.roomId)
  const id = memberId(room.$id, user.$id)
  if (body.leave) {
    await api('DELETE', `${DB}/members/rows/${id}`)
    return { ok: true, serverNow: Date.now() }
  }
  const now = Date.now()
  const voice = Boolean(body.voice)
  if (voice) {
    const inVoice = await listRows(api, 'members', [
      { method: 'equal', attribute: 'roomId', values: [room.$id] },
      { method: 'equal', attribute: 'voice', values: [true] },
      { method: 'greaterThan', attribute: 'at', values: [now - MEMBER_TTL] },
      { method: 'limit', values: [VOICE_LIMIT + 1] },
    ])
    if (inVoice.filter((m) => m.userId !== user.$id).length >= VOICE_LIMIT)
      throw new UserError(`В голосовом чате уже ${VOICE_LIMIT} человек. Можно писать в чат.`)
  }
  await api('PUT', `${DB}/members/rows/${id}`, {
    data: { roomId: room.$id, userId: user.$id, name: displayName(user), voice, muted: Boolean(body.muted), at: now },
  })
  if (now - (room.lastActive ?? 0) > 60_000) {
    await api('PATCH', `${DB}/rooms/rows/${room.$id}`, { data: { lastActive: now } })
  }
  return { ok: true, serverNow: Date.now() }
}

export async function roomSignal(api, req, body) {
  const user = await signedIn(api, req, 'говорить в комнате')
  const room = await getRoom(api, body.roomId)
  if (!['offer', 'answer', 'bye'].includes(body.kind)) throw new UserError('Неизвестный сигнал.')
  const self = await api('GET', `${DB}/members/rows/${memberId(room.$id, user.$id)}`)
  if (self.status === 404 || !self.json.voice) throw new UserError('Сначала войдите в голосовой чат.')
  const to = String(body.to ?? '')
  const target = await api('GET', `${DB}/members/rows/${memberId(room.$id, to)}`)
  if (target.status === 404 || !target.json.voice) throw new UserError('Собеседник уже вышел из голосового чата.')
  const data = String(body.data ?? '')
  if (data.length > MAX_SIGNAL) throw new UserError('Слишком длинный сигнал.')
  // Описание соединения содержит IP-адреса, поэтому строку может прочитать только адресат.
  await api('POST', `${DB}/signals/rows`, {
    rowId: 'unique()',
    data: { roomId: room.$id, from: user.$id, to, kind: body.kind, data, at: Date.now() },
    permissions: [`read("user:${to}")`],
  })
  return { ok: true }
}

/** По расписанию: убираем заброшенные комнаты и старые сообщения. */
export async function cleanRooms(api) {
  const now = Date.now()
  let rooms = 0
  let messages = 0
  for (let i = 0; i < 10; i++) {
    const stale = await listRows(api, 'rooms', [
      { method: 'lessThan', attribute: 'lastActive', values: [now - ROOM_TTL] },
      { method: 'limit', values: [50] },
      { method: 'offset', values: [i * 50 - rooms] },
    ])
    // Комнату с сеансом по расписанию не трогаем, пока сеанс не прошёл.
    const old = stale.filter((r) => !(r.startsAt && r.startsAt > now - 3600 * 1000))
    await Promise.all(old.map((r) => api('DELETE', `${DB}/rooms/rows/${r.$id}`)))
    rooms += old.length
    if (stale.length < 50) break
  }
  for (let i = 0; i < 10; i++) {
    const old = await listRows(api, 'messages', [
      { method: 'lessThan', attribute: 'at', values: [now - MESSAGE_TTL] },
      { method: 'limit', values: [100] },
    ])
    await Promise.all(old.map((r) => api('DELETE', `${DB}/messages/rows/${r.$id}`)))
    messages += old.length
    if (old.length < 100) break
  }
  // Отметки присутствия и сигналы голоса живут недолго.
  for (const [table, ttl] of [
    ['members', 3600 * 1000],
    ['signals', 10 * 60 * 1000],
  ]) {
    for (let i = 0; i < 10; i++) {
      const old = await listRows(api, table, [
        { method: 'lessThan', attribute: 'at', values: [now - ttl] },
        { method: 'limit', values: [100] },
      ])
      await Promise.all(old.map((r) => api('DELETE', `${DB}/${table}/rows/${r.$id}`)))
      if (old.length < 100) break
    }
  }
  return { rooms, messages }
}

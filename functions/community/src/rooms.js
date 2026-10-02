import { randomInt } from 'node:crypto'
import { DB, UserError, listRows } from './util.js'

/**
 * Совместный просмотр: комнаты и чат.
 *
 *   room-create {animeId, animeTitle, poster, episode, source, videoId, title, public, controlAll}
 *       создать комнату (у одного человека одна комната: старая закрывается);
 *   room-control {roomId, playing, position, episode?, source?, videoId?, controlAll?, public?, title?}
 *       плей, пауза, перемотка, смена серии. Управляет ведущий или все, если он разрешил;
 *   room-message {roomId, kind: chat|reaction, text, t}  сообщение или реакция в чат;
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
  return { ok: true }
}

/** По расписанию: убираем заброшенные комнаты и старые сообщения. */
export async function cleanRooms(api) {
  const now = Date.now()
  let rooms = 0
  let messages = 0
  for (let i = 0; i < 10; i++) {
    const old = await listRows(api, 'rooms', [
      { method: 'lessThan', attribute: 'lastActive', values: [now - ROOM_TTL] },
      { method: 'limit', values: [50] },
    ])
    await Promise.all(old.map((r) => api('DELETE', `${DB}/rooms/rows/${r.$id}`)))
    rooms += old.length
    if (old.length < 50) break
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
  return { rooms, messages }
}

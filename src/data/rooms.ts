import { Query } from 'appwrite'
import { COMMUNITY_DB, client, tablesDB } from '../api/appwrite'
import { callCommunity } from './community'

/** Комната совместного просмотра. Код комнаты (6 символов) и есть ID строки. */
export interface Room {
  $id: string
  hostId: string
  hostName: string
  animeId: string
  animeTitle: string
  poster?: string
  episode: number
  source: 'trailer' | 'file'
  videoId?: string
  title?: string
  public: boolean
  controlAll: boolean
  playing: boolean
  /** позиция видео в секундах на момент at */
  position: number
  /** время сервера (мс), когда сохранили position */
  at: number
  lastActive: number
  /** кто последним нажал плей, паузу или перемотал */
  actor?: string
  /** сеанс по расписанию: время начала (мс) */
  startsAt?: number | null
}

export interface RoomMessage {
  $id: string
  roomId: string
  userId: string
  name: string
  text: string
  kind: 'chat' | 'reaction'
  /** таймкод видео, на котором написали */
  t: number
  at: number
}

export const REACTIONS = ['❤️', '😂', '😮', '😭', '🔥', '👏']

// --- Общие часы ---
// Позицию видео все считают по одним часам: у телефонов и компьютеров время расходится на секунды.
// Часы берём у Worker сайта (/api/time): узел Cloudflare рядом, ответ за миллисекунды, и ошибка
// (половина времени ответа) почти нулевая. Без Worker (локальная разработка) — у функции Appwrite.

let offset = 0
let bestRtt = Infinity

function noteServerTime(serverNow: number | undefined, sentAt: number, receivedAt = Date.now()) {
  if (!serverNow) return
  const rtt = receivedAt - sentAt
  // Самый быстрый ответ точнее всего: задержка сети меньше всего искажает время.
  if (rtt <= bestRtt) {
    bestRtt = rtt
    offset = serverNow - (sentAt + rtt / 2)
  }
}

export const serverNow = () => Date.now() + offset

async function edgeTime() {
  const sentAt = Date.now()
  const res = await fetch('/api/time', { cache: 'no-store' })
  const receivedAt = Date.now()
  const { now } = (await res.json()) as { now?: number }
  if (typeof now !== 'number') throw new Error('no time')
  noteServerTime(now, sentAt, receivedAt)
}

let clockSynced: Promise<void> | undefined

/** Сверяем часы несколько раз и берём самый быстрый ответ. Повторный вызов ждёт ту же сверку. */
export function syncClock(samples = 5) {
  clockSynced ??= (async () => {
    try {
      for (let i = 0; i < samples; i++) await edgeTime()
    } catch {
      for (let i = 0; i < Math.min(samples, 3); i++) {
        const sentAt = Date.now()
        const reply = await callCommunity<{ serverNow: number }>({ action: 'room-time' }).catch(() => undefined)
        noteServerTime(reply?.serverNow, sentAt)
      }
    }
  })()
  return clockSynced
}

/** Где сейчас должно быть видео комнаты, в секундах. */
export const roomPosition = (room: Pick<Room, 'playing' | 'position' | 'at'>) =>
  room.position + (room.playing ? Math.max(0, serverNow() - room.at) / 1000 : 0)

// --- Действия ---

export interface NewRoom {
  animeId: string
  animeTitle: string
  poster?: string
  episode: number
  source: Room['source']
  videoId?: string
  title?: string
  public?: boolean
  controlAll?: boolean
}

export const createRoom = (room: NewRoom) =>
  callCommunity<{ room: Room }>({ action: 'room-create', ...room }).then((r) => r.room)

export const controlRoom = (
  roomId: string,
  state: {
    playing: boolean
    position: number
    episode?: number
    source?: Room['source']
    videoId?: string
    controlAll?: boolean
    public?: boolean
    title?: string
    startsAt?: number | null
    /** когда нажали, по общим часам (serverNow): от этого момента все считают позицию видео */
    at?: number
  },
) => callCommunity<{ serverNow: number }>({ action: 'room-control', roomId, ...state })

export const sendRoomMessage = (roomId: string, kind: RoomMessage['kind'], text: string, t: number) =>
  callCommunity<{ message: RoomMessage }>({ action: 'room-message', roomId, kind, text, t }).then((r) => r.message)

export const deleteRoomMessage = (messageId: string) => callCommunity({ action: 'room-message-delete', messageId })

export const closeRoom = (roomId: string) => callCommunity({ action: 'room-close', roomId })

// --- Чтение и подписка ---

export async function loadRoom(code: string): Promise<Room | null> {
  try {
    return (await tablesDB.getRow({ databaseId: COMMUNITY_DB, tableId: 'rooms', rowId: code })) as unknown as Room
  } catch {
    return null
  }
}

export async function loadMessages(roomId: string): Promise<RoomMessage[]> {
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'messages',
    queries: [Query.equal('roomId', roomId), Query.orderDesc('at'), Query.limit(60)],
  })
  return (res.rows as unknown as RoomMessage[]).reverse()
}

/** Открытые комнаты для вкладки «Вместе»: живые за последние полчаса. */
export async function loadPublicRooms(): Promise<Room[]> {
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'rooms',
    queries: [
      Query.equal('public', true),
      Query.greaterThan('lastActive', serverNow() - 30 * 60 * 1000),
      Query.orderDesc('lastActive'),
      Query.limit(30),
    ],
  })
  return res.rows as unknown as Room[]
}

/** Открытые сеансы по расписанию, ближайшие первыми. */
export async function loadUpcomingRooms(): Promise<Room[]> {
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'rooms',
    queries: [
      Query.equal('public', true),
      Query.greaterThan('startsAt', serverNow()),
      Query.orderAsc('startsAt'),
      Query.limit(12),
    ],
  })
  return res.rows as unknown as Room[]
}

/**
 * Живые обновления комнаты через Appwrite Realtime (WebSocket).
 * onRoom(null) значит, что комнату закрыли.
 */
export function subscribeRoom(
  code: string,
  handlers: {
    onRoom: (room: Room | null) => void
    onMessage: (m: RoomMessage) => void
    onMessageGone?: (id: string) => void
  },
) {
  const roomChannel = `databases.${COMMUNITY_DB}.tables.rooms.rows.${code}`
  const messagesChannel = `databases.${COMMUNITY_DB}.tables.messages.rows`
  return client.subscribe<Room | RoomMessage>([roomChannel, messagesChannel], (e) => {
    const deleted = e.events.some((ev) => ev.endsWith('.delete'))
    const isRoom = e.events.some((ev) => ev.includes('.rooms.'))
    if (isRoom) {
      if ((e.payload as Room).$id === code) handlers.onRoom(deleted ? null : (e.payload as Room))
    } else if ((e.payload as RoomMessage).roomId === code) {
      if (deleted) handlers.onMessageGone?.((e.payload as RoomMessage).$id)
      else handlers.onMessage(e.payload as RoomMessage)
    }
  })
}

/** ID ролика YouTube из адреса трейлера Shikimori. */
export const youtubeId = (url?: string) => url?.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{6,20})/)?.[1]

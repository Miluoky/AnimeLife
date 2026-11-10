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
let offset = 0
let bestRtt = Infinity

function noteServerTime(serverNow: number | undefined, sentAt: number, receivedAt = Date.now()) {
  if (!serverNow) return
  const rtt = receivedAt - sentAt
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

/** Сверяем часы. Один запрос к Worker; второй только при RTT > 80 мс. */
export function syncClock(samples = 1) {
  clockSynced ??= (async () => {
    try {
      await edgeTime()
      if (samples > 1 && bestRtt > 80) await edgeTime()
    } catch {
      const sentAt = Date.now()
      const reply = await callCommunity<{ serverNow: number }>({ action: 'room-time' }).catch(() => undefined)
      noteServerTime(reply?.serverNow, sentAt)
    }
  })()
  return clockSynced
}

export const roomPosition = (room: Pick<Room, 'playing' | 'position' | 'at'>) =>
  room.position + (room.playing ? Math.max(0, serverNow() - room.at) / 1000 : 0)

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
    at?: number
  },
) => callCommunity<{ serverNow: number }>({ action: 'room-control', roomId, ...state })

export const sendRoomMessage = (roomId: string, kind: RoomMessage['kind'], text: string, t: number) =>
  callCommunity<{ message: RoomMessage }>({ action: 'room-message', roomId, kind, text, t }).then((r) => r.message)

export const deleteRoomMessage = (messageId: string) => callCommunity({ action: 'room-message-delete', messageId })

export const closeRoom = (roomId: string) => callCommunity({ action: 'room-close', roomId })

export async function loadRoom(code: string): Promise<Room | null> {
  const res = await fetch(`/api/core/rooms/${encodeURIComponent(code)}`, { credentials: 'include' })
  if (!res.ok) return null
  const data = (await res.json()) as { room: Room; serverNow?: number }
  if (typeof data.serverNow === 'number') noteServerTime(data.serverNow, Date.now(), Date.now())
  return data.room
}

export async function loadMessages(roomId: string): Promise<RoomMessage[]> {
  const res = await fetch(`/api/core/rooms/${encodeURIComponent(roomId)}/messages`, { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as { messages: RoomMessage[] }
  return data.messages ?? []
}

export async function loadPublicRooms(): Promise<Room[]> {
  const res = await fetch('/api/core/rooms', { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { rooms: Room[] }).rooms ?? []
}

export async function loadUpcomingRooms(): Promise<Room[]> {
  const res = await fetch('/api/core/rooms/upcoming', { credentials: 'include' })
  if (!res.ok) return []
  return ((await res.json()) as { rooms: Room[] }).rooms ?? []
}

/**
 * Живые обновления: polling раз в 2.5 с.
 * onRoom(null) — комнату закрыли.
 */
export function subscribeRoom(
  code: string,
  handlers: {
    onRoom: (room: Room | null) => void
    onMessage: (m: RoomMessage) => void
    onMessageGone?: (id: string) => void
  },
) {
  void handlers.onMessageGone
  let stopped = false
  let lastSig = ''
  const seen = new Set<string>()
  let primed = false
  const tick = async () => {
    if (stopped) return
    try {
      const [room, messages] = await Promise.all([loadRoom(code), loadMessages(code)])
      if (stopped) return
      if (!room) {
        handlers.onRoom(null)
        return
      }
      const sig = `${room.at}|${room.playing}|${room.position}|${room.episode}|${room.lastActive}`
      if (sig !== lastSig) {
        lastSig = sig
        handlers.onRoom(room)
      }
      if (!primed) {
        for (const m of messages) seen.add(m.$id)
        primed = true
        return
      }
      for (const m of messages) {
        if (seen.has(m.$id)) continue
        seen.add(m.$id)
        handlers.onMessage(m)
      }
    } catch {
      // сеть — следующий тик
    }
  }
  void tick()
  const timer = window.setInterval(tick, 2500)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

export const youtubeId = (url?: string) => url?.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{6,20})/)?.[1]

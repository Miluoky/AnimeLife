/**
 * WebSocket комнаты через Durable Object (binding ROOMS).
 * Если DO нет (Workers Free) — сервер отвечает 501, клиент остаётся на polling.
 */

export type RoomWsMember = {
  userId: string
  name: string
  voice: boolean
  muted: boolean
  at: number
}

export type RoomWsHandlers = {
  onMembers?: (members: RoomWsMember[], serverNow: number) => void
  onSignal?: (s: { from: string; to: string; kind: string; data: string; at: number }) => void
  onError?: (message: string) => void
  onClose?: () => void
}

/** Вкл. по умолчанию; выключить: VITE_ROOMS_WS=0 */
export const roomsWsWanted = () => (import.meta.env.VITE_ROOMS_WS ?? '1') !== '0'

export function connectRoomWs(roomId: string, handlers: RoomWsHandlers): { close: () => void; send: (obj: object) => void } | null {
  if (!roomsWsWanted() || typeof WebSocket === 'undefined') return null

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${proto}://${location.host}/api/core/rooms/${encodeURIComponent(roomId)}/ws`
  let ws: WebSocket
  try {
    ws = new WebSocket(url)
  } catch {
    return null
  }

  let closed = false
  const send = (obj: object) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(obj))
    } catch {
      // ignore
    }
  }

  ws.addEventListener('message', (ev) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(ev.data)) as Record<string, unknown>
    } catch {
      return
    }
    const type = String(msg.type || '')
    if (type === 'hello-ok' || type === 'members' || type === 'pong') {
      handlers.onMembers?.((msg.members as RoomWsMember[]) || [], Number(msg.serverNow) || Date.now())
      return
    }
    if (type === 'signal') {
      handlers.onSignal?.({
        from: String(msg.from || ''),
        to: String(msg.to || ''),
        kind: String(msg.kind || ''),
        data: String(msg.data || ''),
        at: Number(msg.at) || Date.now(),
      })
      return
    }
    if (type === 'error') handlers.onError?.(String(msg.message || 'Ошибка комнаты'))
  })

  ws.addEventListener('close', () => {
    closed = true
    handlers.onClose?.()
  })
  ws.addEventListener('error', () => {
    // close handler follows
  })

  const ping = window.setInterval(() => send({ type: 'ping' }), 20_000)

  return {
    send,
    close: () => {
      closed = true
      window.clearInterval(ping)
      try {
        ws.close()
      } catch {
        // ignore
      }
    },
  }
}

/**
 * Durable Object одной комнаты «Вместе»: WebSocket fan-out для presence и WebRTC-сигналов.
 * Без binding ROOMS клиент остаётся на D1 + polling (Free plan).
 *
 * Протокол (JSON):
 *   → { type: 'hello', name?: string }
 *   → { type: 'presence', voice?: boolean, muted?: boolean, leave?: boolean }
 *   → { type: 'signal', to: userId, kind: 'offer'|'answer'|'bye', data: string }
 *   ← { type: 'hello-ok', userId, members: Member[], serverNow }
 *   ← { type: 'members', members: Member[], serverNow }
 *   ← { type: 'signal', from, to, kind, data, at }
 *   ← { type: 'error', message }
 */

const MEMBER_TTL_MS = 45_000
const MAX_SIGNAL = 12_000
const VOICE_LIMIT = 8
const SIGNAL_KINDS = new Set(['offer', 'answer', 'bye'])

export class RoomDO {
  /** @param {DurableObjectState} ctx */
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    /** @type {Map<WebSocket, { userId: string, name: string, voice: boolean, muted: boolean, at: number }>} */
    this.peers = new Map()
  }

  async fetch(request) {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket only', { status: 426 })
    }

    const userId = String(url.searchParams.get('userId') || '').slice(0, 64)
    const name = String(url.searchParams.get('name') || 'Зритель').slice(0, 64)
    if (!userId) return new Response('userId required', { status: 400 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server, [userId])

    const now = Date.now()
    this.peers.set(server, { userId, name, voice: false, muted: false, at: now })
    server.send(
      JSON.stringify({
        type: 'hello-ok',
        userId,
        members: this.memberList(),
        serverNow: now,
      }),
    )
    this.broadcastMembers()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, message) {
    let msg
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      this.send(ws, { type: 'error', message: 'Неверный JSON.' })
      return
    }

    const peer = this.peers.get(ws)
    if (!peer) {
      this.send(ws, { type: 'error', message: 'Сессия не найдена.' })
      return
    }

    const type = String(msg?.type || '')
    if (type === 'hello' || type === 'ping') {
      peer.at = Date.now()
      if (msg.name) peer.name = String(msg.name).slice(0, 64)
      this.send(ws, { type: 'pong', serverNow: Date.now(), members: this.memberList() })
      return
    }

    if (type === 'presence') {
      peer.at = Date.now()
      if (msg.leave) {
        this.peers.delete(ws)
        try {
          ws.close(1000, 'leave')
        } catch {
          // already closed
        }
        this.broadcastMembers()
        return
      }
      const voice = Boolean(msg.voice)
      if (voice) {
        const others = [...this.peers.values()].filter((p) => p.userId !== peer.userId && p.voice)
        if (others.length >= VOICE_LIMIT) {
          this.send(ws, { type: 'error', message: `В голосовом чате уже ${VOICE_LIMIT} человек.` })
          return
        }
      }
      peer.voice = voice
      peer.muted = Boolean(msg.muted)
      if (msg.name) peer.name = String(msg.name).slice(0, 64)
      this.broadcastMembers()
      return
    }

    if (type === 'signal') {
      peer.at = Date.now()
      if (!peer.voice) {
        this.send(ws, { type: 'error', message: 'Сначала войдите в голосовой чат.' })
        return
      }
      const kind = String(msg.kind || '')
      if (!SIGNAL_KINDS.has(kind)) {
        this.send(ws, { type: 'error', message: 'Неизвестный сигнал.' })
        return
      }
      const to = String(msg.to || '').trim()
      if (!to || to === peer.userId) {
        this.send(ws, { type: 'error', message: 'Некорректный адресат.' })
        return
      }
      const data = String(msg.data ?? '')
      if (data.length > MAX_SIGNAL) {
        this.send(ws, { type: 'error', message: 'Слишком длинный сигнал.' })
        return
      }
      const target = [...this.peers.entries()].find(([, p]) => p.userId === to && p.voice)
      if (!target) {
        this.send(ws, { type: 'error', message: 'Собеседник уже вышел из голосового чата.' })
        return
      }
      this.send(target[0], {
        type: 'signal',
        from: peer.userId,
        to,
        kind,
        data,
        at: Date.now(),
      })
      return
    }

    this.send(ws, { type: 'error', message: 'Неизвестное сообщение.' })
  }

  async webSocketClose(ws) {
    this.peers.delete(ws)
    this.broadcastMembers()
  }

  async webSocketError(ws) {
    this.peers.delete(ws)
    this.broadcastMembers()
  }

  memberList() {
    const now = Date.now()
    const out = []
    for (const [sock, p] of this.peers) {
      if (now - p.at > MEMBER_TTL_MS) {
        this.peers.delete(sock)
        try {
          sock.close(1000, 'stale')
        } catch {
          // ignore
        }
        continue
      }
      out.push({
        userId: p.userId,
        name: p.name,
        voice: p.voice,
        muted: p.muted,
        at: p.at,
      })
    }
    return out
  }

  broadcastMembers() {
    const members = this.memberList()
    const payload = JSON.stringify({ type: 'members', members, serverNow: Date.now() })
    for (const sock of this.peers.keys()) {
      try {
        sock.send(payload)
      } catch {
        this.peers.delete(sock)
      }
    }
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj))
    } catch {
      this.peers.delete(ws)
    }
  }
}

/** Прокси WebSocket в RoomDO после проверки сессии. */
export async function upgradeRoomSocket(request, env, roomCode, session) {
  if (!env.ROOMS) return null
  const code = String(roomCode || '').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) return new Response('bad room', { status: 400 })
  if (!session?.user?.$id) return new Response('auth', { status: 401 })

  const id = env.ROOMS.idFromName(code)
  const stub = env.ROOMS.get(id)
  const url = new URL(request.url)
  url.searchParams.set('userId', session.user.$id)
  url.searchParams.set('name', session.user.name || 'Зритель')
  return stub.fetch(url.toString(), request)
}

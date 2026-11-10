import { BACKEND } from '../api/config'
import { callCommunity } from './community'
import { createLocalStore } from './localStore'
import { serverNow } from './rooms'

/**
 * Голосовой чат комнаты: звук идёт напрямую между браузерами (WebRTC, каждый с каждым, до 6 человек).
 * Сервер нужен только чтобы познакомить браузеры: предложение и ответ с адресами (SDP) передаются
 * через функцию в таблицу signals, строку видит только адресат. Кто зашёл позже, тот и звонит.
 */

export interface Member {
  $id: string
  roomId: string
  userId: string
  name: string
  voice: boolean
  muted: boolean
  at: number
}

interface Signal {
  roomId: string
  from: string
  to: string
  kind: 'offer' | 'answer' | 'bye'
  data: string
  at: number
}

export const MEMBER_TTL = 2 * 60 * 1000
export const PRESENCE_EVERY = 45 * 1000
const CORE_POLL_MS = 2000

const useCore = () => BACKEND === 'core'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
]

/** Текущие флаги голоса: их же повторяет отметка «я в комнате», чтобы не сбросить голос. */
const flags = { voice: false, muted: false }

export const presence = (roomId: string, state: { voice?: boolean; muted?: boolean; leave?: boolean } = {}) => {
  if (state.voice !== undefined) flags.voice = state.voice
  if (state.muted !== undefined) flags.muted = state.muted
  return callCommunity({ action: 'room-presence', roomId, ...flags, ...state })
}

export async function loadMembers(roomId: string, since: number): Promise<Member[]> {
  if (useCore()) {
    const res = await fetch(
      `/api/core/rooms/${encodeURIComponent(roomId)}/members?since=${encodeURIComponent(String(since))}`,
      { credentials: 'include' },
    )
    if (!res.ok) return []
    return ((await res.json()) as { members?: Member[] }).members ?? []
  }
  const { Query } = await import('appwrite')
  const { COMMUNITY_DB, tablesDB } = await import('../api/appwrite')
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'members',
    queries: [Query.equal('roomId', roomId), Query.greaterThan('at', since), Query.limit(100)],
  })
  return res.rows as unknown as Member[]
}

/** Сколько вошедших зрителей в каждой из комнат (для карточек во «Вместе»). */
export async function countMembers(roomIds: string[], since: number): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!roomIds.length) return out
  if (useCore()) {
    const res = await fetch(
      `/api/core/rooms/member-counts?ids=${encodeURIComponent(roomIds.join(','))}&since=${encodeURIComponent(String(since))}`,
      { credentials: 'include' },
    )
    if (!res.ok) return out
    const data = (await res.json()) as { counts?: Record<string, number> }
    for (const id of roomIds) out.set(id, data.counts?.[id.toUpperCase()] ?? data.counts?.[id] ?? 0)
    return out
  }
  const { Query } = await import('appwrite')
  const { COMMUNITY_DB, tablesDB } = await import('../api/appwrite')
  const res = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'members',
    queries: [Query.equal('roomId', roomIds), Query.greaterThan('at', since), Query.limit(500)],
  })
  for (const m of res.rows as unknown as Member[]) out.set(m.roomId, (out.get(m.roomId) ?? 0) + 1)
  return out
}

export function subscribeMembers(roomId: string, onChange: (m: Member, gone: boolean) => void) {
  if (useCore()) {
    let stopped = false
    let prev = new Map<string, Member>()
    const emit = (m: Member, gone: boolean) => onChange(m, gone)
    const tick = async () => {
      if (stopped) return
      try {
        const since = serverNow() - MEMBER_TTL
        const list = await loadMembers(roomId, since)
        const next = new Map(list.map((m) => [m.userId, m]))
        for (const m of list) {
          const old = prev.get(m.userId)
          if (!old || old.at !== m.at || old.voice !== m.voice || old.muted !== m.muted || old.name !== m.name) {
            emit(m, false)
          }
        }
        for (const [userId, old] of prev) {
          if (!next.has(userId)) emit(old, true)
        }
        prev = next
      } catch {
        // сеть — следующий тик
      }
    }
    void tick()
    const timer = window.setInterval(tick, CORE_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }
  let unsub = () => {}
  void import('../api/appwrite').then(({ COMMUNITY_DB, client }) => {
    unsub = client.subscribe<Member>(`databases.${COMMUNITY_DB}.tables.members.rows`, (e) => {
      if (e.payload.roomId !== roomId) return
      onChange(e.payload, e.events.some((ev) => ev.endsWith('.delete')))
    })
  })
  return () => unsub()
}

async function loadSignals(roomId: string, since: number): Promise<(Signal & { $id: string })[]> {
  const res = await fetch(
    `/api/core/rooms/${encodeURIComponent(roomId)}/signals?since=${encodeURIComponent(String(since))}`,
    { credentials: 'include' },
  )
  if (!res.ok) return []
  return ((await res.json()) as { signals?: (Signal & { $id: string })[] }).signals ?? []
}

/** Ждём, пока браузер соберёт свои адреса: одно сообщение вместо десятка. */
function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => pc.iceGatheringState === 'complete' && done()
    const timer = setTimeout(done, 2500)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

/**
 * Шумоподавление микрофона: «сильное» — нейросеть RNNoise в браузере (клавиатура, вентилятор, улица),
 * «обычное» — встроенное в браузер, «выключено» — звук как есть (музыка, инструменты).
 */
export type NoiseMode = 'strong' | 'browser' | 'off'
export const noiseStore = createLocalStore<NoiseMode>('anime.noise.v1', 'strong')

export interface PeerState {
  userId: string
  connected: boolean
  failed: boolean
  level: number
}

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  analyser?: AnalyserNode
  failed: boolean
}

export class VoiceChat {
  private peers = new Map<string, Peer>()
  /** микрофон как есть */
  private mic: MediaStream | null = null
  /** что слышат остальные: микрофон после шумоподавления */
  private stream: MediaStream | null = null
  private stopNoise: (() => void) | null = null
  private ctx: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private localSource: MediaStreamAudioSourceNode | null = null
  private unsubscribe: (() => void) | null = null
  private signalPoll: ReturnType<typeof setInterval> | undefined
  private meter: ReturnType<typeof setInterval> | undefined
  muted = false

  constructor(
    private roomId: string,
    private me: string,
    private onState: (peers: PeerState[], myLevel: number) => void,
  ) {}

  get active() {
    return !!this.stream
  }

  /** Возвращает шумоподавление, которое на самом деле включилось. */
  async join(members: Member[], noise: NoiseMode = 'strong'): Promise<NoiseMode> {
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: noise === 'browser', autoGainControl: true },
    })
    // RNNoise обучен на 48 кГц: так звук не пересчитывается лишний раз.
    this.ctx = new AudioContext({ sampleRate: 48000 })
    const applied = await this.applyNoise(noise)
    if (useCore()) {
      const seen = new Set<string>()
      let cursor = Date.now()
      const poll = async () => {
        try {
          const batch = await loadSignals(this.roomId, cursor)
          for (const s of batch) {
            if (seen.has(s.$id)) continue
            seen.add(s.$id)
            cursor = Math.max(cursor, s.at)
            if (s.to === this.me) void this.onSignal(s)
          }
        } catch {
          // сеть — следующий тик
        }
      }
      void poll()
      this.signalPoll = setInterval(poll, CORE_POLL_MS)
    } else {
      void import('../api/appwrite').then(({ COMMUNITY_DB, client }) => {
        this.unsubscribe = client.subscribe<Signal>(`databases.${COMMUNITY_DB}.tables.signals.rows`, (e) => {
          const s = e.payload
          if (s.to === this.me && s.roomId === this.roomId && e.events.some((ev) => ev.endsWith('.create')))
            void this.onSignal(s)
        })
      })
    }
    try {
      await presence(this.roomId, { voice: true, muted: false })
    } catch (e) {
      this.leave(false)
      throw e
    }
    this.meter = setInterval(() => this.report(), 150)
    // Звоним всем, кто уже в голосовом чате.
    for (const m of members) if (m.voice && m.userId !== this.me) void this.call(m.userId)
    return applied
  }

  leave(notify = true) {
    for (const id of [...this.peers.keys()]) this.drop(id)
    this.stopNoise?.()
    this.stopNoise = null
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    this.stream = null
    this.unsubscribe?.()
    this.unsubscribe = null
    clearInterval(this.signalPoll)
    this.signalPoll = undefined
    clearInterval(this.meter)
    void this.ctx?.close()
    this.ctx = null
    if (notify) void presence(this.roomId, { voice: false, muted: false }).catch(() => undefined)
    else Object.assign(flags, { voice: false, muted: false })
    this.onState([], 0)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    for (const s of [this.mic, this.stream]) s?.getAudioTracks().forEach((t) => (t.enabled = !muted))
    void presence(this.roomId, { voice: true, muted }).catch(() => undefined)
  }

  /** Сменить шумоподавление на ходу: собеседникам подменяем дорожку без нового звонка. */
  async setNoise(mode: NoiseMode) {
    if (!this.mic) return mode
    const applied = await this.applyNoise(mode)
    const track = this.stream?.getAudioTracks()[0] ?? null
    for (const p of this.peers.values()) {
      const sender = p.pc.getSenders().find((s) => s.track?.kind === 'audio')
      await sender?.replaceTrack(track).catch(() => undefined)
    }
    return applied
  }

  /** Собирает звук для отправки. Нейросеть не загрузилась — включаем встроенное шумоподавление браузера. */
  private async applyNoise(mode: NoiseMode): Promise<NoiseMode> {
    const mic = this.mic!
    const track = mic.getAudioTracks()[0]
    this.stopNoise?.()
    this.stopNoise = null
    let applied = mode
    if (mode === 'strong' && this.ctx) {
      try {
        const { denoise } = await import('./noise')
        const out = await denoise(this.ctx, mic)
        this.stream = out.stream
        this.stopNoise = out.stop
      } catch {
        applied = 'browser'
      }
    }
    await track?.applyConstraints({ noiseSuppression: applied === 'browser' }).catch(() => undefined)
    if (applied !== 'strong') this.stream = mic
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.muted))
    // Старый индикатор громкости отцепляем, иначе при каждой смене режима копились бы узлы.
    this.localSource?.disconnect()
    this.localSource = this.ctx?.createMediaStreamSource(this.stream!) ?? null
    this.localAnalyser = this.ctx?.createAnalyser() ?? null
    if (this.localSource && this.localAnalyser) {
      this.localAnalyser.fftSize = 512
      this.localSource.connect(this.localAnalyser)
    }
    return applied
  }

  /** Список участников обновился: с ушедшими из голоса разрываем соединение. */
  syncMembers(members: Member[]) {
    const alive = new Set(members.filter((m) => m.voice).map((m) => m.userId))
    for (const id of [...this.peers.keys()]) if (!alive.has(id)) this.drop(id)
  }

  private analyse(stream: MediaStream) {
    if (!this.ctx) return undefined as unknown as AnalyserNode
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 512
    this.ctx.createMediaStreamSource(stream).connect(analyser)
    return analyser
  }

  private level(a?: AnalyserNode | null) {
    if (!a) return 0
    const buf = new Uint8Array(a.fftSize)
    a.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += (v - 128) ** 2
    return Math.sqrt(sum / buf.length) / 128
  }

  private report() {
    const peers = [...this.peers.entries()].map(([userId, p]) => ({
      userId,
      connected: p.pc.connectionState === 'connected',
      failed: p.failed,
      level: this.level(p.analyser),
    }))
    this.onState(peers, this.muted ? 0 : this.level(this.localAnalyser))
  }

  private peer(userId: string) {
    this.drop(userId)
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = new Audio()
    audio.autoplay = true
    const peer: Peer = { pc, audio, failed: false }
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!))
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0]
      void audio.play().catch(() => undefined)
      peer.analyser = this.analyse(e.streams[0])
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') peer.failed = true
    }
    this.peers.set(userId, peer)
    return pc
  }

  private drop(userId: string) {
    const p = this.peers.get(userId)
    if (!p) return
    p.pc.close()
    p.audio.srcObject = null
    this.peers.delete(userId)
  }

  private send(to: string, kind: Signal['kind'], data = '') {
    return callCommunity({ action: 'room-signal', roomId: this.roomId, to, kind, data })
  }

  private async call(userId: string) {
    const pc = this.peer(userId)
    await pc.setLocalDescription(await pc.createOffer())
    await gathered(pc)
    await this.send(userId, 'offer', pc.localDescription!.sdp).catch(() => this.drop(userId))
  }

  private async onSignal(s: Signal) {
    if (!this.stream) return
    if (s.kind === 'bye') return this.drop(s.from)
    if (s.kind === 'offer') {
      // Оба позвонили друг другу одновременно: отвечает тот, у кого ID меньше, второй звонок отменяется.
      const mine = this.peers.get(s.from)
      if (mine && mine.pc.signalingState === 'have-local-offer' && this.me > s.from) return
      const pc = this.peer(s.from)
      await pc.setRemoteDescription({ type: 'offer', sdp: s.data })
      await pc.setLocalDescription(await pc.createAnswer())
      await gathered(pc)
      await this.send(s.from, 'answer', pc.localDescription!.sdp).catch(() => this.drop(s.from))
      return
    }
    const pc = this.peers.get(s.from)?.pc
    if (pc && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription({ type: 'answer', sdp: s.data })
  }
}

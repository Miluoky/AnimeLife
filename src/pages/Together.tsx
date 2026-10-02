import './together.css'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { CommunityError } from '../data/community'
import {
  REACTIONS,
  closeRoom,
  controlRoom,
  deleteRoomMessage,
  loadMessages,
  loadRoom,
  roomPosition,
  sendRoomMessage,
  serverNow,
  subscribeRoom,
  syncClock,
  type Room,
  type RoomMessage,
} from '../data/rooms'
import { toast } from '../data/toast'
import SyncVideo, { type VideoControl } from '../components/together/SyncVideo'
import InviteCard from '../components/together/InviteCard'
import { formatTime } from '../components/together/time'
import { PeopleIcon, PlayIcon, SendIcon } from '../components/Icons'
import Mascot from '../components/Mascot'
import People from '../components/together/People'
import Schedule from '../components/together/ScheduleSession'
import { MEMBER_TTL, PRESENCE_EVERY, loadMembers, presence, subscribeMembers, type Member } from '../data/voice'

/** Расхождение больше этого (секунд) исправляем перемоткой, меньше — подстройкой скорости. */
const HARD_DRIFT = 1.5
const SOFT_DRIFT = 0.3

const errorText = (e: unknown) => (e instanceof CommunityError ? e.message : 'Не получилось. Попробуйте ещё раз.')

interface Burst {
  id: string
  emoji: string
  x: number
}

export default function Together() {
  const { code = '' } = useParams()
  const roomId = code.toUpperCase()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [room, setRoom] = useState<Room | null | undefined>(undefined)
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [joined, setJoined] = useState(false)
  const [ready, setReady] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const video = useRef<VideoControl>(null)
  const roomRef = useRef<Room | null | undefined>(undefined)
  roomRef.current = room
  const userRef = useRef(user)
  userRef.current = user

  const isHost = !!user && room?.hostId === user.$id
  const canControl = !!user && !!room && (isHost || room.controlAll)

  // Подтягиваем видео к состоянию комнаты: плей/пауза, перемотка, мягкая подстройка скорости.
  const align = useCallback(() => {
    const r = roomRef.current
    const v = video.current
    if (!r || !v || !joined || !ready) return
    const target = roomPosition(r)
    if (!r.playing) {
      if (!v.paused()) v.pause()
      if (Math.abs(v.time() - r.position) > 0.5) v.seek(r.position)
      v.rate(1)
      return
    }
    const drift = v.time() - target
    if (v.paused()) {
      v.seek(target)
      v.play()
    } else if (Math.abs(drift) > HARD_DRIFT) {
      v.seek(target)
    }
    // Отстаём или спешим чуть-чуть: ускоряем или замедляем на несколько процентов, без рывка.
    v.rate(Math.abs(drift) > SOFT_DRIFT ? 1 - Math.max(-0.05, Math.min(0.05, drift * 0.1)) : 1)
  }, [joined, ready])

  useEffect(() => {
    align()
    const timer = setInterval(align, 1000)
    return () => clearInterval(timer)
  }, [align, room])

  // Загрузка комнаты, чата, часов сервера и живая подписка.
  useEffect(() => {
    let alive = true
    void syncClock()
    void loadRoom(roomId).then((r) => alive && setRoom(r))
    void loadMessages(roomId)
      .then((list) => alive && setMessages(list))
      .catch(() => undefined)
    const unsubscribe = subscribeRoom(roomId, {
      onRoom: (next) => {
        const prev = roomRef.current
        if (!next) {
          setRoom(null)
          return
        }
        if (prev && next.actor && next.at !== prev.at) {
          const me = userRef.current?.name
          if (next.actor !== me) {
            if (next.episode !== prev.episode) toast(`${next.actor}: серия ${next.episode}`)
            else if (next.playing !== prev.playing) toast(`${next.actor}: ${next.playing ? 'продолжаем' : 'пауза'}`)
            else if (Math.abs(next.position - roomPosition(prev)) > 3)
              toast(`${next.actor}: перемотка на ${formatTime(next.position)}`)
          }
        }
        setRoom(next)
      },
      onMessageGone: (id) => setMessages((list) => list.filter((x) => x.$id !== id)),
      onMessage: (m) => {
        setMessages((list) => (list.some((x) => x.$id === m.$id) ? list : [...list.slice(-199), m]))
        if (m.kind === 'reaction') {
          const b = { id: m.$id, emoji: m.text, x: 10 + Math.random() * 80 }
          setBursts((list) => [...list.slice(-15), b])
          setTimeout(() => setBursts((list) => list.filter((x) => x.id !== b.id)), 2600)
        }
      },
    })
    return () => {
      alive = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // Кто в комнате: вошедшие зрители отмечаются раз в 45 секунд, список обновляется живьём.
  const myId = user?.$id
  useEffect(() => {
    let alive = true
    const fresh = (list: Member[]) => list.filter((m) => m.at > serverNow() - MEMBER_TTL)
    const reload = () =>
      loadMembers(roomId, serverNow() - MEMBER_TTL)
        .then((list) => alive && setMembers(fresh(list)))
        .catch(() => undefined)
    void reload()
    const unsubscribe = subscribeMembers(roomId, (m, gone) =>
      setMembers((list) => fresh([...list.filter((x) => x.userId !== m.userId), ...(gone ? [] : [m])])),
    )
    const prune = setInterval(() => setMembers((list) => fresh(list)), 30_000)
    let beat: ReturnType<typeof setInterval> | undefined
    if (myId) {
      const ping = () => void presence(roomId).catch(() => undefined)
      ping()
      beat = setInterval(ping, PRESENCE_EVERY)
    }
    return () => {
      alive = false
      unsubscribe()
      clearInterval(prune)
      clearInterval(beat)
      if (myId) void presence(roomId, { leave: true }).catch(() => undefined)
    }
  }, [roomId, myId])

  const send = async (state: Partial<Room> & { playing: boolean; position: number }) => {
    const r = roomRef.current
    if (!r) return
    // Сразу показываем у себя, не дожидаясь сервера: так управление не «тормозит».
    setRoom({ ...r, ...state, at: serverNow(), actor: user?.name })
    try {
      await controlRoom(r.$id, state)
    } catch (e) {
      toast(errorText(e))
      void loadRoom(r.$id).then((fresh) => fresh && setRoom(fresh))
    }
  }

  const onUserChange = (state: { playing: boolean; position: number }) => {
    if (!canControl) {
      toast(user ? 'Управляет ведущий комнаты' : 'Войдите, чтобы управлять просмотром')
      align()
      return
    }
    void send(state)
  }

  const currentTime = () => video.current?.time() ?? (room ? roomPosition(room) : 0)

  if (room === undefined) return <main className="container page-fallback" aria-busy="true" />
  if (room === null)
    return (
      <main className="container empty-page">
        <Mascot mood="lost" />
        <h1>Комната закрыта</h1>
        <p className="muted">Ведущий закрыл комнату или код набран с ошибкой.</p>
        <Link to="/together" className="btn btn--accent">
          К комнатам
        </Link>
      </main>
    )

  const switchEpisode = (episode: number) => void send({ episode, playing: false, position: 0 })
  const switchSource = (source: Room['source']) => void send({ source, playing: false, position: 0 })

  return (
    <main className="container together">
      <div className="stack together__stage">
        <div className="player-frame together__frame">
          <SyncVideo
            ref={video}
            source={room.source}
            videoId={room.videoId}
            file={file}
            title={room.animeTitle}
            onReady={() => setReady(true)}
            onUserChange={onUserChange}
          />
          {room.source === 'file' && !file && (
            <label className="together__gate">
              <strong>Выберите файл серии {room.episode}</strong>
              <span className="muted">
                Видео играет с вашего устройства, по сети идёт только время. У всех должен быть один и тот же файл.
              </span>
              <span className="btn btn--accent">Выбрать файл</span>
              <input
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setReady(false)
                }}
              />
            </label>
          )}
          {!joined && (room.source !== 'file' || file) && (
            <button type="button" className="together__gate together__gate--join" onClick={() => setJoined(true)}>
              <span className="together__play">
                <PlayIcon size={28} />
              </span>
              <strong>{isHost ? 'Начать просмотр' : 'Присоединиться'}</strong>
              <span className="muted">
                {room.playing ? `Уже смотрят: ${formatTime(roomPosition(room))}` : 'Видео на паузе, ждём всех'}
              </span>
            </button>
          )}
          <div className="bursts" aria-hidden="true">
            {bursts.map((b) => (
              <span key={b.id} className="burst" style={{ left: `${b.x}%` }}>
                {b.emoji}
              </span>
            ))}
          </div>
        </div>

        <div className="together__bar">
          <div className="stack" style={{ gap: 2 }}>
            <Link to={`/anime/${room.animeId}`} className="muted">
              {room.animeTitle}
            </Link>
            <h1 className="together__title">
              {room.title || `Серия ${room.episode}`}
              <span className={`live-badge${room.playing ? ' live-badge--on' : ''}`}>
                {room.playing ? 'Идёт' : 'Пауза'}
              </span>
            </h1>
            <span className="muted together__meta">
              <PeopleIcon size={16} /> Ведущий: {room.hostName}
              {room.controlAll ? ' · управляют все' : ''}
              {room.source === 'trailer' ? ' · трейлер' : ' · свой файл'}
            </span>
          </div>
          <div className="actions">
            {canControl && (
              <>
                {room.episode > 1 && (
                  <button type="button" className="btn btn--ghost" onClick={() => switchEpisode(room.episode - 1)}>
                    Серия {room.episode - 1}
                  </button>
                )}
                <button type="button" className="btn btn--ghost" onClick={() => switchEpisode(room.episode + 1)}>
                  Серия {room.episode + 1}
                </button>
              </>
            )}
            <button type="button" className="btn btn--accent" onClick={() => setShowInvite((v) => !v)}>
              Позвать друга
            </button>
          </div>
        </div>

        {showInvite && <InviteCard code={room.$id} title={room.animeTitle} />}

        <Schedule
          room={room}
          isHost={isHost}
          onChange={(startsAt) => void send({ startsAt, playing: room.playing, position: roomPosition(room) })}
        />

        {isHost && (
          <div className="together__host chips">
            <span className="muted">Видео:</span>
            <button
              type="button"
              className={`chip-btn${room.source === 'trailer' ? ' chip-btn--on' : ''}`}
              aria-pressed={room.source === 'trailer'}
              onClick={() => switchSource('trailer')}
            >
              Трейлер
            </button>
            <button
              type="button"
              className={`chip-btn${room.source === 'file' ? ' chip-btn--on' : ''}`}
              aria-pressed={room.source === 'file'}
              onClick={() => switchSource('file')}
            >
              Свой файл
            </button>
            <label className="appearance__toggle">
              <input
                type="checkbox"
                checked={room.controlAll}
                onChange={(e) =>
                  void send({ controlAll: e.target.checked, playing: room.playing, position: roomPosition(room) })
                }
              />
              <span>Управлять могут все</span>
            </label>
            <label className="appearance__toggle">
              <input
                type="checkbox"
                checked={room.public}
                onChange={(e) =>
                  void send({ public: e.target.checked, playing: room.playing, position: roomPosition(room) })
                }
              />
              <span>Показывать во «Вместе»</span>
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={async () => {
                try {
                  await closeRoom(room.$id)
                  navigate('/together')
                } catch (e) {
                  toast(errorText(e))
                }
              }}
            >
              Закрыть комнату
            </button>
          </div>
        )}
      </div>

      <Chat
        people={<People roomId={room.$id} members={members} myId={user?.$id} hostId={room.hostId} />}
        canModerate={isHost}
        room={room}
        messages={messages}
        signedIn={!!user}
        myId={user?.$id}
        currentTime={currentTime}
        onSeek={canControl ? (t) => void send({ playing: room.playing, position: t }) : undefined}
      />
    </main>
  )
}

function Chat({
  people,
  canModerate,
  room,
  messages,
  signedIn,
  myId,
  currentTime,
  onSeek,
}: {
  people: ReactNode
  canModerate: boolean
  room: Room
  messages: RoomMessage[]
  signedIn: boolean
  myId?: string
  currentTime: () => number
  onSeek?: (t: number) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const chat = messages.filter((m) => m.kind === 'chat')

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await sendRoomMessage(room.$id, 'chat', text, currentTime())
      setText('')
    } catch (err) {
      toast(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const react = (emoji: string) =>
    sendRoomMessage(room.$id, 'reaction', emoji, currentTime()).catch((err) => toast(errorText(err)))

  return (
    <aside className="together__chat" aria-label="Чат комнаты">
      <div className="section-head">
        <h2 style={{ fontSize: 18, fontWeight: 500 }}>Чат</h2>
        <span className="muted">код {room.$id}</span>
      </div>
      {people}
      <ol className="chat" ref={list}>
        {chat.length === 0 && <li className="muted chat__empty">Пока тихо. Напишите первым!</li>}
        {chat.map((m) => (
          <li key={m.$id} className={`chat__msg${m.userId === myId ? ' chat__msg--mine' : ''}`}>
            <span className="chat__name">{m.name}</span>
            <button
              type="button"
              className="chat__time"
              disabled={!onSeek}
              title={onSeek ? 'Перемотать сюда' : undefined}
              onClick={() => onSeek?.(m.t)}
            >
              {formatTime(m.t)}
            </button>
            <p>{m.text}</p>
            {(canModerate || m.userId === myId) && (
              <button
                type="button"
                className="chat__delete"
                aria-label="Убрать сообщение"
                onClick={() => void deleteRoomMessage(m.$id).catch((err) => toast(errorText(err)))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {signedIn ? (
        <>
          <div className="reactions" role="group" aria-label="Реакции">
            {REACTIONS.map((r) => (
              <button key={r} type="button" className="reaction" onClick={() => void react(r)} aria-label={`Реакция ${r}`}>
                {r}
              </button>
            ))}
          </div>
          <form className="chat__form" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="Сообщение"
              aria-label="Сообщение в чат"
            />
            <button type="submit" className="btn btn--accent" disabled={busy || !text.trim()} aria-label="Отправить">
              <SendIcon />
            </button>
          </form>
        </>
      ) : (
        <p className="muted chat__login">
          <Link to="/account">Войдите</Link>, чтобы писать в чат и ставить реакции. Смотреть можно и без входа.
        </p>
      )}
    </aside>
  )
}

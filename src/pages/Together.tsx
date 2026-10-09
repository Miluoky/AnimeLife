import './together.css'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { loadAnime, useAsync } from '../api'
import { episodeCount } from '../data/catalog'
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
  youtubeId,
} from '../data/rooms'
import { pickCode, roomStream, roomVideo, roomVoices, samePick, type PlayerPick } from '../data/roomPlayer'
import { toast } from '../data/toast'
import { markFlag } from '../data/flags'
import { usePageMeta } from '../data/pageMeta'
import SyncVideo, { type VideoControl } from '../components/together/SyncVideo'
import InviteCard from '../components/together/InviteCard'
import { formatTime } from '../components/together/time'
import { PeopleIcon, PlayIcon, SendIcon } from '../components/Icons'
import Mascot from '../components/Mascot'
import Hall from '../components/together/Hall'
import RoomVoices from '../components/together/RoomVoices'
import People from '../components/together/People'
import Schedule from '../components/together/ScheduleSession'
import { MEMBER_TTL, PRESENCE_EVERY, loadMembers, presence, subscribeMembers, type Member } from '../data/voice'

/*
 * Синхронизация как на Senku: команды комнаты (плей, пауза, перемотка) применяем один раз, когда они пришли,
 * а мелкие расхождения не трогаем. Раньше видео подтягивалось к комнате 4 раза в секунду с допуском
 * в полсекунды: пока поток догружался после перемотки, время отставало, плеер перематывался снова,
 * его события уходили в комнату как действия зрителя, и у всех видео дёргалось по кругу.
 */
/** Расхождение (секунды), после которого перематываем идущее видео. */
const SEEK_DRIFT = 2
/** Kodik сообщает время раз в секунду и перематывает долго: допуск шире. */
const COARSE_SEEK_DRIFT = 4
/** На паузе ставим кадр точно: перемотка стоящего видео ничего не ломает. */
const PAUSED_DRIFT = 0.25
/** Как часто сверяемся с комнатой между командами. */
const WATCH_EVERY = 2000
/** В фоне перематываем не чаще этого (мс), чтобы догрузка потока не зациклила перемотки. */
const SEEK_COOLDOWN = 6000

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
  const location = useLocation()
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

  // Подтягиваем видео к комнате. mode: 'event' — пришла команда, 'retry' — плеер мог её проглотить,
  // 'watch' — плановая сверка: только заметные расхождения и не чаще SEEK_COOLDOWN.
  const lastSeek = useRef(0)
  const stalled = useRef(0)
  const [blocked, setBlocked] = useState(false)
  const align = useCallback(
    (mode: 'event' | 'retry' | 'watch') => {
      const r = roomRef.current
      const v = video.current
      if (!r || !v || !joined || !ready) return
      const coarse = v.coarse()
      if (!r.playing) {
        if (!v.paused()) v.pause()
        if (mode !== 'retry' && Math.abs(v.time() - r.position) > (coarse ? 1 : PAUSED_DRIFT)) v.seek(r.position)
        v.rate(1)
        stalled.current = 0
        setBlocked(false)
        return
      }
      const target = roomPosition(r)
      const drift = v.time() - target
      const now = Date.now()
      if (mode !== 'retry' && Math.abs(drift) > (coarse ? COARSE_SEEK_DRIFT : SEEK_DRIFT) && (mode === 'event' || now - lastSeek.current > SEEK_COOLDOWN)) {
        v.seek(target)
        lastSeek.current = now
        v.rate(1)
      } else {
        // Отстаём или спешим чуть-чуть: на 5% быстрее или медленнее, без рывка (только своё видео).
        v.rate(Math.abs(drift) > 0.4 ? (drift > 0 ? 0.95 : 1.05) : 1)
      }
      if (v.paused()) {
        v.play()
        // Браузер не дал включить видео без нажатия: после двух сверок подряд просим нажать самому.
        if (mode === 'watch' && ++stalled.current >= 2) setBlocked(true)
      } else {
        stalled.current = 0
        setBlocked(false)
      }
    },
    [joined, ready],
  )

  // Команда комнаты пришла (или плеер только что стал готов): применяем сразу и через секунду ещё раз
  // проверяем плей/паузу — плеер мог догружаться и проглотить команду.
  useEffect(() => {
    align('event')
    const retry = setTimeout(() => align('retry'), 1100)
    return () => clearTimeout(retry)
  }, [align, room?.at, room?.playing, room?.position, room?.episode])

  useEffect(() => {
    const timer = setInterval(() => align('watch'), WATCH_EVERY)
    return () => clearInterval(timer)
  }, [align])

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
    // Точное время сервера придёт вместе с обновлённой комнатой через Realtime.
    setRoom({ ...r, ...state, at: serverNow(), actor: user?.name })
    try {
      await controlRoom(r.$id, state)
    } catch (e) {
      toast(errorText(e))
      void loadRoom(r.$id).then((fresh) => fresh && setRoom(fresh))
    }
  }

  const onUserChange = (state: { playing: boolean; position: number }) => {
    const r = roomRef.current
    if (!r) return
    // Плеер сообщил то же, что и так в комнате (догрузка, эхо команды): никому ничего не шлём.
    const tolerance = video.current?.coarse() ? COARSE_SEEK_DRIFT : 1.5
    if (state.playing === r.playing && Math.abs(state.position - roomPosition(r)) < tolerance) return
    if (!canControl) {
      toast(user ? 'Управляет ведущий комнаты' : 'Войдите, чтобы управлять просмотром')
      align('event')
      return
    }
    setBlocked(false)
    void send(state)
  }

  const currentTime = () => video.current?.time() ?? (room ? roomPosition(room) : 0)

  // Тайтл комнаты: по нему ищем серии и озвучки в плеерах сайта.
  const animeId = room?.animeId
  const anime = useAsync(() => (animeId ? loadAnime(animeId).then((r) => r.data) : Promise.resolve(undefined)), [animeId]).value
  const query = anime && { id: anime.id, title: anime.title, originalTitle: anime.originalTitle, englishTitle: anime.englishTitle, year: anime.year }
  const voices = useAsync(() => (query ? roomVoices(query) : Promise.resolve(undefined)), [anime?.id])
  const playing = room ? roomVideo(room) : undefined
  const pick = playing?.type === 'player' ? playing.pick : null
  const stream = useAsync(
    () => (query && pick && room ? roomStream(query, pick, room.episode).catch(() => null) : Promise.resolve(null)),
    [anime?.id, pick?.kind, pick?.voice, room?.episode],
  )
  const total = anime ? episodeCount(anime) : undefined
  // Сменилось видео: новый плеер ещё не готов принимать команды.
  const videoKey = pick ? `${pick.kind}${pick.voice}:${room?.episode}:${stream.value?.url ?? ''}` : `${room?.source}:${room?.videoId}`
  useEffect(() => setReady(false), [videoKey])

  // Новая комната со страницы серии: сразу включаем первую озвучку вместо трейлера.
  const fresh = !!(location.state as { fresh?: boolean } | null)?.fresh
  const autoPicked = useRef(false)
  useEffect(() => {
    const first = voices.value?.[0]
    if (!fresh || autoPicked.current || !isHost || !room || !first || playing?.type === 'player' || room.position > 0) return
    autoPicked.current = true
    void send({ source: 'trailer', videoId: pickCode(first), playing: false, position: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, voices.value, isHost, room?.$id])

  usePageMeta(room ? `Смотрим вместе: ${room.title || room.animeTitle}` : room === null ? 'Комната закрыта' : undefined)

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

  const switchEpisode = (episode: number, play = false) => void send({ episode, playing: play, position: 0 })
  const switchSource = (source: Room['source']) =>
    void send({ source, videoId: source === 'trailer' ? (youtubeId(anime?.trailerUrl) ?? '') : room.videoId, playing: false, position: 0 })
  const switchPlayer = (p: PlayerPick) => void send({ source: 'trailer', videoId: pickCode(p), playing: false, position: 0 })
  const voice = pick ? voices.value?.find((v) => samePick(v, pick)) : undefined
  const sync =
    playing?.type === 'player'
      ? stream.value
        ? { source: stream.value.type, src: stream.value.url }
        : null
      : playing?.type === 'file'
        ? { source: 'file' as const }
        : { source: 'trailer' as const, videoId: room.videoId }
  // Серия кончилась: ведущий сам включает следующую, остальные подтянутся.
  const onEnded = () => {
    if (!isHost || roomRef.current?.episode !== room.episode) return
    if (total && room.episode >= total) return
    switchEpisode(room.episode + 1, true)
  }

  return (
    <main className="container together">
      <div className="stack together__stage">
        <div className="player-frame together__frame">
          {sync ? (
            <SyncVideo
              key={`${sync.source}:${sync.src ?? sync.videoId ?? ''}`}
              ref={video}
              source={sync.source}
              videoId={sync.videoId}
              src={sync.src}
              file={file}
              title={room.animeTitle}
              onReady={() => setReady(true)}
              onUserChange={onUserChange}
              onEnded={onEnded}
            />
          ) : (
            <div className="player-empty" aria-busy={stream.loading}>
              <span className="art-label">
                {stream.loading
                  ? 'Ищем серию…'
                  : `Серии ${room.episode} нет в озвучке ${voice?.title ?? 'ведущего'}. ${isHost ? 'Выберите другую ниже.' : 'Ведущий может выбрать другую.'}`}
              </span>
            </div>
          )}
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
            <button
              type="button"
              className="together__gate together__gate--join"
              onClick={() => {
                setJoined(true)
                markFlag('joinedRoom')
              }}
            >
              <span className="together__play">
                <PlayIcon size={28} />
              </span>
              <strong>{isHost ? 'Начать просмотр' : 'Присоединиться'}</strong>
              <span className="muted">
                {room.playing ? `Уже смотрят: ${formatTime(roomPosition(room))}` : 'Видео на паузе, ждём всех'}
              </span>
            </button>
          )}
          {joined && blocked && room.playing && (
            <button
              type="button"
              className="together__gate together__gate--join"
              onClick={() => {
                video.current?.play()
                setBlocked(false)
              }}
            >
              <span className="together__play">
                <PlayIcon size={28} />
              </span>
              <strong>Нажмите, чтобы смотреть со всеми</strong>
              <span className="muted">Браузер не дал включить видео без нажатия</span>
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

        <Hall members={members} hostId={room.hostId} myId={user?.$id} />

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
              {playing?.type === 'player'
                ? ` · ${voice ? voice.title : 'плеер сайта'}`
                : playing?.type === 'trailer'
                  ? ' · трейлер'
                  : ' · свой файл'}
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
                {total && total > 2 && (
                  <select
                    className="together__select"
                    value={room.episode}
                    onChange={(e) => switchEpisode(Number(e.target.value))}
                    aria-label="Выбрать серию"
                  >
                    {Array.from({ length: Math.max(total, room.episode) }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Серия {i + 1}
                      </option>
                    ))}
                  </select>
                )}
                {(!total || room.episode < total) && (
                  <button type="button" className="btn btn--ghost" onClick={() => switchEpisode(room.episode + 1)}>
                    Серия {room.episode + 1}
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn btn--accent" onClick={() => setShowInvite((v) => !v)}>
              Позвать друга
            </button>
          </div>
        </div>

        {showInvite && <InviteCard code={room.$id} title={room.animeTitle} />}

        {isHost && <RoomVoices voices={voices.value} loading={voices.loading} current={pick} onChoose={switchPlayer} />}

        <Schedule
          room={room}
          isHost={isHost}
          onChange={(startsAt) =>
            void send({
              startsAt,
              playing: room.playing,
              position: roomPosition(room),
            })
          }
        />

        {isHost && (
          <div className="together__host chips">
            <span className="muted">Видео:</span>
            <button
              type="button"
              className={`chip-btn${playing?.type === 'trailer' ? ' chip-btn--on' : ''}`}
              aria-pressed={playing?.type === 'trailer'}
              onClick={() => switchSource('trailer')}
            >
              Трейлер
            </button>
            <button
              type="button"
              className={`chip-btn${playing?.type === 'file' ? ' chip-btn--on' : ''}`}
              aria-pressed={playing?.type === 'file'}
              onClick={() => switchSource('file')}
            >
              Свой файл
            </button>
            <label className="appearance__toggle">
              <input
                type="checkbox"
                checked={room.controlAll}
                onChange={(e) =>
                  void send({
                    controlAll: e.target.checked,
                    playing: room.playing,
                    position: roomPosition(room),
                  })
                }
              />
              <span>Управлять могут все</span>
            </label>
            <label className="appearance__toggle">
              <input
                type="checkbox"
                checked={room.public}
                onChange={(e) =>
                  void send({
                    public: e.target.checked,
                    playing: room.playing,
                    position: roomPosition(room),
                  })
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
              <button
                key={r}
                type="button"
                className="reaction"
                onClick={() => void react(r)}
                aria-label={`Реакция ${r}`}
              >
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

import { useEffect, useRef, useState } from 'react'
import { CommunityError } from '../../data/community'
import { toast } from '../../data/toast'
import { VoiceChat, type Member, type PeerState } from '../../data/voice'
import { MicIcon } from '../Icons'

const SPEAKING = 0.04

/** Кто в комнате и голосовой чат: подключиться, выключить микрофон, видно, кто сейчас говорит. */
export default function People({
  roomId,
  members,
  myId,
  hostId,
}: {
  roomId: string
  members: Member[]
  myId?: string
  hostId: string
}) {
  const voice = useRef<VoiceChat | null>(null)
  const [peers, setPeers] = useState<PeerState[]>([])
  const [myLevel, setMyLevel] = useState(0)
  const [inVoice, setInVoice] = useState(false)
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(false)

  // Уходим со страницы: комната сама удалит отметку присутствия, поэтому серверу ничего не шлём.
  useEffect(() => () => voice.current?.leave(false), [])
  useEffect(() => voice.current?.syncMembers(members), [members])

  const join = async () => {
    if (!myId) return
    setBusy(true)
    const v = new VoiceChat(roomId, myId, (p, level) => {
      setPeers(p)
      setMyLevel(level)
    })
    try {
      await v.join(members)
      voice.current = v
      setInVoice(true)
      setMuted(false)
    } catch (e) {
      toast(
        e instanceof CommunityError
          ? e.message
          : e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Разрешите доступ к микрофону в настройках браузера'
            : 'Не удалось включить микрофон',
      )
    } finally {
      setBusy(false)
    }
  }
  const leave = () => {
    voice.current?.leave()
    voice.current = null
    setInVoice(false)
  }
  const toggleMute = () => {
    voice.current?.setMuted(!muted)
    setMuted(!muted)
  }

  const sorted = [...members].sort((a, b) => Number(b.voice) - Number(a.voice) || a.name.localeCompare(b.name))

  return (
    <section className="people" aria-label="Кто в комнате">
      <ul className="people__list">
        {sorted.map((m) => {
          const me = m.userId === myId
          const peer = peers.find((p) => p.userId === m.userId)
          const level = me ? myLevel : (peer?.level ?? 0)
          const speaking = m.voice && !m.muted && level > SPEAKING
          return (
            <li
              key={m.userId}
              className={`person${speaking ? ' person--speaking' : ''}`}
              title={peer?.failed ? 'Не удалось соединиться напрямую' : undefined}
            >
              <span className="person__avatar" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="person__name">
                {m.name}
                {me ? ' (вы)' : ''}
                {m.userId === hostId ? ' · ведущий' : ''}
              </span>
              {m.voice && (
                <span className={`person__mic${m.muted ? ' person__mic--off' : ''}`} aria-label={m.muted ? 'Микрофон выключен' : 'В голосовом чате'}>
                  <MicIcon size={14} off={m.muted} />
                </span>
              )}
            </li>
          )
        })}
        {members.length === 0 && <li className="muted">Вошедших зрителей пока нет</li>}
      </ul>
      {myId &&
        (inVoice ? (
          <div className="actions people__actions">
            <button
              type="button"
              className={`btn ${muted ? 'btn--accent' : 'btn--ghost'} btn--small`}
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}
              title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              <MicIcon size={16} off={muted} />
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={leave}>
              Выйти из голоса
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--small people__join" onClick={join} disabled={busy}>
            <MicIcon size={16} />
            {busy ? 'Подключаем…' : 'Голосовой чат'}
          </button>
        ))}
    </section>
  )
}

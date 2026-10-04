import { useEffect, useRef, useState } from 'react'
import { CommunityError } from '../../data/community'
import { toast } from '../../data/toast'
import { VoiceChat, noiseStore, type Member, type NoiseMode, type PeerState } from '../../data/voice'
import { MicIcon } from '../Icons'

const SPEAKING = 0.04

const NOISE_LABEL: Record<NoiseMode, string> = {
  strong: 'Шумоподавление: сильное',
  browser: 'Шумоподавление: обычное',
  off: 'Без шумоподавления',
}

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
  const noise = noiseStore.use()

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
      await v.join(members, noise)
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

  const chooseNoise = async (mode: NoiseMode) => {
    noiseStore.set(mode)
    const applied = await voice.current?.setNoise(mode)
    if (applied && applied !== mode) {
      noiseStore.set(applied)
      toast('Сильное шумоподавление не запустилось в этом браузере, включили обычное')
    }
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
            <select
              className="people__noise"
              value={noise}
              onChange={(e) => void chooseNoise(e.target.value as NoiseMode)}
              aria-label="Шумоподавление микрофона"
              title="Сильное — нейросеть RNNoise прямо в браузере: убирает клавиатуру, вентилятор и улицу"
            >
              {(Object.keys(NOISE_LABEL) as NoiseMode[]).map((m) => (
                <option key={m} value={m}>
                  {NOISE_LABEL[m]}
                </option>
              ))}
            </select>
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

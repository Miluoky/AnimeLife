import { useEffect, useRef, useState } from 'react'
import { loadComments } from '../data/comments'
import { createLocalStore } from '../data/localStore'
import { onPlayerTime } from '../data/playerTime'
import './danmaku.css'

/**
 * Комментарии поверх видео, как на Niconico и Bilibili: комментарий с таймкодом («12:34 вот это поворот»)
 * пролетает над серией ровно в этот момент. Спойлеры не показываем. Работает и со своим плеером, и с Kodik.
 */
export const danmakuStore = createLocalStore('anime.danmaku.v1', true)

const TIMECODE = /\b(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)\b/
const LANES = 4
const MAX_TEXT = 90

interface Cue {
  id: string
  at: number
  text: string
}

interface Flying extends Cue {
  lane: number
}

export default function Danmaku({ animeId, episode }: { animeId: string; episode: number }) {
  const on = danmakuStore.use()
  const [cues, setCues] = useState<Cue[]>([])
  const [flying, setFlying] = useState<Flying[]>([])
  const shown = useRef(new Set<string>())
  const last = useRef(0)
  const lane = useRef(0)

  useEffect(() => {
    let alive = true
    setCues([])
    setFlying([])
    shown.current.clear()
    loadComments(animeId, episode)
      .then((list) => {
        if (!alive) return
        const out: Cue[] = []
        for (const c of list) {
          if (c.spoiler) continue
          const m = c.text.match(TIMECODE)
          if (!m) continue
          const at = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
          const text = c.text.replace(m[0], '').replace(/\s+/g, ' ').trim()
          if (text) out.push({ id: c.$id, at, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text })
        }
        setCues(out)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [animeId, episode])

  useEffect(() => {
    if (!on || !cues.length) return
    return onPlayerTime((t) => {
      // Перемотали назад: те же комментарии можно показать снова.
      if (t < last.current - 2) shown.current.clear()
      last.current = t
      const due = cues.filter((c) => !shown.current.has(c.id) && t >= c.at && t - c.at < 2)
      if (!due.length) return
      due.forEach((c) => shown.current.add(c.id))
      setFlying((prev) => [...prev, ...due.map((c) => ({ ...c, lane: lane.current++ % LANES }))].slice(-12))
    })
  }, [on, cues])

  if (!cues.length) return null
  return (
    <>
      {on && (
        <div className="danmaku" aria-hidden="true">
          {flying.map((f) => (
            <span
              key={f.id}
              className="danmaku__item"
              style={{ top: `${8 + f.lane * 11}%` }}
              onAnimationEnd={() => setFlying((prev) => prev.filter((x) => x.id !== f.id))}
            >
              {f.text}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`danmaku__toggle${on ? ' is-on' : ''}`}
        aria-pressed={on}
        title={on ? 'Скрыть комментарии поверх видео' : 'Показывать комментарии поверх видео'}
        onClick={() => danmakuStore.set(!on)}
      >
        💬 {cues.length}
      </button>
    </>
  )
}

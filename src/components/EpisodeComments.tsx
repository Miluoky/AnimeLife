import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { CommunityError } from '../data/community'
import { deleteComment, loadComments, saveComment, type EpisodeComment } from '../data/comments'
import { markFlag } from '../data/flags'
import { toast } from '../data/toast'
import './comments.css'

const when = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })
function ago(t: number) {
  const min = Math.round((t - Date.now()) / 60_000)
  if (min > -60) return when.format(min, 'minute')
  const h = Math.round(min / 60)
  if (h > -24) return when.format(h, 'hour')
  return when.format(Math.round(h / 24), 'day')
}

// Время в тексте: 12:34 или 1:02:03. Секунды и минуты (кроме первых) — ровно две цифры.
const TIMECODE = /\b(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)\b/g

const two = (n: number) => String(Math.floor(n)).padStart(2, '0')
const stampOf = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two((s % 3600) / 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`)

/** Наш плеер на странице. У Kodik и других встроенных плееров видео в чужом фрейме, им не управляем. */
const playerVideo = () => document.querySelector<HTMLVideoElement>('video.player-video')

function seek(seconds: number) {
  const video = playerVideo()
  if (!video) return toast('Перейти к моменту можно, когда серия идёт в нашем плеере')
  video.currentTime = Math.min(seconds, video.duration || seconds)
  video.closest('.video-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  void video.play().catch(() => undefined)
}

/** Текст комментария, где таймкоды — кнопки «перейти к моменту». */
function WithTimecodes({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(TIMECODE)) {
    const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
    out.push(text.slice(last, m.index))
    out.push(
      <button key={m.index} type="button" className="comment__time" onClick={() => seek(seconds)} aria-label={`Перейти к ${m[0]}`}>
        {m[0]}
      </button>,
    )
    last = (m.index ?? 0) + m[0].length
  }
  out.push(text.slice(last))
  return <>{out}</>
}

/** Обсуждение конкретной серии под плеером. Спойлеры скрыты, пока не нажмёшь. */
export default function EpisodeComments({ animeId, episode }: { animeId: string; episode: number }) {
  const { user } = useAuth()
  const [items, setItems] = useState<EpisodeComment[] | null>(null)
  const [text, setText] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const field = useRef<HTMLTextAreaElement>(null)
  const isAdmin = !!user?.labels?.includes('admin')

  useEffect(() => {
    let alive = true
    setItems(null)
    loadComments(animeId, episode)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [animeId, episode])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const c = await saveComment(animeId, episode, text, spoiler)
      setItems((list) => [c, ...(list ?? [])])
      setText('')
      setSpoiler(false)
      markFlag('commented')
    } catch (err) {
      toast(err instanceof CommunityError ? err.message : 'Не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  // Вставляет текущее время серии туда, где курсор: из него получится ссылка на момент.
  const insertTime = () => {
    const video = playerVideo()
    if (!video) return toast('Время можно вставить, когда серия идёт в нашем плеере')
    const stamp = stampOf(video.currentTime || 0)
    const el = field.current
    const at = el?.selectionStart ?? text.length
    const before = text.slice(0, at)
    const piece = `${before && !/\s$/.test(before) ? ' ' : ''}${stamp} `
    setText(before + piece + text.slice(el?.selectionEnd ?? at))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + piece.length, at + piece.length)
    })
  }

  const remove = async (id: string) => {
    try {
      await deleteComment(id)
      setItems((list) => list?.filter((c) => c.$id !== id) ?? null)
    } catch (err) {
      toast(err instanceof CommunityError ? err.message : 'Не удалось убрать')
    }
  }

  return (
    <section className="stack comments" aria-label={`Обсуждение серии ${episode}`}>
      <div className="section-head">
        <h2 style={{ fontSize: 20 }}>Обсуждение серии {episode}</h2>
        {items && <span className="muted">{items.length}</span>}
      </div>
      {user ? (
        <form className="stack comments__form" onSubmit={submit}>
          <textarea
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Что думаете о серии? Время вроде 12:34 станет ссылкой на момент"
            aria-label="Комментарий к серии"
          />
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <div className="comments__tools">
              <label className="appearance__toggle">
                <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />
                <span>Спойлер</span>
              </label>
              <button type="button" className="link-btn" onClick={insertTime}>
                Вставить время
              </button>
            </div>
            <button type="submit" className="btn btn--accent btn--small" disabled={busy || text.trim().length < 2}>
              {busy ? 'Отправляем…' : 'Отправить'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">
          <Link to="/account" className="link-accent">
            Войдите
          </Link>
          , чтобы обсуждать серии.
        </p>
      )}
      {items === null ? (
        <div className="skeleton skeleton--line" style={{ height: 64 }} aria-busy="true" />
      ) : items.length === 0 ? (
        <p className="muted">Пока никто не написал. Будьте первым!</p>
      ) : (
        <ul className="comments__list">
          {items.map((c) => {
            const hidden = c.spoiler && !shown.has(c.$id)
            return (
              <li key={c.$id} className="comment">
                <div className="comment__head">
                  <strong>{c.name}</strong>
                  <span className="muted">{ago(c.at)}</span>
                  {c.spoiler && <span className="comment__tag">спойлер</span>}
                  {(c.userId === user?.$id || isAdmin) && (
                    <button type="button" className="comment__delete" onClick={() => void remove(c.$id)}>
                      Убрать
                    </button>
                  )}
                </div>
                {hidden ? (
                  <button
                    type="button"
                    className="comment__spoiler"
                    onClick={() => setShown((s) => new Set(s).add(c.$id))}
                  >
                    Показать спойлер
                  </button>
                ) : (
                  <p>
                    <WithTimecodes text={c.text} />
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

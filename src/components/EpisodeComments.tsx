import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { CommunityError } from '../data/community'
import { deleteComment, loadComments, reportComment, saveComment, type EpisodeComment } from '../data/comments'
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

/**
 * Ветки обсуждения: комментарии верхнего уровня (свежие сверху), под каждым ответы по порядку.
 * Ответ на ответ встаёт в ту же ветку; если исходный комментарий убрали, ответ показывается сам по себе.
 */
function threads(items: EpisodeComment[]) {
  const byId = new Map(items.map((c) => [c.$id, c]))
  const rootOf = (c: EpisodeComment) => {
    let cur = c
    for (let i = 0; i < 20 && cur.replyTo && byId.has(cur.replyTo); i++) cur = byId.get(cur.replyTo)!
    return cur
  }
  const replies = new Map<string, EpisodeComment[]>()
  const roots: EpisodeComment[] = []
  for (const c of items) {
    const root = rootOf(c)
    if (root === c) roots.push(c)
    else replies.set(root.$id, [...(replies.get(root.$id) ?? []), c])
  }
  return roots.map((comment) => ({ comment, replies: (replies.get(comment.$id) ?? []).sort((a, b) => a.at - b.at) }))
}

/** Обсуждение конкретной серии под плеером. Спойлеры скрыты, пока не нажмёшь. */
export default function EpisodeComments({ animeId, episode }: { animeId: string; episode: number }) {
  const { user } = useAuth()
  const [items, setItems] = useState<EpisodeComment[] | null>(null)
  const [text, setText] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [reported, setReported] = useState<Set<string>>(new Set())
  const field = useRef<HTMLTextAreaElement>(null)
  const isAdmin = !!user?.labels?.includes('admin')
  // На какой комментарий отвечаем: ответ встанет под ним, а автор получит уведомление.
  const [replyTo, setReplyTo] = useState<EpisodeComment | null>(null)

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

  // Ссылка из уведомления (#c-<id>): прокручиваем к комментарию и подсвечиваем его.
  // Кнопка «Обсудить» из Telegram-канала (#comments): прокручиваем к обсуждению, когда оно загрузилось.
  useEffect(() => {
    if (items && location.hash === '#comments') document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const id = location.hash.startsWith('#c-') ? location.hash.slice(3) : ''
    if (!items || !id) return
    const el = document.getElementById(`c-${id}`)
    if (!el) return
    el.classList.add('comment--target')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [items])

  const startReply = (c: EpisodeComment) => {
    setReplyTo(c)
    requestAnimationFrame(() => field.current?.focus())
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const c = await saveComment(animeId, episode, text, spoiler, replyTo?.$id)
      setItems((list) => [c, ...(list ?? [])])
      setText('')
      setSpoiler(false)
      setReplyTo(null)
      markFlag('commented')
      if (c.hidden) toast('Комментарий виден только вам, пока его не проверит модератор: в нём мат или ссылка на другой сайт')
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

  const report = async (id: string) => {
    if (!window.confirm('Пожаловаться на комментарий? Модератор проверит его.')) return
    try {
      const res = await reportComment(id)
      setReported((s) => new Set(s).add(id))
      if (res.hidden) setItems((list) => list?.filter((c) => c.$id !== id) ?? null)
      toast(res.already ? 'Вы уже жаловались на этот комментарий' : 'Жалоба отправлена, спасибо')
    } catch (err) {
      toast(err instanceof CommunityError ? err.message : 'Не удалось отправить жалобу')
    }
  }

  function renderComment(c: EpisodeComment) {
    const hidden = c.spoiler && !shown.has(c.$id)
    return (
      <div id={`c-${c.$id}`} className="comment">
        <div className="comment__head">
          <strong>{c.name}</strong>
          {c.replyName && <span className="muted comment__to">ответ для {c.replyName}</span>}
          <span className="muted">{ago(c.at)}</span>
          {c.spoiler && <span className="comment__tag">спойлер</span>}
          {c.hidden && <span className="comment__tag">на проверке</span>}
          {user && c.userId !== user.$id && (
            <button type="button" className="comment__delete" onClick={() => startReply(c)}>
              Ответить
            </button>
          )}
          {(c.userId === user?.$id || isAdmin) && (
            <button type="button" className="comment__delete" onClick={() => void remove(c.$id)}>
              Убрать
            </button>
          )}
          {user && c.userId !== user.$id && !isAdmin && (
            <button type="button" className="comment__delete" disabled={reported.has(c.$id)} onClick={() => void report(c.$id)}>
              {reported.has(c.$id) ? 'Жалоба отправлена' : 'Пожаловаться'}
            </button>
          )}
        </div>
        {hidden ? (
          <button type="button" className="comment__spoiler" onClick={() => setShown((s) => new Set(s).add(c.$id))}>
            Показать спойлер
          </button>
        ) : (
          <p>
            <WithTimecodes text={c.text} />
          </p>
        )}
      </div>
    )
  }

  return (
    <section id="comments" className="stack comments" aria-label={`Обсуждение серии ${episode}`}>
      <div className="section-head">
        <h2 style={{ fontSize: 20 }}>Обсуждение серии {episode}</h2>
        {items && <span className="muted">{items.length}</span>}
      </div>
      {user ? (
        <form className="stack comments__form" onSubmit={submit}>
          {replyTo && (
            <p className="comments__reply-to">
              Ответ для <strong>{replyTo.name}</strong>
              <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>
                Отменить
              </button>
            </p>
          )}
          <textarea
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Что думаете о серии? Время вроде 12:34 станет ссылкой на момент"
            aria-label={replyTo ? `Ответ для ${replyTo.name}` : 'Комментарий к серии'}
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
          {threads(items).map(({ comment, replies }) => (
            <li key={comment.$id} className="comment-thread">
              {renderComment(comment)}
              {replies.length > 0 && <ul className="comments__replies">{replies.map((r) => <li key={r.$id}>{renderComment(r)}</li>)}</ul>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

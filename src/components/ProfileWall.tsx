import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../data/auth'
import {
  type WallComment,
  fetchWallComments,
  removeWallPost,
  sendWallPost,
  toggleWallPostLike,
  wallCacheStore,
} from '../data/profileWall'
import { Avatar, ago } from './socialUi'
import { toast } from '../data/toast'

export type { WallComment }

export default function ProfileWall({ profileId, profileName }: { profileId: string; profileName: string }) {
  const { user } = useAuth()
  const formRef = useRef<HTMLFormElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [comments, setComments] = useState<WallComment[]>(() => wallCacheStore.get()[profileId] || [])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void fetchWallComments(profileId).then((res) => {
      if (active) setComments(res)
    })
    return () => {
      active = false
    }
  }, [profileId])

  const canDelete = (c: WallComment) =>
    Boolean(
      user &&
        (c.userId === user.$id ||
          profileId === user.$id ||
          (user.labels && Array.isArray(user.labels) && user.labels.includes('admin'))),
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    if (!user) {
      toast('Войдите в аккаунт, чтобы оставить запись на стене')
      return
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const authorName = user.name || user.email?.split('@')[0] || 'Зритель'

    const optimistic: WallComment = {
      id: tempId,
      profileId,
      userId: user.$id,
      name: authorName,
      text: trimmed,
      at: Date.now(),
      likes: 0,
      liked: false,
      replyToName: replyTo ?? undefined,
      pending: true,
    }

    setComments((prev) => [optimistic, ...prev])
    setText('')
    const targetReply = replyTo
    setReplyTo(null)
    setSubmitting(true)

    try {
      const { comment, held } = await sendWallPost({
        profileId,
        text: trimmed,
        replyToName: targetReply ?? undefined,
      })

      setComments((prev) => prev.map((c) => (c.id === tempId ? comment : c)))
      if (held) {
        toast('Запись отправлена на проверку модератору')
      } else {
        toast('Запись добавлена на стену')
      }
    } catch (err: any) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setText(trimmed)
      setReplyTo(targetReply)
      toast(err?.message || 'Не удалось опубликовать запись')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleLike = async (comment: WallComment) => {
    if (!user) {
      toast('Войдите в аккаунт, чтобы ставить лайки')
      return
    }

    const prevLiked = Boolean(comment.liked)
    const prevLikes = comment.likes ?? 0
    const nextLiked = !prevLiked
    const nextLikes = Math.max(0, prevLikes + (nextLiked ? 1 : -1))

    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, liked: nextLiked, likes: nextLikes } : c)),
    )

    try {
      const res = await toggleWallPostLike(comment.id, profileId)
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, liked: res.liked, likes: res.likes } : c)),
      )
    } catch (err: any) {
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, liked: prevLiked, likes: prevLikes } : c)),
      )
      toast(err?.message || 'Не удалось обновить лайк')
    }
  }

  const deleteComment = async (comment: WallComment) => {
    if (!window.confirm('Удалить эту запись со стены?')) return

    const prev = comments
    setComments((curr) => curr.filter((c) => c.id !== comment.id))

    try {
      await removeWallPost(comment.id, profileId)
      toast('Запись удалена')
    } catch (err: any) {
      setComments(prev)
      toast(err?.message || 'Не удалось удалить запись')
    }
  }

  const onReply = (authorName: string) => {
    setReplyTo(authorName)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    textareaRef.current?.focus()
  }

  return (
    <section className="pf-wall-wrap">
      <h2 className="pf-wall__title">
        Комментарии на стене профиля <span className="pf-wall__count">{comments.length}</span>
      </h2>

      <form ref={formRef} className="pf-wall-form" onSubmit={submit}>
        <Avatar name={user?.name || 'Я'} size={40} />
        <div className="pf-wall-form__main">
          {replyTo && (
            <div className="pf-wall-reply" role="status">
              <span>Ответ для {replyTo}</span>
              <button type="button" className="link-btn pf-wall-reply__cancel" onClick={() => setReplyTo(null)}>
                ✕ отмена
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="pf-wall-input"
            placeholder={
              user ? `Напиши что-нибудь на стене ${profileName}…` : 'Войдите в аккаунт, чтобы оставить запись…'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            disabled={submitting}
          />
          <div className="pf-wall-form__actions">
            <button
              type="submit"
              className="btn btn--accent btn--small"
              disabled={!text.trim() || submitting}
            >
              {submitting ? 'Отправка…' : 'Опубликовать'}
            </button>
          </div>
        </div>
      </form>

      <ul className="pf-wall-comments">
        {comments.map((c) => {
          const isLiked = Boolean(c.liked)
          return (
            <li key={c.id} className={`pf-wall-comment ${c.pending ? 'is-pending' : ''}`}>
              <Avatar name={c.name} avatarUrl={c.avatarUrl} frame={c.frame} size={42} />
              <div className="pf-wall-comment__body">
                <div className="pf-wall-comment__top">
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  {c.replyToName && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      ответил(а) {c.replyToName}
                    </span>
                  )}
                  {c.hidden && (
                    <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                      [на проверке]
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {ago(c.at)}
                  </span>
                </div>
                <p className="pf-wall-comment__text">{c.text}</p>
                <div className="pf-wall-comment__actions">
                  <button
                    type="button"
                    className={`pf-wall-comment__act${isLiked ? ' pf-wall-comment__act--liked' : ''}`}
                    aria-label={isLiked ? 'Убрать лайк' : 'Поставить лайк'}
                    onClick={() => toggleLike(c)}
                    disabled={c.pending}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={isLiked ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span>{c.likes > 0 ? c.likes : 'Нравится'}</span>
                  </button>

                  <button
                    type="button"
                    className="pf-wall-comment__act"
                    onClick={() => onReply(c.name)}
                    disabled={c.pending}
                  >
                    Ответить
                  </button>

                  {canDelete(c) && (
                    <button
                      type="button"
                      className="pf-wall-comment__act"
                      style={{ color: 'var(--muted)', marginLeft: 'auto' }}
                      title="Удалить запись со стены"
                      onClick={() => deleteComment(c)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span>Удалить</span>
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}

        {!comments.length && (
          <li className="pf-wall-empty">
            <p>На этой стене пока нет записей. Будьте первым, кто оставит комментарий!</p>
          </li>
        )}
      </ul>
    </section>
  )
}

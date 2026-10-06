import './community-chat.css'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SendIcon } from '../components/Icons'
import { CommunityError } from '../data/community'
import { useAuth } from '../data/auth'
import {
  COMMUNITY_CHAT_LIMIT,
  deleteCommunityChatMessage,
  loadCommunityChat,
  reportCommunityChatMessage,
  sendCommunityChatMessage,
  subscribeCommunityChat,
  type CommunityChatMessage,
} from '../data/communityChat'
import { usePageMeta } from '../data/pageMeta'

const relativeTime = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })

function timeLabel(at: number) {
  const minutes = Math.round((at - Date.now()) / 60_000)
  if (minutes > -60) return relativeTime.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return relativeTime.format(hours, 'hour')
  return relativeTime.format(Math.round(hours / 24), 'day')
}

function mergeMessages(current: CommunityChatMessage[], incoming: CommunityChatMessage[]) {
  const unique = new Map(current.map((message) => [message.$id, message]))
  for (const message of incoming) unique.set(message.$id, message)
  return [...unique.values()].sort((a, b) => a.at - b.at).slice(-COMMUNITY_CHAT_LIMIT)
}

export default function CommunityChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<CommunityChatMessage[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reported, setReported] = useState<Set<string>>(new Set())
  const list = useRef<HTMLOListElement>(null)
  const stickToBottom = useRef(true)
  const isAdmin = !!user?.labels?.includes('admin')
  usePageMeta('Общий чат сообщества Anime Life')

  useEffect(() => {
    let alive = true
    const unsubscribe = subscribeCommunityChat({
      onMessage: (message) =>
        setMessages((current) =>
          message.hidden ? current?.filter((item) => item.$id !== message.$id) ?? null : mergeMessages(current ?? [], [message]),
        ),
      onDelete: (id) => setMessages((current) => current?.filter((message) => message.$id !== id) ?? null),
    })
    void loadCommunityChat()
      .then((loaded) => alive && setMessages((current) => mergeMessages(loaded, current ?? [])))
      .catch(() => alive && setError('Не удалось загрузить сообщения. Попробуйте обновить страницу.'))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (stickToBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [messages?.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const message = await sendCommunityChatMessage(text)
      setMessages((current) => mergeMessages(current ?? [], [message]))
      setDraft('')
    } catch (cause) {
      setError(cause instanceof CommunityError ? cause.message : 'Не удалось отправить сообщение.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(messageId: string) {
    try {
      await deleteCommunityChatMessage(messageId)
      setMessages((current) => current?.filter((message) => message.$id !== messageId) ?? null)
    } catch (cause) {
      setError(cause instanceof CommunityError ? cause.message : 'Не удалось удалить сообщение.')
    }
  }

  async function report(messageId: string) {
    try {
      const result = await reportCommunityChatMessage(messageId)
      setReported((current) => new Set(current).add(messageId))
      if (result.hidden) setMessages((current) => current?.filter((message) => message.$id !== messageId) ?? null)
    } catch (cause) {
      setError(cause instanceof CommunityError ? cause.message : 'Не удалось отправить жалобу.')
    }
  }

  return (
    <main className="container community-page">
      <header className="community-page__heading">
        <div>
          <span className="eyebrow">Сообщество Anime Life</span>
          <h1>Общий чат</h1>
          <p className="muted">Обсуждайте сезон, делитесь находками и знакомьтесь с другими зрителями.</p>
        </div>
        <Link to="/together" className="btn btn--ghost">
          Смотреть вместе
        </Link>
      </header>

      <section className="community-chat" aria-label="Общий чат сообщества">
        <div className="community-chat__bar">
          <span className="community-chat__live"><span aria-hidden="true" /> В эфире</span>
          <span className="muted">Последние {COMMUNITY_CHAT_LIMIT} сообщений · обновляется автоматически</span>
        </div>

        <ol
          className="community-chat__messages"
          ref={list}
          aria-live="polite"
          aria-relevant="additions removals"
          aria-busy={messages === null}
          onScroll={(event) => {
            const element = event.currentTarget
            stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
          }}
        >
          {messages === null ? (
            <li className="community-chat__state" role="status">Загружаем беседу…</li>
          ) : messages.length === 0 ? (
            <li className="community-chat__state">Пока тихо. Поздоровайтесь первым!</li>
          ) : (
            messages.map((message) => (
              <li key={message.$id} className={`community-chat__message${message.userId === user?.$id ? ' community-chat__message--mine' : ''}`}>
                <div className="community-chat__message-head">
                  <strong>{message.name}</strong>
                  <time dateTime={new Date(message.at).toISOString()}>{timeLabel(message.at)}</time>
                  {(message.userId === user?.$id || isAdmin) && (
                    <button
                      type="button"
                      className="community-chat__delete"
                      aria-label={`Удалить сообщение от ${message.name}`}
                      title="Удалить сообщение"
                      onClick={() => void remove(message.$id)}
                    >
                      ×
                    </button>
                  )}
                  {user && !isAdmin && message.userId !== user.$id && (
                    <button
                      type="button"
                      className="community-chat__report"
                      disabled={reported.has(message.$id)}
                      onClick={() => void report(message.$id)}
                    >
                      {reported.has(message.$id) ? 'Жалоба отправлена' : 'Пожаловаться'}
                    </button>
                  )}
                </div>
                <p>{message.text}</p>
              </li>
            ))
          )}
        </ol>

        <div className="community-chat__composer">
          {error && <p className="community-chat__error" role="alert">{error}</p>}
          {user ? (
            <form onSubmit={submit}>
              <label className="sr-only" htmlFor="community-chat-message">Сообщение</label>
              <input
                id="community-chat-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={500}
                placeholder="Напишите сообщение…"
                autoComplete="off"
              />
              <span className="community-chat__counter">{draft.length}/500</span>
              <button className="btn btn--accent" type="submit" aria-label="Отправить сообщение" disabled={busy || !draft.trim()}>
                <SendIcon />
                Отправить
              </button>
            </form>
          ) : (
            <p className="community-chat__login">
              <Link to="/account" className="link-accent">Войдите</Link>, чтобы написать в чат.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
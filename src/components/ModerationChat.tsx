import './reviews.css'
import { useEffect, useState } from 'react'
import {
  loadCommunityChatModeration,
  moderateCommunityChatMessage,
  type CommunityChatMessage,
} from '../data/communityChat'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function ModerationChat() {
  const [messages, setMessages] = useState<CommunityChatMessage[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    loadCommunityChatModeration()
      .then(setMessages)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Не получилось загрузить сообщения.'))
  }, [])

  async function act(message: CommunityChatMessage, decision: 'hide' | 'show' | 'delete') {
    setBusy(message.$id)
    setError('')
    try {
      const result = await moderateCommunityChatMessage(message.$id, decision)
      setMessages((list = []) =>
        decision === 'delete'
          ? list.filter((item) => item.$id !== message.$id)
          : list.map((item) => (item.$id === message.$id ? { ...item, ...result.message } : item)),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не получилось выполнить действие.')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <>
      <p className="muted">
        После трёх жалоб сообщение скрывается автоматически. «Оставить» возвращает его в чат и отключает повторное автоскрытие.
      </p>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {!messages ? (
        !error && <div className="skeleton skeleton--line" aria-busy="true" />
      ) : !messages.length ? (
        <p className="muted">Жалоб нет.</p>
      ) : (
        <div className="stack reviews">
          {messages.map((message) => (
            <article key={message.$id} className={`review${message.hidden ? ' review--hidden' : ''}`}>
              <header className="review__head">
                <span className="review__who">
                  <strong>{message.name || 'Зритель'}</strong>
                  <span className="muted">
                    {dateFormat.format(new Date(message.at))} · жалоб: {message.reports ?? 0}
                    {message.hidden ? ' · скрыто' : ''}
                  </span>
                </span>
              </header>
              <p className="review__text">{message.text}</p>
              <div className="review-form__row">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy === message.$id}
                  onClick={() => void act(message, message.hidden ? 'show' : 'hide')}
                >
                  {message.hidden ? 'Оставить' : 'Скрыть'}
                </button>
                <button
                  type="button"
                  className="btn btn--accent btn--small"
                  disabled={busy === message.$id}
                  onClick={() => void act(message, 'delete')}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
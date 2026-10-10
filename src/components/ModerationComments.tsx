import './reviews.css'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadCommentModeration, moderateComment, type EpisodeComment } from '../data/comments'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Вкладка модерации «Комментарии»: комментарии к сериям с жалобами и скрытые. Права проверяет функция. */
export default function ModerationComments() {
  const [comments, setComments] = useState<EpisodeComment[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    loadCommentModeration()
      .then(setComments)
      .catch((e) => setError(e instanceof Error ? e.message : 'Не получилось загрузить комментарии.'))
  }, [])

  async function act(comment: EpisodeComment, decision: 'hide' | 'show' | 'delete') {
    setBusy(comment.$id)
    setError('')
    try {
      const res = await moderateComment(comment.$id, decision)
      setComments((list = []) =>
        decision === 'delete'
          ? list.filter((c) => c.$id !== comment.$id)
          : list.map((c) => (c.$id === comment.$id ? { ...c, ...res.comment } : c)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось.')
    }
    setBusy(undefined)
  }

  return (
    <>
      <p className="muted">
        Здесь комментарии к сериям с жалобами. После трёх жалоб комментарий скрывается сам, пока вы его не проверите.
        «Оставить» показывает его снова, и новые жалобы его больше не скроют.
      </p>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {!comments ? (
        !error && <div className="skeleton skeleton--line" aria-busy="true" />
      ) : !comments.length ? (
        <p className="muted">Жалоб нет.</p>
      ) : (
        <div className="stack reviews">
          {comments.map((c) => (
            <article key={c.$id} className={`review${c.hidden ? ' review--hidden' : ''}`}>
              <header className="review__head">
                <span className="review__who">
                  <strong>{c.name || 'Зритель'}</strong>
                  <span className="muted">
                    <Link to={`/watch/${c.animeId}/${c.episode}`}>
                      Тайтл {c.animeId}, серия {c.episode}
                    </Link>{' '}
                    · {dateFormat.format(new Date(c.at))} · жалоб: {c.reports ?? 0}
                    {c.hidden ? ' · скрыт' : ''}
                  </span>
                </span>
              </header>
              <p className="review__text">{c.text}</p>
              <div className="review-form__row">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy === c.$id}
                  onClick={() => act(c, c.hidden ? 'show' : 'hide')}
                >
                  {c.hidden ? 'Оставить' : 'Скрыть'}
                </button>
                <button
                  type="button"
                  className="btn btn--accent btn--small"
                  disabled={busy === c.$id}
                  onClick={() => act(c, 'delete')}
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

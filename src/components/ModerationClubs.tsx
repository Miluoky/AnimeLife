import './reviews.css'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadClubModeration, moderateClubPost, type ClubModPost } from '../data/clubs'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function ModerationClubs() {
  const [posts, setPosts] = useState<ClubModPost[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    loadClubModeration()
      .then(setPosts)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Не получилось загрузить посты клубов.'))
  }, [])

  async function act(post: ClubModPost, decision: 'hide' | 'show' | 'delete') {
    setBusy(post.$id)
    setError('')
    try {
      const result = await moderateClubPost(post.$id, decision)
      setPosts((list = []) =>
        decision === 'delete'
          ? list.filter((item) => item.$id !== post.$id)
          : list.map((item) => (item.$id === post.$id ? { ...item, ...result.post } : item)),
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
        Посты клубов с жалобами. После трёх жалоб запись скрывается сама, пока вы её не проверите. «Оставить» возвращает пост и отключает
        повторное автоскрытие.
      </p>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {!posts ? (
        !error && <div className="skeleton skeleton--line" aria-busy="true" />
      ) : !posts.length ? (
        <p className="muted">Жалоб нет.</p>
      ) : (
        <div className="stack reviews">
          {posts.map((post) => (
            <article key={post.$id} className={`review${post.hidden ? ' review--hidden' : ''}`}>
              <header className="review__head">
                <span className="review__who">
                  <strong>{post.name || 'Участник'}</strong>
                  <span className="muted">
                    <Link to={`/clubs/${post.clubId}`}>Клуб</Link> · <Link to={`/u/${post.userId}`}>автор</Link> ·{' '}
                    {dateFormat.format(new Date(post.at))} · жалоб: {post.reports ?? 0}
                    {post.hidden ? ' · скрыт' : ''}
                  </span>
                </span>
              </header>
              <p className="review__text">{post.text}</p>
              <div className="review-form__row">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={busy === post.$id}
                  onClick={() => void act(post, post.hidden ? 'show' : 'hide')}
                >
                  {post.hidden ? 'Оставить' : 'Скрыть'}
                </button>
                <button
                  type="button"
                  className="btn btn--accent btn--small"
                  disabled={busy === post.$id}
                  onClick={() => void act(post, 'delete')}
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

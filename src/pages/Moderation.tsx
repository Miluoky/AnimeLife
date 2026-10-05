import { Link, useSearchParams } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useAuth } from '../data/auth'
import { loadModeration, moderateReview, type Review } from '../data/community'

// Обращения правообладателей и из «Контактов» — отдельная часть, грузится при открытии вкладки.
const ModerationTakedowns = lazy(() => import('../components/ModerationTakedowns'))
const ModerationComments = lazy(() => import('../components/ModerationComments'))

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/**
 * Модерация: отзывы с жалобами и скрытые (оставить, скрыть, удалить), то же для комментариев к сериям (?tab=comments)
 * и обращения с форм сайта (?tab=takedowns).
 * Права проверяет функция.
 */
export default function Moderation() {
  const { user, checking } = useAuth()
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab = asked === 'takedowns' || asked === 'comments' ? asked : 'reviews'
  const [reviews, setReviews] = useState<Review[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()
  const isAdmin = !!user?.labels?.includes('admin')

  useEffect(() => {
    if (!isAdmin || tab !== 'reviews' || reviews) return
    loadModeration()
      .then(setReviews)
      .catch((e) => setError(e instanceof Error ? e.message : 'Не получилось загрузить отзывы.'))
  }, [isAdmin, tab, reviews])

  async function act(review: Review, decision: 'hide' | 'show' | 'delete') {
    setBusy(review.$id)
    setError('')
    try {
      const res = await moderateReview(review.$id, decision)
      setReviews((list = []) =>
        decision === 'delete'
          ? list.filter((r) => r.$id !== review.$id)
          : list.map((r) => (r.$id === review.$id ? { ...r, ...res.review } : r)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось.')
    }
    setBusy(undefined)
  }

  if (checking) return <main className="container empty-page" aria-busy="true" />

  const tabs = (
    <div className="chips" role="tablist" aria-label="Разделы модерации">
      {(
        [
          ['reviews', 'Отзывы'],
          ['comments', 'Комментарии'],
          ['takedowns', 'Обращения'],
        ] as const
      ).map(([id, name]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`pill${tab === id ? ' active' : ''}`}
          onClick={() => setParams(id === 'reviews' ? {} : { tab: id }, { replace: true })}
        >
          {name}
        </button>
      ))}
    </div>
  )

  return (
    <main className="container home">
      <section className="stack">
        <h1 className="page-title">Модерация</h1>
        {!isAdmin ? (
          <p className="muted">Эта страница только для модераторов.</p>
        ) : tab !== 'reviews' ? (
          <>
            {tabs}
            <Suspense fallback={<div className="skeleton skeleton--line" aria-busy="true" />}>
              {tab === 'takedowns' ? <ModerationTakedowns /> : <ModerationComments />}
            </Suspense>
          </>
        ) : (
          <>
            {tabs}
            <p className="muted">
              Здесь отзывы с жалобами. После трёх жалоб отзыв скрывается сам, пока вы его не проверите. «Оставить»
              показывает отзыв снова, и новые жалобы его больше не скроют.
            </p>
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            {!reviews ? (
              <div className="skeleton skeleton--line" aria-busy="true" />
            ) : !reviews.length ? (
              <p className="muted">Жалоб нет.</p>
            ) : (
              <div className="stack reviews">
                {reviews.map((r) => (
                  <article key={r.$id} className={`review${r.hidden ? ' review--hidden' : ''}`}>
                    <header className="review__head">
                      <span className="review__who">
                        <strong>{r.userName || 'Зритель'}</strong>
                        <span className="muted">
                          <Link to={`/anime/${r.animeId}`}>Тайтл {r.animeId}</Link> ·{' '}
                          {dateFormat.format(new Date(r.$updatedAt))} · жалоб: {r.reports ?? 0}
                          {r.hidden ? ' · скрыт' : ''}
                        </span>
                      </span>
                    </header>
                    <p className="review__text">{r.text}</p>
                    <div className="review-form__row">
                      {r.hidden ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={busy === r.$id}
                          onClick={() => act(r, 'show')}
                        >
                          Оставить
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={busy === r.$id}
                          onClick={() => act(r, 'hide')}
                        >
                          Скрыть
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--accent btn--small"
                        disabled={busy === r.$id}
                        onClick={() => act(r, 'delete')}
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

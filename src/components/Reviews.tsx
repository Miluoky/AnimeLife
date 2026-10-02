import { Link } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../data/auth'
import { REVIEW_MAX, REVIEW_MIN, deleteReview, loadReviews, saveReview, type Review } from '../data/community'
import { setListRating, useMyList } from '../data/myList'
import { ratingTitles } from './ListButton'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })
const PREVIEW = 5

const errorText = (e: unknown) =>
  e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не получилось сохранить отзыв. Попробуйте ещё раз.'

function ReviewForm({ animeId, mine, onSaved }: { animeId: string; mine?: Review; onSaved: (r?: Review) => void }) {
  const list = useMyList()
  const entry = list.find((e) => e.anime.id === animeId)
  const [text, setText] = useState(mine?.text ?? '')
  const [rating, setRating] = useState<number | undefined>(mine?.rating ?? entry?.rating)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const length = text.trim().length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const saved = await saveReview(animeId, text, rating)
      // Оценка из отзыва попадает и в «Мой список», чтобы статистика профиля её учла.
      if (entry && rating && entry.rating !== rating) setListRating(animeId, rating)
      onSaved(saved)
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  async function onDelete() {
    setBusy(true)
    setError('')
    try {
      await deleteReview(animeId)
      onSaved(undefined)
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  return (
    <form className="review-form stack" onSubmit={onSubmit}>
      <label className="field">
        <span>{mine ? 'Ваш отзыв' : 'Напишите отзыв'}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={REVIEW_MAX}
          placeholder="Что понравилось, что нет, кому советуете. Без спойлеров, пожалуйста."
          required
        />
        <small className="muted">
          {length < REVIEW_MIN ? `Ещё хотя бы ${REVIEW_MIN - length} симв.` : `${length} из ${REVIEW_MAX}`}
        </small>
      </label>
      <div className="review-form__row">
        <label className="btn btn--ghost list-select">
          <span className="sr-only">Оценка в отзыве</span>
          <select value={rating ?? ''} onChange={(e) => setRating(Number(e.target.value) || undefined)}>
            <option value="">Без оценки</option>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                ★ {r} — {ratingTitles[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--accent" disabled={busy || length < REVIEW_MIN}>
          {busy ? 'Секунду…' : mine ? 'Сохранить' : 'Опубликовать'}
        </button>
        {mine && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onDelete}>
            Удалить
          </button>
        )}
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function ReviewCard({ review, own }: { review: Review; own: boolean }) {
  const [open, setOpen] = useState(false)
  const long = review.text.length > 600
  const edited = review.$updatedAt.slice(0, 16) !== review.$createdAt.slice(0, 16)
  return (
    <article className={`review${own ? ' review--own' : ''}`}>
      <header className="review__head">
        <span className="avatar" aria-hidden="true">
          {(review.userName || 'З').charAt(0).toUpperCase()}
        </span>
        <span className="review__who">
          <strong>{review.userName || 'Зритель'}</strong>
          <span className="muted">
            {own && 'Ваш отзыв · '}
            {dateFormat.format(new Date(review.$createdAt))}
            {edited && ' · изменён'}
          </span>
        </span>
        {review.rating ? (
          <span className="review__score" title={ratingTitles[review.rating]}>
            ★ {review.rating}
          </span>
        ) : null}
      </header>
      <p className={`review__text${long && !open ? ' clamp-6' : ''}`}>{review.text}</p>
      {long && (
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Читать полностью'}
        </button>
      )}
    </article>
  )
}

export default function Reviews({ animeId }: { animeId: string }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState<Review[]>()
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReviews(undefined)
    setFailed(false)
    loadReviews(animeId)
      .then((r) => !cancelled && setReviews(r))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [animeId])

  const mine = user ? reviews?.find((r) => r.userId === user.$id) : undefined
  const others = (reviews ?? []).filter((r) => r !== mine)
  const shown = showAll ? others : others.slice(0, PREVIEW)
  const count = reviews?.length ?? 0

  function onSaved(saved?: Review) {
    setEditing(false)
    setReviews((list = []) => {
      const rest = list.filter((r) => r.userId !== user?.$id)
      return saved ? [saved, ...rest] : rest
    })
  }

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Отзывы{count ? ` · ${count}` : ''}</h2>
      </div>

      {!user ? (
        <p className="muted">
          <Link to="/account">Войдите</Link>, чтобы написать отзыв.
        </p>
      ) : !reviews && !failed ? null : !mine || editing ? (
        <ReviewForm key={mine?.$id ?? 'new'} animeId={animeId} mine={mine} onSaved={onSaved} />
      ) : (
        <div className="stack">
          <ReviewCard review={mine} own />
          <div>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
              Изменить отзыв
            </button>
          </div>
        </div>
      )}

      {failed ? (
        <p className="muted">Не получилось загрузить отзывы.</p>
      ) : !reviews ? (
        <div className="skeleton skeleton--line" aria-busy="true" />
      ) : others.length ? (
        <div className="stack reviews">
          {shown.map((r) => (
            <ReviewCard key={r.$id} review={r} own={false} />
          ))}
          {others.length > PREVIEW && (
            <div>
              <button type="button" className="btn btn--ghost" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Свернуть' : `Все отзывы (${others.length})`}
              </button>
            </div>
          )}
        </div>
      ) : (
        !mine && <p className="muted">Отзывов пока нет. Станьте первым!</p>
      )}
    </section>
  )
}

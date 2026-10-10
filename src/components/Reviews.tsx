import './reviews.css'
import { Link } from 'react-router-dom'
import { markFlag } from '../data/flags'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../data/auth'
import {
  REVIEW_MAX,
  REVIEW_MIN,
  deleteReview,
  likeReview,
  loadMyVotes,
  loadReviews,
  reportReview,
  saveReview,
  type MyVotes,
  type Review,
} from '../data/community'
import { setListRating, useMyList } from '../data/myList'
import { ratingTitles } from './ListButton'
import Turnstile, { captchaEnabled } from './Turnstile'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })
const PREVIEW = 5

const errorText = (e: unknown, fallback = 'Не получилось сохранить отзыв. Попробуйте ещё раз.') =>
  e instanceof Error && e.name === 'CommunityError' ? e.message : fallback

function ReviewForm({ animeId, mine, onSaved }: { animeId: string; mine?: Review; onSaved: (r?: Review) => void }) {
  const list = useMyList()
  const entry = list.find((e) => e.anime.id === animeId)
  const [text, setText] = useState(mine?.text ?? '')
  const [rating, setRating] = useState<number | undefined>(mine?.rating ?? entry?.rating)
  const [captcha, setCaptcha] = useState<string>()
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const length = text.trim().length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const saved = await saveReview(animeId, text, rating, captcha)
      markFlag('wroteReview')
      // Оценка из отзыва попадает и в «Мой список», чтобы статистика профиля её учла.
      if (entry && rating && entry.rating !== rating) setListRating(animeId, rating)
      onSaved(saved)
    } catch (err) {
      setError(errorText(err))
      // Токен капчи одноразовый: после попытки нужен новый.
      setCaptcha(undefined)
      setCaptchaKey((k) => k + 1)
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
      <Turnstile key={captchaKey} onToken={setCaptcha} />
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
        <button
          type="submit"
          className="btn btn--accent"
          disabled={busy || length < REVIEW_MIN || (captchaEnabled && !captcha)}
        >
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

function ReportButton({ review, onReported }: { review: Review; onReported: (hidden: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [captcha, setCaptcha] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try {
      const res = await reportReview(review.$id, captcha)
      onReported(!!res.hidden)
    } catch (e) {
      setError(errorText(e, 'Не получилось отправить жалобу.'))
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button type="button" className="link-btn link-btn--muted" onClick={() => setOpen(true)}>
        Пожаловаться
      </button>
    )
  }
  return (
    <div className="report-box">
      <span>Отзыв нарушает правила: спам, оскорбления или спойлеры?</span>
      <Turnstile onToken={setCaptcha} />
      <div className="review-form__row">
        <button
          type="button"
          className="btn btn--accent btn--small"
          disabled={busy || (captchaEnabled && !captcha)}
          onClick={send}
        >
          {busy ? 'Секунду…' : 'Отправить жалобу'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

interface CardProps {
  review: Review
  own: boolean
  /** null: гость, кнопки «Полезно» и жалобы ведут ко входу */
  votes: MyVotes | null
  onVotes: (next: Partial<Review>, votes: MyVotes) => void
}

function ReviewCard({ review, own, votes, onVotes }: CardProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const long = review.text.length > 600
  const edited = review.$updatedAt.slice(0, 16) !== review.$createdAt.slice(0, 16)
  const liked = !!votes?.liked.includes(review.$id)
  const reported = !!votes?.reported.includes(review.$id)
  const likes = review.likes ?? 0

  async function toggleLike() {
    if (!votes) return
    setBusy(true)
    setError('')
    try {
      const res = await likeReview(review.$id)
      onVotes(
        { likes: res.likes },
        { ...votes, liked: res.liked ? [...votes.liked, review.$id] : votes.liked.filter((id) => id !== review.$id) },
      )
    } catch (e) {
      setError(errorText(e, 'Не получилось отметить отзыв.'))
    }
    setBusy(false)
  }

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
      {own && review.hidden && (
        <p className="notice notice--error">
          Отзыв скрыт после жалоб и виден только вам. Исправьте его, и модератор проверит ещё раз.
        </p>
      )}
      <p className={`review__text${long && !open ? ' clamp-6' : ''}`}>{review.text}</p>
      {long && (
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Читать полностью'}
        </button>
      )}
      <footer className="review__actions">
        {own || !votes ? (
          likes > 0 && <span className="muted">👍 Полезно: {likes}</span>
        ) : (
          <button
            type="button"
            className={`chip-btn${liked ? ' chip-btn--on' : ''}`}
            aria-pressed={liked}
            disabled={busy}
            onClick={toggleLike}
          >
            👍 Полезно{likes ? ` · ${likes}` : ''}
          </button>
        )}
        {!own &&
          votes &&
          (reported ? (
            <span className="muted">Жалоба отправлена</span>
          ) : (
            <ReportButton
              review={review}
              onReported={(hidden) => onVotes({ hidden }, { ...votes, reported: [...votes.reported, review.$id] })}
            />
          ))}
      </footer>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}

type Sort = 'useful' | 'new'

export default function Reviews({ animeId }: { animeId: string }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState<Review[]>()
  const [votes, setVotes] = useState<MyVotes | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<Sort>('useful')
  const userId = user?.$id

  useEffect(() => {
    let cancelled = false
    setReviews(undefined)
    setFailed(false)
    setVotes(null)
    loadReviews(animeId, userId)
      .then((r) => !cancelled && setReviews(r))
      .catch(() => !cancelled && setFailed(true))
    if (userId) {
      loadMyVotes(animeId)
        .then((v) => !cancelled && setVotes(v))
        .catch(() => !cancelled && setVotes({ liked: [], reported: [] }))
    }
    return () => {
      cancelled = true
    }
  }, [animeId, userId])

  const mine = userId ? reviews?.find((r) => r.userId === userId) : undefined
  const others = (reviews ?? [])
    .filter((r) => r !== mine && !r.hidden)
    .sort((a, b) =>
      sort === 'useful'
        ? (b.likes ?? 0) - (a.likes ?? 0) || b.$updatedAt.localeCompare(a.$updatedAt)
        : b.$createdAt.localeCompare(a.$createdAt),
    )
  const shown = showAll ? others : others.slice(0, PREVIEW)
  const count = others.length + (mine ? 1 : 0)

  function onSaved(saved?: Review) {
    setEditing(false)
    setReviews((list = []) => {
      const rest = list.filter((r) => r.userId !== userId)
      return saved ? [saved, ...rest] : rest
    })
  }

  function onVotes(id: string, next: Partial<Review>, nextVotes: MyVotes) {
    setVotes(nextVotes)
    setReviews((list = []) => list.map((r) => (r.$id === id ? { ...r, ...next } : r)))
  }

  return (
    <section className="stack">
      <div className="section-head" style={{ alignItems: 'center' }}>
        <h2>Отзывы{count ? ` · ${count}` : ''}</h2>
        {others.length > 1 && (
          <div className="chips" role="tablist" aria-label="Порядок отзывов">
            {(
              [
                ['useful', 'Полезные'],
                ['new', 'Новые'],
              ] as const
            ).map(([id, title]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={sort === id}
                className={`pill${sort === id ? ' active' : ''}`}
                onClick={() => setSort(id)}
              >
                {title}
              </button>
            ))}
          </div>
        )}
      </div>

      {!user ? (
        <p className="muted">
          <Link to="/account">Войдите</Link>, чтобы написать отзыв или отметить полезный.
        </p>
      ) : !reviews && !failed ? null : !mine || editing ? (
        <ReviewForm key={mine?.$id ?? 'new'} animeId={animeId} mine={mine} onSaved={onSaved} />
      ) : (
        <div className="stack">
          <ReviewCard review={mine} own votes={votes} onVotes={() => undefined} />
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
            <ReviewCard
              key={r.$id}
              review={r}
              own={false}
              votes={votes}
              onVotes={(next, v) => onVotes(r.$id, next, v)}
            />
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

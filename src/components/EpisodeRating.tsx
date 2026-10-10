import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { loadEpisodeScore, myEpisodeRate, rateEpisode } from '../data/social'
import { toast } from '../data/toast'
import './episode-rating.css'

const LABELS = ['', 'Скучно', 'Так себе', 'Нормально', 'Хорошо', 'Шедевр']

/** Оценка серии от 1 до 5 и среднее по зрителям: из них складываются «Лучшие серии» на странице тайтла. */
export default function EpisodeRating({ animeId, episode }: { animeId: string; episode: number }) {
  const { user } = useAuth()
  const [score, setScore] = useState(0)
  const [hover, setHover] = useState(0)
  const [agg, setAgg] = useState<{ avg: number; votes: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setScore(0)
    setAgg(null)
    loadEpisodeScore(animeId, episode)
      .then((r) => alive && setAgg(r && { avg: r.avg, votes: r.votes }))
      .catch(() => undefined)
    if (user) myEpisodeRate(animeId, episode).then((s) => alive && setScore(s)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [animeId, episode, user?.$id])

  const rate = async (n: number) => {
    if (!user) return
    setBusy(true)
    try {
      const next = n === score ? 0 : n
      const r = await rateEpisode(animeId, episode, next)
      setScore(r.score)
      setAgg({ avg: r.avg, votes: r.votes })
      if (next) toast(`Серия ${episode}: «${LABELS[next]}»`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || score
  return (
    <section className="episode-rating" aria-label="Оценка серии">
      <span className="episode-rating__label">Как вам серия?</span>
      <span className="episode-rating__stars" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= shown ? 'is-on' : undefined}
            disabled={!user || busy}
            aria-pressed={n === score}
            aria-label={`${n} из 5: ${LABELS[n]}`}
            title={LABELS[n]}
            onMouseEnter={() => setHover(n)}
            onClick={() => rate(n)}
          >
            ★
          </button>
        ))}
      </span>
      {shown > 0 && <span className="episode-rating__word">{LABELS[shown]}</span>}
      {agg && agg.votes > 0 ? (
        <span className="muted episode-rating__avg">
          Зрители: <b>{agg.avg.toFixed(1)}</b> из 5 · {agg.votes} {plural(agg.votes)}
        </span>
      ) : (
        <span className="muted episode-rating__avg">Оценок пока нет</span>
      )}
      {!user && (
        <Link to="/account" className="episode-rating__login">
          Войдите, чтобы оценить
        </Link>
      )}
    </section>
  )
}

function plural(n: number) {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return 'оценка'
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'оценки'
  return 'оценок'
}

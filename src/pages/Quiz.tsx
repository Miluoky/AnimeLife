import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchScreenshots, fromShort, get, type ShikiAnimeShort } from '../api/shikimori'
import type { Anime } from '../data/catalog'
import { usePageMeta } from '../data/pageMeta'
import { markFlag } from '../data/flags'
import { toast } from '../data/toast'
import './quiz.css'

interface Round {
  answer: Anime
  options: Anime[]
  shot: string
}

const BEST_KEY = 'anime.quiz.best'
// Столько подряд — достижение «Глаз-алмаз».
const STREAK_FLAG = 5

/** Похвастаться серией: системное меню на телефоне, на компьютере текст со ссылкой копируется. */
async function shareStreak(streak: number) {
  const url = `${location.origin}${import.meta.env.BASE_URL}quiz`
  const text = `Угадал(а) ${streak} аниме по кадру подряд на Anime Life. Сможешь больше?`
  if (navigator.share) return navigator.share({ text, url }).catch(() => undefined)
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    toast('Текст со ссылкой скопирован')
  } catch {
    toast('Не удалось скопировать')
  }
}
// Узнаваемые тайтлы: первые сто по популярности, страница случайная, чтобы игры отличались.
const POOL_PAGES = 2

const shuffle = <T,>(list: T[]) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function roundsLabel(n: number) {
  const m = n % 100
  if (m >= 11 && m <= 14) return 'раундов'
  const d = n % 10
  if (d === 1) return 'раунд'
  if (d >= 2 && d <= 4) return 'раунда'
  return 'раундов'
}

async function fetchPool(): Promise<Anime[]> {
  const list = await get<ShikiAnimeShort[]>('/animes', {
    order: 'popularity',
    limit: 50,
    page: 1 + Math.floor(Math.random() * POOL_PAGES),
    kind: 'tv,movie',
    censored: 'true',
  })
  return list.map(fromShort).filter((a) => a.title)
}

/** Готовим раунд: загаданный тайтл, у которого есть кадры, и три других варианта. */
async function makeRound(pool: Anime[], skip: Set<string>): Promise<Round | undefined> {
  // Все кадры пула уже были: начинаем круг заново, а не заканчиваем игру.
  if (pool.every((a) => skip.has(a.id))) skip.clear()
  for (const answer of shuffle(pool.filter((a) => !skip.has(a.id))).slice(0, 4)) {
    const shots = await fetchScreenshots(answer.id).catch(() => [])
    if (!shots.length) {
      skip.add(answer.id)
      continue
    }
    const others = shuffle(pool.filter((a) => a.id !== answer.id && a.title !== answer.title)).slice(0, 3)
    return { answer, options: shuffle([answer, ...others]), shot: shots[Math.floor(Math.random() * Math.min(shots.length, 12))] }
  }
  return undefined
}

/** «Угадай аниме по кадру»: кадр из популярного тайтла и четыре варианта, считаем серию верных ответов. */
export default function Quiz() {
  usePageMeta('Угадай аниме по кадру', 'Мини-игра: по кадру из аниме угадайте название из четырёх вариантов. Сколько подряд получится?')
  const pool = useRef<Anime[]>([])
  const seen = useRef(new Set<string>())
  const next = useRef<Promise<Round | undefined>>()
  const [round, setRound] = useState<Round>()
  const [error, setError] = useState(false)
  const [picked, setPicked] = useState<string>()
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 })
  const [best, setBest] = useState(readBest)
  // Серия, которую оборвал последний неверный ответ: ею можно похвастаться.
  const [ended, setEnded] = useState(0)
  const [boot, setBoot] = useState<'loading' | 'ready'>('loading')
  const [started, setStarted] = useState(false)

  const prepare = useCallback(() => {
    next.current = makeRound(pool.current, seen.current)
  }, [])

  const advance = useCallback(async () => {
    setPicked(undefined)
    setRound(undefined)
    if (!next.current) prepare()
    const r = await next.current
    if (!r) return setError(true)
    seen.current.add(r.answer.id)
    setRound(r)
    // Следующий раунд готовим заранее: кадр уже в кэше, когда нажмут «Дальше».
    prepare()
    void next.current?.then((n) => n && (new Image().src = n.shot))
  }, [prepare])

  const initOnce = useRef(false)
  useEffect(() => {
    if (initOnce.current) return
    initOnce.current = true
    fetchPool()
      .then((list) => {
        pool.current = list
        setBoot('ready')
      })
      .catch(() => setError(true))
  }, [])

  const startGame = () => {
    if (boot !== 'ready' || started) return
    setStarted(true)
    void advance()
  }

  const choose = (id: string) => {
    if (!round || picked) return
    setPicked(id)
    const ok = id === round.answer.id
    const streak = ok ? score.streak + 1 : 0
    setScore({ right: score.right + (ok ? 1 : 0), total: score.total + 1, streak })
    setEnded(ok ? 0 : score.streak)
    if (streak >= STREAK_FLAG) markFlag('quizStreak')
    if (streak > best) {
      setBest(streak)
      try {
        localStorage.setItem(BEST_KEY, String(streak))
      } catch {
        /* приватный режим: рекорд живёт до перезагрузки */
      }
    }
  }

  const right = picked && round && picked === round.answer.id

  const streakFillPct = Math.min(100, (score.streak / STREAK_FLAG) * 100)
  const streakRemaining = Math.max(0, STREAK_FLAG - score.streak)
  const currentRoundNo = !started
    ? 0
    : !round
      ? Math.max(1, score.total + 1)
      : picked
        ? score.total
        : score.total + 1

  return (
    <main className="container quiz-page">
      {!started ? (
        <header className="quiz-hero">
          <h1 className="page-title quiz-hero__title">Угадай аниме по кадру</h1>
          <p className="soft quiz-hero__lead">Один кадр, четыре названия. Ответьте верно — серия растёт, ошибётесь — начнёте заново.</p>
          <ul className="quiz-hero__rules" aria-label="Как играть">
            <li>Смотрите кадр и выберите один из четырёх тайтлов.</li>
            <li>Считаем подряд угаданные аниме и личный рекорд.</li>
            <li>После неверного ответа можно похвастаться серией в один тап.</li>
          </ul>
          <p className="quiz-hero__more">
            <Link className="quiz-hero__link" to="/duel">
              Дуэль вкуса
            </Link>
            <span className="quiz-hero__more-sep"> — кто ближе по пятёрке тайтлов</span>
          </p>
        </header>
      ) : (
        <header className="quiz-head quiz-head--active" aria-label="Прогресс игры">
          <h1 className="sr-only">Угадай аниме по кадру</h1>
          <div className="quiz-progress">
            <div className="quiz-progress__row">
              <span className="quiz-progress__round">
                Раунд{' '}
                <strong>{currentRoundNo > 0 ? String(currentRoundNo).padStart(2, '0') : '—'}</strong>
              </span>
              <span className="quiz-progress__streak" title="Текущая серия верных ответов">
                Серия: <strong>{score.streak}</strong>
              </span>
            </div>
            <div className="quiz-progress__track" role="presentation">
              <div className="quiz-progress__fill" style={{ width: `${streakFillPct}%` }} />
            </div>
            {(score.streak >= STREAK_FLAG || streakRemaining > 0) && (
              <p className="quiz-progress__hint muted">
                {score.streak >= STREAK_FLAG
                  ? 'Серия отличная — значок «Глаз-алмаз» уже ваш.'
                  : `До достижения «Глаз-алмаз» — ещё ${streakRemaining} ${roundsLabel(streakRemaining)}.`}
              </p>
            )}
          </div>
          <dl className="quiz-score quiz-score--compact" aria-label="Счёт">
            <div>
              <dt>Подряд</dt>
              <dd>{score.streak}</dd>
            </div>
            <div>
              <dt>Верно</dt>
              <dd>
                {score.right} / {score.total}
              </dd>
            </div>
            <div>
              <dt>Рекорд</dt>
              <dd>{best}</dd>
            </div>
          </dl>
        </header>
      )}

      {error ? (
        <div className="empty-state">
          <p className="muted">Не удалось загрузить кадры. Попробуйте обновить страницу чуть позже.</p>
        </div>
      ) : !started ? (
        <section className="quiz-start" aria-labelledby="quiz-start-title">
          <div className="quiz-start__panel">
            <h2 id="quiz-start-title" className="quiz-start__heading">
              Готовы?
            </h2>
            <p className="quiz-start__text soft">
              {boot === 'loading' ? 'Подбираем популярные тайтлы и кадры…' : 'Нажмите «Начать», когда будете готовы к первому кадру.'}
            </p>
            <button
              type="button"
              className="btn btn--accent quiz-start__cta"
              onClick={startGame}
              disabled={boot !== 'ready'}
              aria-busy={boot === 'loading'}
            >
              {boot === 'loading' ? 'Загрузка…' : 'Начать'}
            </button>
          </div>
        </section>
      ) : (
        <section className="quiz-card" aria-busy={!round}>
          <div className="quiz-shot frame-corners">
            {round ? <img key={round.shot} src={round.shot} alt="Кадр из загаданного аниме" /> : <span className="quiz-shot__wait">Ищем кадр…</span>}
            {/* Экран видоискателя: метки по углам кадра, после ответа — год и оценка загаданного тайтла */}
            <span className="quiz-hud quiz-hud--tl" aria-hidden="true">
              <i /> REC
            </span>
            <span className="quiz-hud quiz-hud--tr" aria-hidden="true">
              {picked && round?.answer.year ? round.answer.year : 'EP ??'}
            </span>
            <span className="quiz-hud quiz-hud--bl" aria-hidden="true">
              16:9 · 24 FPS
            </span>
            <span className="quiz-hud quiz-hud--br" aria-hidden="true">
              ★ {picked && round?.answer.score ? round.answer.score.toFixed(2) : '?.??'}
            </span>
          </div>
          <p className="quiz-prompt soft">Какое это аниме?</p>
          <div className="quiz-options" role="group" aria-label="Варианты ответа">
            {(round?.options ?? Array.from({ length: 4 }, () => undefined)).map((a, i) => {
              const state = !picked || !a ? '' : a.id === round?.answer.id ? ' quiz-option--right' : a.id === picked ? ' quiz-option--wrong' : ''
              return (
                <button key={a?.id ?? i} type="button" className={`quiz-option${state}`} disabled={!a || Boolean(picked)} onClick={() => a && choose(a.id)}>
                  <span className="quiz-option__label">{a?.title ?? ' '}</span>
                </button>
              )
            })}
          </div>
          {picked && round && (
            <div className={`quiz-result${right ? ' quiz-result--right' : ' quiz-result--wrong'}`} role="status">
              <div className="quiz-result__main">
                <p className="quiz-result__badge">{right ? 'Верно!' : 'Мимо.'}</p>
                <p className="quiz-result__detail">
                  Это{' '}
                  <Link className="quiz-result__title-link" to={`/anime/${round.answer.id}`}>
                    {round.answer.title}
                  </Link>
                  {round.answer.year ? ` (${round.answer.year})` : ''}.
                </p>
              </div>
              <div className="quiz-result__actions">
                {ended >= 2 && (
                  <button type="button" className="btn btn--ghost quiz-result__share" onClick={() => void shareStreak(ended)}>
                    Похвастаться: {ended} подряд
                  </button>
                )}
                {!right && (
                  <Link to="/duel" className="btn btn--ghost">
                    Сравнить с другом
                  </Link>
                )}
                <button type="button" className="btn btn--accent quiz-result__next" onClick={() => void advance()} autoFocus>
                  Дальше
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

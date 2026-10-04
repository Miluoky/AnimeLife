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

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    fetchPool()
      .then((list) => {
        pool.current = list
        void advance()
      })
      .catch(() => setError(true))
  }, [advance])

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

  return (
    <main className="container quiz-page">
      <header className="quiz-head">
        <h1 className="page-title">Угадай аниме по кадру</h1>
        <p className="soft">Четыре варианта, один верный. Сколько угадаете подряд?</p>
        <dl className="quiz-score" aria-label="Счёт">
          <div>
            <dt>Подряд</dt>
            <dd>{score.streak}</dd>
          </div>
          <div>
            <dt>Верно</dt>
            <dd>
              {score.right} из {score.total}
            </dd>
          </div>
          <div>
            <dt>Рекорд</dt>
            <dd>{best}</dd>
          </div>
        </dl>
      </header>

      {error ? (
        <div className="empty-state">
          <p className="muted">Не удалось загрузить кадры. Попробуйте обновить страницу чуть позже.</p>
        </div>
      ) : (
        <section className="quiz-card" aria-busy={!round}>
          <div className="quiz-shot">
            {round ? <img key={round.shot} src={round.shot} alt="Кадр из загаданного аниме" /> : <span className="quiz-shot__wait">Ищем кадр…</span>}
          </div>
          <div className="quiz-options" role="group" aria-label="Варианты ответа">
            {(round?.options ?? Array.from({ length: 4 }, () => undefined)).map((a, i) => {
              const state = !picked || !a ? '' : a.id === round?.answer.id ? ' quiz-option--right' : a.id === picked ? ' quiz-option--wrong' : ''
              return (
                <button key={a?.id ?? i} type="button" className={`quiz-option${state}`} disabled={!a || Boolean(picked)} onClick={() => a && choose(a.id)}>
                  {a?.title ?? ' '}
                </button>
              )
            })}
          </div>
          {picked && round && (
            <div className="quiz-result" role="status">
              <p>
                <strong>{right ? 'Верно!' : 'Мимо.'}</strong> Это «<Link to={`/anime/${round.answer.id}`}>{round.answer.title}</Link>»
                {round.answer.year ? `, ${round.answer.year}` : ''}.
              </p>
              {ended >= 2 && (
                <button type="button" className="btn btn--ghost" onClick={() => void shareStreak(ended)}>
                  Похвастаться: {ended} подряд
                </button>
              )}
              <button type="button" className="btn btn--accent" onClick={() => void advance()} autoFocus>
                Дальше
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

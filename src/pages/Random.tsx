import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadAnime } from '../api'
import { fromShort, get, withPosters, type ShikiAnimeShort } from '../api/shikimori'
import type { Anime } from '../data/catalog'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { genrePath } from '../data/seo'
import ListButton from '../components/ListButton'
import { PlayIcon, SparkIcon } from '../components/Icons'
import './random.css'

/** Настроения: за каждым один или два жанра Shikimori (id как в src/data/seo.ts). */
const moods = [
  { id: 'any', title: 'Любое', emoji: '🎲', genre: '' },
  { id: 'laugh', title: 'Посмеяться', emoji: '😂', genre: '4' },
  { id: 'cozy', title: 'Уютное', emoji: '☕', genre: '36' },
  { id: 'love', title: 'Про любовь', emoji: '💗', genre: '22' },
  { id: 'action', title: 'Драйв', emoji: '⚔️', genre: '1' },
  { id: 'think', title: 'Подумать', emoji: '🧠', genre: '40' },
  { id: 'tense', title: 'Напряжённое', emoji: '😱', genre: '41' },
  { id: 'magic', title: 'Другой мир', emoji: '✨', genre: '10' },
  { id: 'mystery', title: 'Загадка', emoji: '🔎', genre: '7' },
  { id: 'sport', title: 'Спорт', emoji: '🏐', genre: '30' },
] as const

const formats = [
  { id: 'tv,ona', title: 'Сериал' },
  { id: 'movie', title: 'Фильм' },
  { id: 'tv,movie,ona', title: 'Неважно' },
]

const bars = [
  { id: '8', title: 'Только шедевры, от 8' },
  { id: '7', title: 'Хорошее, от 7' },
  { id: '6', title: 'Любое' },
]

// Shikimori перемешивает выдачу сам (order=random), а номер страницы делает запросы разными для кэша прокси.
const VARIANTS = 12
const SPIN_MS = 1400

async function fetchCandidates(genre: string, kind: string, score: string): Promise<Anime[]> {
  const list = await get<ShikiAnimeShort[]>('/animes', {
    order: 'random',
    limit: 50,
    page: 1 + Math.floor(Math.random() * VARIANTS),
    genre: genre || undefined,
    kind,
    score,
    status: 'released,ongoing',
    censored: 'true',
  })
  return (await withPosters(list)).map(fromShort).filter((a) => a.posterSmall || a.posterUrl)
}

/** «Что посмотреть?»: настроение, формат и планка оценки, а сайт крутит барабан и предлагает один тайтл. */
export default function Random() {
  usePageMeta('Что посмотреть: случайное аниме по настроению', 'Подберём случайное аниме по настроению, формату и оценке.')
  const list = useMyList()
  const [mood, setMood] = useState<string>('any')
  const [kind, setKind] = useState('tv,ona')
  const [score, setScore] = useState('7')
  const [hideListed, setHideListed] = useState(true)
  const [reel, setReel] = useState<Anime[]>([])
  const [spinning, setSpinning] = useState(false)
  const [pick, setPick] = useState<Anime>()
  const [details, setDetails] = useState<Anime>()
  const [error, setError] = useState('')
  const [seen, setSeen] = useState<Anime[]>([])
  const pool = useRef<{ key: string; items: Anime[] }>({ key: '', items: [] })
  const result = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pick) return
    let cancelled = false
    setDetails(undefined)
    loadAnime(pick.id).then((r) => !cancelled && r.data && setDetails(r.data))
    return () => {
      cancelled = true
    }
  }, [pick])

  async function spin() {
    if (spinning) return
    setError('')
    setSpinning(true)
    const genre = moods.find((m) => m.id === mood)?.genre ?? ''
    const key = `${genre}|${kind}|${score}`
    const listed = new Set(hideListed ? list.map((e) => e.anime.id) : [])
    const offered = new Set(seen.map((a) => a.id))
    const fresh = (items: Anime[]) => items.filter((a) => !listed.has(a.id) && !offered.has(a.id))
    try {
      if (pool.current.key !== key || fresh(pool.current.items).length === 0) {
        let items: Anime[] = []
        // Пара попыток: в узких подборках одна случайная страница может состоять из уже знакомого.
        for (let i = 0; i < 3 && fresh(items).length === 0; i++) items = await fetchCandidates(genre, kind, score)
        pool.current = { key, items }
      }
      const options = fresh(pool.current.items)
      if (!options.length) throw new Error('empty')
      const chosen = options[Math.floor(Math.random() * options.length)]
      // Барабан: мелькают постеры подборки, последним встаёт выбранный.
      const shuffled = [...pool.current.items].sort(() => Math.random() - 0.5).slice(0, 14)
      setReel([...shuffled.filter((a) => a.id !== chosen.id), chosen])
      setPick(undefined)
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
      await new Promise((r) => setTimeout(r, calm ? 200 : SPIN_MS))
      setPick(chosen)
      setSeen((s) => [chosen, ...s.filter((a) => a.id !== chosen.id)].slice(0, 12))
      requestAnimationFrame(() => result.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'empty'
          ? 'Под такие условия больше ничего не нашлось. Попробуйте другое настроение или снизьте планку оценки.'
          : 'Каталог сейчас не отвечает. Попробуйте ещё раз через минуту.',
      )
    }
    setSpinning(false)
  }

  const shown = details && details.id === pick?.id ? details : pick

  return (
    <main className="container random-page">
      <section className="random-hero">
        <span className="random-hero__icon" aria-hidden="true">
          <SparkIcon size={22} />
        </span>
        <h1 className="page-title">Что посмотреть?</h1>
        <p className="muted random-hero__lead">Выберите настроение, а мы покрутим барабан и предложим один тайтл.</p>
      </section>

      <section className="random-form" aria-label="Условия подбора">
        <div className="random-field">
          <span className="random-field__label">Настроение</span>
          <div className="random-moods" role="group" aria-label="Настроение">
            {moods.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mood${mood === m.id ? ' mood--on' : ''}`}
                aria-pressed={mood === m.id}
                onClick={() => setMood(m.id)}
              >
                <span className="mood__emoji" aria-hidden="true">
                  {m.emoji}
                </span>
                {m.title}
              </button>
            ))}
          </div>
        </div>
        <div className="random-row">
          <div className="random-field">
            <span className="random-field__label">Формат</span>
            <div className="chips" role="group" aria-label="Формат">
              {formats.map((f) => (
                <button key={f.id} type="button" className={`pill${kind === f.id ? ' active' : ''}`} aria-pressed={kind === f.id} onClick={() => setKind(f.id)}>
                  {f.title}
                </button>
              ))}
            </div>
          </div>
          <div className="random-field">
            <span className="random-field__label">Оценка</span>
            <div className="chips" role="group" aria-label="Оценка">
              {bars.map((b) => (
                <button key={b.id} type="button" className={`pill${score === b.id ? ' active' : ''}`} aria-pressed={score === b.id} onClick={() => setScore(b.id)}>
                  {b.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="random-check">
          <input type="checkbox" checked={hideListed} onChange={(e) => setHideListed(e.target.checked)} />
          Не предлагать то, что уже в моём списке
        </label>
        <button type="button" className="btn btn--accent random-spin" onClick={spin} disabled={spinning}>
          <span aria-hidden="true">🎲</span> {spinning ? 'Крутим…' : pick ? 'Другой вариант' : 'Подобрать аниме'}
        </button>
        {error && (
          <p className="random-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <div ref={result} aria-live="polite">
        {spinning && reel.length > 0 && (
          <div className="reel" aria-hidden="true">
            <div className="reel__strip" style={{ animationDuration: `${SPIN_MS}ms` }}>
              {reel.map((a) => (
                <img key={a.id} src={a.posterSmall ?? a.posterUrl} alt="" />
              ))}
            </div>
          </div>
        )}
        {!spinning && shown && (
          <article className="pick" style={{ ['--glow' as string]: shown.posterFill }}>
            <div className="pick__bg" aria-hidden="true">
              {shown.posterUrl && <img src={shown.posterUrl} alt="" />}
            </div>
            <Link to={`/anime/${shown.id}`} className="pick__poster">
              <img src={shown.posterUrl ?? shown.posterSmall} alt={shown.title} />
            </Link>
            <div className="pick__body">
              <span className="pick__eyebrow">Сегодня смотрим</span>
              <h2 className="pick__title">
                <Link to={`/anime/${shown.id}`}>{shown.title}</Link>
              </h2>
              <p className="muted pick__meta">
                {[shown.score && `★ ${shown.score.toFixed(1)}`, shown.year, shown.kind, shown.episodes && shown.episodes > 1 && `${shown.episodes} эп.`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {shown.genres.length > 0 && (
                <div className="chips pick__genres">
                  {shown.genres.slice(0, 5).map((g) => {
                    const to = genrePath(g)
                    return to ? (
                      <Link key={g} to={to} className="chip">
                        {g}
                      </Link>
                    ) : (
                      <span key={g} className="chip">
                        {g}
                      </span>
                    )
                  })}
                </div>
              )}
              {shown.description ? (
                <p className="soft pick__text clamp-4">{shown.description}</p>
              ) : (
                <p className="muted pick__text">{details ? 'Описания пока нет.' : 'Загружаем описание…'}</p>
              )}
              <div className="actions">
                <Link to={`/watch/${shown.id}/1`} className="btn btn--accent">
                  <PlayIcon /> Смотреть
                </Link>
                <ListButton anime={shown} />
                <Link to={`/anime/${shown.id}`} className="btn btn--ghost">
                  Подробнее
                </Link>
              </div>
            </div>
          </article>
        )}
      </div>

      {seen.length > 1 && (
        <section className="stack random-seen">
          <h2 className="random-seen__title">Уже предлагали</h2>
          <div className="random-seen__row">
            {seen.slice(1).map((a) => (
              <button key={a.id} type="button" className="random-seen__item" onClick={() => setPick(a)} title={a.title}>
                <img src={a.posterSmall ?? a.posterUrl} alt={a.title} loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

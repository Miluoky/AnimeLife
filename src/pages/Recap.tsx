import './top.css'
import './social.css'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyList, type ListEntry } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import { watchLogStore, type LogEntry, type LogTitle } from '../data/watchLog'
import { levelOf, totalXp } from '../data/xp'
import { unlocked } from '../data/achievements'
import { SparkIcon } from '../components/Icons'
import { plural } from '../components/socialUi'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

interface Recap {
  year: number
  episodes: number
  hours: number
  titles: number
  days: number
  streak: number
  top: { id: string; t: LogTitle; n: number }[]
  genres: [string, number][]
  voice?: [string, number]
  month?: [number, number]
  night: number
  completed: ListEntry[]
  rated: ListEntry[]
  mean?: number
}

function build(year: number, entries: LogEntry[], titles: Record<string, LogTitle>, list: ListEntry[]): Recap {
  const mine = entries.filter((e) => e.d.startsWith(`${year}-`))
  const perTitle = new Map<string, number>()
  const genres = new Map<string, number>()
  const voices = new Map<string, number>()
  const months = new Map<number, number>()
  const days = new Set<string>()
  let minutes = 0
  let night = 0
  for (const e of mine) {
    perTitle.set(e.a, (perTitle.get(e.a) ?? 0) + 1)
    for (const g of titles[e.a]?.g ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
    if (e.v) voices.set(e.v, (voices.get(e.v) ?? 0) + 1)
    const m = Number(e.d.slice(5, 7)) - 1
    months.set(m, (months.get(m) ?? 0) + 1)
    days.add(e.d)
    minutes += e.m
    if (e.h < 5) night++
  }
  // Самая длинная серия дней подряд с просмотром.
  let streak = 0
  let run = 0
  let prev = 0
  for (const d of [...days].sort()) {
    const t = Date.parse(`${d}T12:00:00`)
    run = prev && t - prev < 36 * 3600 * 1000 ? run + 1 : 1
    streak = Math.max(streak, run)
    prev = t
  }
  const inYear = (t?: number) => !!t && new Date(t).getFullYear() === year
  const completed = list.filter((e) => e.status === 'completed' && inYear(e.updatedAt ?? e.addedAt))
  const rated = list.filter((e) => e.rating && inYear(e.ratedAt)).sort((a, b) => b.rating! - a.rating!)
  const best = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])
  return {
    year,
    episodes: mine.length,
    hours: Math.round(minutes / 60),
    titles: perTitle.size,
    days: days.size,
    streak,
    top: best(perTitle)
      .slice(0, 5)
      .flatMap(([id, n]) => (titles[id] ? [{ id, t: titles[id], n }] : [])),
    genres: best(genres).slice(0, 5),
    voice: best(voices)[0],
    month: [...months].sort((a, b) => b[1] - a[1])[0],
    night: mine.length ? Math.round((night / mine.length) * 100) : 0,
    completed,
    rated,
    mean: rated.length ? Math.round((rated.reduce((n, e) => n + e.rating!, 0) / rated.length) * 10) / 10 : undefined,
  }
}

/** «Итоги года», как Spotify Wrapped: часы, любимые тайтлы и жанры, озвучка, рекорды, карточка для соцсетей. */
export default function RecapPage() {
  const list = useMyList()
  const log = watchLogStore.use()
  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()])
    for (const e of log.entries) ys.add(Number(e.d.slice(0, 4)))
    return [...ys].sort((a, b) => b - a)
  }, [log])
  const [year, setYear] = useState(years[0])
  const r = useMemo(() => build(year, log.entries, log.titles, list), [year, log, list])
  const level = levelOf(totalXp(list, unlocked(list).size))
  usePageMeta(`Мои итоги ${year} года`, 'Итоги года в аниме: сколько часов, любимые тайтлы и жанры, озвучка, рекорды. Картинкой для соцсетей.')
  const empty = !r.episodes && !r.completed.length && !r.rated.length

  return (
    <main className="container top-page social-page recap">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <SparkIcon size={24} />
        </span>
        <div>
          <h1 className="page-title">Мои итоги {year}</h1>
          <p className="muted top-head__lead">Ваш год в аниме. Считается в этом браузере по сериям, которые вы открывали на сайте.</p>
        </div>
      </header>
      {years.length > 1 && (
        <div className="s-chips">
          {years.map((y) => (
            <button key={y} type="button" className={y === year ? 'is-on' : undefined} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      )}
      {empty ? (
        <div className="s-empty">
          <p>За {year} год пока пусто. Посмотрите пару серий, отмечайте и оценивайте тайтлы, и итоги начнут складываться.</p>
          <Link to="/catalog" className="btn btn--accent">В каталог</Link>
        </div>
      ) : (
        <>
          <section className="recap__hero">
            <div>
              <b className="recap__big">{r.hours}</b>
              <span>{plural(r.hours, 'час', 'часа', 'часов')} аниме</span>
            </div>
            <div>
              <b className="recap__big">{r.episodes}</b>
              <span>{plural(r.episodes, 'серия', 'серии', 'серий')}</span>
            </div>
            <div>
              <b className="recap__big">{r.titles}</b>
              <span>{plural(r.titles, 'тайтл', 'тайтла', 'тайтлов')}</span>
            </div>
            <div>
              <b className="recap__big">{r.completed.length}</b>
              <span>досмотрено</span>
            </div>
          </section>
          <section className="recap__grid">
            {r.top.length > 0 && (
              <div className="recap__card recap__card--wide">
                <h2>Чаще всего смотрели</h2>
                <ol className="recap__top">
                  {r.top.map((x, i) => (
                    <li key={x.id}>
                      <span className="recap__place">{i + 1}</span>
                      {x.t.p && <img src={x.t.p} alt="" loading="lazy" />}
                      <Link to={`/anime/${x.id}`}>{x.t.t}</Link>
                      <span className="muted">
                        {x.n} {plural(x.n, 'серия', 'серии', 'серий')}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {r.genres.length > 0 && (
              <div className="recap__card">
                <h2>Любимые жанры</h2>
                <ul className="recap__bars">
                  {r.genres.map(([g, n]) => (
                    <li key={g}>
                      <span>{g}</span>
                      <i style={{ width: `${(n / r.genres[0][1]) * 100}%` }} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="recap__card">
              <h2>Рекорды</h2>
              <ul className="recap__facts">
                <li>
                  <b>{r.days}</b> {plural(r.days, 'день', 'дня', 'дней')} с аниме
                </li>
                <li>
                  <b>{r.streak}</b> {plural(r.streak, 'день', 'дня', 'дней')} подряд без перерыва
                </li>
                {r.month && (
                  <li>
                    Самый насыщенный месяц: <b>{MONTHS[r.month[0]]}</b>
                  </li>
                )}
                {r.voice && (
                  <li>
                    Любимая озвучка: <b>{r.voice[0]}</b>
                  </li>
                )}
                {r.night > 0 && (
                  <li>
                    <b>{r.night}%</b> серий после полуночи
                  </li>
                )}
                {r.mean && (
                  <li>
                    Средняя оценка: <b>{r.mean}</b>
                  </li>
                )}
                <li>
                  Уровень: <b>{level.level}</b>, «{level.rank}»
                </li>
              </ul>
            </div>
            {r.rated.length > 0 && (
              <div className="recap__card">
                <h2>Высшие оценки</h2>
                <ul className="recap__facts">
                  {r.rated.slice(0, 5).map((e) => (
                    <li key={e.anime.id}>
                      <b>{e.rating}</b> <Link to={`/anime/${e.anime.id}`}>{e.anime.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <div className="s-row">
            <button type="button" className="btn btn--accent" onClick={() => shareCard(r, level.level)}>
              Картинка для соцсетей
            </button>
          </div>
        </>
      )}
    </main>
  )
}

/** Рисует карточку 1080×1350 с итогами и отдаёт в «Поделиться» или скачивает. */
async function shareCard(r: Recap, level: number) {
  const c = document.createElement('canvas')
  c.width = 1080
  c.height = 1350
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 1080, 1350)
  bg.addColorStop(0, '#2a0f24')
  bg.addColorStop(0.55, '#120c18')
  bg.addColorStop(1, '#0a0a0c')
  g.fillStyle = bg
  g.fillRect(0, 0, 1080, 1350)
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5470'
  g.fillStyle = accent
  g.font = '700 44px Unbounded, sans-serif'
  g.fillText('ANIME LIFE', 80, 120)
  g.fillStyle = '#fff'
  g.font = '700 96px Unbounded, sans-serif'
  g.fillText(`Итоги ${r.year}`, 80, 250)
  const stat = (n: number | string, label: string, x: number, y: number) => {
    g.fillStyle = '#fff'
    g.font = '700 120px Unbounded, sans-serif'
    g.fillText(String(n), x, y)
    g.fillStyle = 'rgba(255,255,255,.7)'
    g.font = '500 36px Manrope, sans-serif'
    g.fillText(label, x, y + 52)
  }
  stat(r.hours, plural(r.hours, 'час', 'часа', 'часов'), 80, 460)
  stat(r.episodes, plural(r.episodes, 'серия', 'серии', 'серий'), 560, 460)
  stat(r.titles, plural(r.titles, 'тайтл', 'тайтла', 'тайтлов'), 80, 700)
  stat(level, 'уровень', 560, 700)
  g.fillStyle = accent
  g.font = '700 40px Manrope, sans-serif'
  g.fillText('Чаще всего смотрел(а):', 80, 860)
  g.fillStyle = '#fff'
  g.font = '500 40px Manrope, sans-serif'
  r.top.slice(0, 3).forEach((x, i) => g.fillText(`${i + 1}. ${x.t.t}`.slice(0, 42), 80, 930 + i * 60))
  if (r.genres[0]) {
    g.fillStyle = 'rgba(255,255,255,.7)'
    g.fillText(`Жанр года: ${r.genres[0][0]}`, 80, 1150)
  }
  g.fillStyle = 'rgba(255,255,255,.5)'
  g.font = '500 32px Manrope, sans-serif'
  g.fillText('animelife.top/recap', 80, 1270)
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
  if (!blob) return toast('Не получилось нарисовать картинку')
  const file = new File([blob], `anime-life-itogi-${r.year}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) return void navigator.share({ files: [file], title: `Мои итоги ${r.year} года в аниме` }).catch(() => undefined)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

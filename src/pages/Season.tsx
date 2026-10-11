import { useEffect, useState } from 'react'
import { srcset2x } from '../data/saver'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import {
  FORMATS,
  SEASON_LABELS,
  currentSeason,
  fetchSeason,
  parseSeason,
  seasonCode,
  shiftSeason,
  type FormatId,
  type SeasonAnime,
  type SeasonCode,
} from '../api/season'
import { prefetchTitle } from '../api/prefetch'
import { fadeIn } from '../components/PosterCard'
import { listStatuses, setListStatus, useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import './season.css'

const SORTS = [
  { id: 'popular', title: 'Популярные' },
  { id: 'score', title: 'По оценке' },
  { id: 'soon', title: 'Скоро серия' },
  { id: 'start', title: 'По дате старта' },
] as const
type SortId = (typeof SORTS)[number]['id']

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fills = ['#1e2638', '#2b2340', '#1e3140', '#24332a', '#3a2430', '#3a3122', '#26283f']

const label = (s: SeasonCode) => `${SEASON_LABELS[s.name]} ${s.year}`

/** «2 дн 4 ч», «3 ч 10 мин», «12 мин». */
function untilLabel(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  if (d) return `${d} дн${h ? ` ${h} ч` : ''}`
  return `${h ? `${h} ч ` : ''}${min % 60 ? `${min % 60} мин` : ''}`.trim()
}

/** Что сейчас с тайтлом: обратный отсчёт до серии, дата старта или «вышел». */
function airing(a: SeasonAnime, now: number): { text: string; hot?: boolean } {
  const next = a.nextEpisodeAt ? Date.parse(a.nextEpisodeAt) : NaN
  if (next > now) {
    const n = (a.episodesAired ?? 0) + 1
    return { text: `${a.status === 'anons' ? 'Премьера' : `Серия ${n}`} через ${untilLabel(next - now)}`, hot: next - now < 86_400_000 }
  }
  if (a.status === 'anons') return { text: a.airedOn ? `Старт ${dateFormat.format(new Date(a.airedOn))}` : 'Дата пока не объявлена' }
  if (a.status === 'released') return { text: a.episodes && a.episodes > 1 ? `Вышел целиком, ${a.episodes} сер.` : 'Уже вышел' }
  return { text: `Вышло ${a.episodesAired ?? 0} из ${a.episodes || '?'}` }
}

function sortList(list: SeasonAnime[], sort: SortId, now: number) {
  const copy = [...list]
  if (sort === 'score') copy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.rank - b.rank)
  if (sort === 'start') copy.sort((a, b) => (a.airedOn ?? '9999').localeCompare(b.airedOn ?? '9999') || a.rank - b.rank)
  if (sort === 'soon') {
    const at = (a: SeasonAnime) => {
      const t = a.nextEpisodeAt ? Date.parse(a.nextEpisodeAt) : NaN
      return t > now ? t : Infinity
    }
    copy.sort((a, b) => at(a) - at(b) || a.rank - b.rank)
  }
  return copy
}

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * Сезонный чарт, как на AniChart и LiveChart: все тайтлы сезона по форматам, большие карточки с описанием,
 * студией, жанрами и обратным отсчётом до следующей серии. Сезон листается стрелками, всё состояние — в адресе.
 */
export default function Season() {
  const [params, setParams] = useSearchParams()
  const season = parseSeason(params.get('s')) ?? currentSeason()
  const format = (FORMATS.some((f) => f.id === params.get('f')) ? params.get('f') : 'tv') as FormatId
  const sort = (SORTS.some((s) => s.id === params.get('sort')) ? params.get('sort') : 'popular') as SortId
  const mine = params.get('mine') === '1'
  const genre = params.get('genre') ?? ''
  const code = seasonCode(season)
  const now = useMinuteClock()
  const list = useMyList()
  const status = new Map(list.map((e) => [e.anime.id, e.status]))

  const [retry, setRetry] = useState(0)
  const result = useAsync(
    () => fetchSeason(season, format).then((items) => ({ items, error: false }), () => ({ items: [] as SeasonAnime[], error: true })),
    [code, format, retry],
  )
  usePageMeta(
    `Аниме сезона ${label(season).toLowerCase()}: сезонный чарт`,
    `Все аниме сезона ${label(season).toLowerCase()}: сериалы, фильмы и OVA с описанием, студией, жанрами и временем выхода новых серий.`,
  )

  function set(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const current = currentSeason()
  const goTo = (s: SeasonCode) => set({ s: seasonCode(s) === seasonCode(current) ? undefined : seasonCode(s), genre: undefined })

  const all = result.value?.items ?? []
  const genres = [...new Set(all.flatMap((a) => a.genres))].sort((a, b) => a.localeCompare(b, 'ru'))
  const shown = sortList(
    all.filter((a) => (!mine || status.has(a.id)) && (!genre || a.genres.includes(genre))),
    sort,
    now,
  )

  const toggle = (a: SeasonAnime) => {
    const card = {
      id: a.id,
      title: a.title,
      kind: a.kind,
      year: season.year,
      episodes: a.episodes,
      ongoing: a.status === 'ongoing',
      score: a.score,
      posterUrl: a.poster,
      posterSmall: a.poster,
      posterSmall2x: a.poster2x,
      posterFill: fills[Number(a.id) % fills.length],
    }
    const prev = status.get(a.id)
    const next = prev ? undefined : 'planned'
    setListStatus(card, next)
    toast(next ? `${a.title}: «Буду смотреть»` : `${a.title} убран из списка`, { label: 'Отменить', onClick: () => setListStatus(card, prev) })
  }

  return (
    <main className="container season-page">
      <header className="season-head frame-corners">
        <p className="season-head__kicker">Сезонный чарт</p>
        <div className="season-head__row">
          <button type="button" className="season-arrow" onClick={() => goTo(shiftSeason(season, -1))} aria-label={`Предыдущий сезон: ${label(shiftSeason(season, -1))}`}>
            ‹
          </button>
          <h1 className="season-head__title">
            <span className={`season-head__name season-head__name--${season.name}`}>{SEASON_LABELS[season.name]}</span> {season.year}
          </h1>
          <button type="button" className="season-arrow" onClick={() => goTo(shiftSeason(season, 1))} aria-label={`Следующий сезон: ${label(shiftSeason(season, 1))}`}>
            ›
          </button>
        </div>
        <nav className="season-quick" aria-label="Соседние сезоны">
          {[-1, 0, 1, 2].map((by) => {
            const s = shiftSeason(current, by)
            const active = seasonCode(s) === code
            return (
              <button key={by} type="button" className={`pill${active ? ' active' : ''}`} aria-pressed={active} onClick={() => goTo(s)}>
                {by === 0 ? `Сейчас · ${label(s)}` : label(s)}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="season-controls">
        <div className="chips" role="tablist" aria-label="Формат">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === format}
              className={`pill${f.id === format ? ' active' : ''}`}
              onClick={() => set({ f: f.id === 'tv' ? undefined : f.id, genre: undefined })}
            >
              {f.title}
              {f.id === format && result.value && <span className="season-count">{all.length}</span>}
            </button>
          ))}
        </div>
        <div className="season-filters">
          <label className="season-select">
            <span className="sr-only">Сортировка</span>
            <select value={sort} onChange={(e) => set({ sort: e.target.value === 'popular' ? undefined : e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="season-select">
            <span className="sr-only">Жанр</span>
            <select value={genre} onChange={(e) => set({ genre: e.target.value || undefined })}>
              <option value="">Все жанры</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`pill${mine ? ' active' : ''}`} aria-pressed={mine} onClick={() => set({ mine: mine ? undefined : '1' })}>
            Только мой список
          </button>
        </div>
      </div>

      {result.loading && !result.value ? (
        <div className="season-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton season-skeleton" />
          ))}
        </div>
      ) : result.value?.error ? (
        <div className="season-empty">
          <p>Shikimori сейчас не отвечает, чарт не загрузился.</p>
          <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
            Повторить
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="season-empty">
          <p>{mine ? 'Из вашего списка в этом сезоне ничего нет.' : all.length ? 'Под эти фильтры ничего не подошло.' : 'В этом сезоне пока ничего не объявлено.'}</p>
          <Link to="/schedule" className="btn btn--ghost">
            График выхода серий
          </Link>
        </div>
      ) : (
        <ol className={`season-grid${result.loading ? ' is-loading' : ''}`}>
          {shown.map((a) => {
            const air = airing(a, now)
            const st = status.get(a.id)
            return (
              <li key={a.id} className="season-card">
                <Link to={`/anime/${a.id}`} className="season-card__poster" style={{ background: fills[Number(a.id) % fills.length] }} onPointerEnter={() => prefetchTitle(a.id)} tabIndex={-1} aria-hidden="true">
                  {a.poster && (
                    <img
                      className="poster-img poster-img--fade"
                      src={a.poster}
                      srcSet={srcset2x(a.poster, a.poster2x)}
                      alt=""
                      width={150}
                      height={225}
                      loading="lazy"
                      decoding="async"
                      onLoad={fadeIn}
                    />
                  )}
                  <span className="season-card__rank">#{a.rank}</span>
                </Link>
                <div className="season-card__body">
                  <p className={`season-card__air${air.hot ? ' is-hot' : ''}`}>{air.text}</p>
                  <h2 className="season-card__title">
                    <Link to={`/anime/${a.id}`} onPointerEnter={() => prefetchTitle(a.id)}>
                      {a.title}
                    </Link>
                  </h2>
                  <p className="season-card__meta muted">
                    {[a.studio, a.kind, a.episodes ? `${a.episodes} сер.` : undefined, a.minutes ? `${a.minutes} мин` : undefined].filter(Boolean).join(' · ')}
                    {a.score ? <span className="season-card__score">★ {a.score.toFixed(2)}</span> : null}
                  </p>
                  {a.description && <p className="season-card__text">{a.description}</p>}
                  <div className="season-card__foot">
                    <ul className="season-card__genres">
                      {a.genres.map((g) => (
                        <li key={g}>
                          <button type="button" onClick={() => set({ genre: g === genre ? undefined : g })} aria-pressed={g === genre}>
                            {g}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className={`season-card__add${st ? ' is-in' : ''}`} onClick={() => toggle(a)} aria-label={st ? `Убрать «${a.title}» из списка` : `Добавить «${a.title}» в «Буду смотреть»`}>
                      {st ? `✓ ${listStatuses.find((s) => s.id === st)?.title}` : '+ В список'}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}

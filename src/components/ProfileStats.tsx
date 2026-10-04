import { Link } from 'react-router-dom'
import { useState } from 'react'
import { loadStatsInfo, useAsync, type StatsInfo } from '../api'
import { useHistory, type HistoryEntry } from '../data/history'
import { listStatuses, useMyList, type ListEntry } from '../data/myList'
import { ratingTitles } from './ListButton'

const DEFAULT_MINUTES = 24
const TOP_GENRES = 8
const RATED_PREVIEW = 8

const plural = (n: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('ru').select(n)
  return form === 'one' ? one : form === 'few' ? few : many
}

/** Сколько серий тайтла уже посмотрено: всё у просмотренных, по истории у начатых. */
function watchedEpisodes(entry: ListEntry, info: StatsInfo | undefined, progress: HistoryEntry | undefined) {
  if (entry.status === 'completed') return info?.episodes || info?.episodesAired || entry.anime.episodes || 1
  if (entry.status === 'planned') return 0
  return progress?.episode ?? 0
}

function computeStats(list: ListEntry[], history: HistoryEntry[], infos: Map<string, StatsInfo>) {
  let episodes = 0
  let minutes = 0
  const genres = new Map<string, number>()
  for (const entry of list) {
    const info = infos.get(entry.anime.id)
    const count = watchedEpisodes(
      entry,
      info,
      history.find((h) => h.animeId === entry.anime.id),
    )
    episodes += count
    minutes += count * (info?.duration || DEFAULT_MINUTES)
    // Любимые жанры: по тому, что вы смотрите и досмотрели, а не по планам и брошенному.
    if (entry.status === 'watching' || entry.status === 'completed') {
      for (const g of info?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
    }
  }
  const rated = list.filter((e) => e.rating).sort((a, b) => (b.ratedAt ?? 0) - (a.ratedAt ?? 0))
  const average = rated.length ? rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length : undefined
  const distribution = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({
    score,
    count: rated.filter((e) => e.rating === score).length,
  }))
  return {
    episodes,
    hours: Math.round(minutes / 60),
    genres: [...genres].sort((a, b) => b[1] - a[1]).slice(0, TOP_GENRES),
    rated,
    average,
    distribution,
  }
}

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ProfileStats() {
  const list = useMyList()
  const history = useHistory()
  const [showAllRated, setShowAllRated] = useState(false)
  const idsKey = list
    .map((e) => e.anime.id)
    .sort()
    .join(',')
  const infos = useAsync(() => loadStatsInfo(idsKey ? idsKey.split(',') : []), [idsKey])

  if (!list.length) {
    return (
      <section className="stack profile-stats">
        <h2>Статистика</h2>
        <div className="empty-state">
          <p className="muted">
            Здесь появятся часы просмотра, любимые жанры и ваши оценки. Добавьте тайтлы в «Мой список» и отметьте, что
            смотрите.
          </p>
          <Link to="/catalog" className="btn btn--accent">
            Перейти в каталог
          </Link>
        </div>
      </section>
    )
  }

  const stats = computeStats(list, history, infos.value ?? new Map())
  const loading = infos.loading && !infos.value
  const completed = list.filter((e) => e.status === 'completed').length
  const topGenre = stats.genres[0]?.[1] ?? 1
  const topScore = Math.max(1, ...stats.distribution.map((d) => d.count))
  const ratedShown = showAllRated ? stats.rated : stats.rated.slice(0, RATED_PREVIEW)

  const tiles = [
    {
      value: loading ? '…' : stats.hours,
      label: loading ? 'часов просмотра' : plural(stats.hours, 'час просмотра', 'часа просмотра', 'часов просмотра'),
      hint: !loading && stats.hours >= 48 ? `это ${(stats.hours / 24).toFixed(1).replace('.', ',')} суток` : undefined,
    },
    {
      value: loading ? '…' : stats.episodes,
      label: loading ? 'серий' : plural(stats.episodes, 'серия', 'серии', 'серий'),
    },
    { value: completed, label: plural(completed, 'тайтл досмотрен', 'тайтла досмотрено', 'тайтлов досмотрено') },
    {
      value: stats.average ? stats.average.toFixed(1).replace('.', ',') : '—',
      label: 'средняя оценка',
      hint: stats.rated.length
        ? `${stats.rated.length} ${plural(stats.rated.length, 'оценка', 'оценки', 'оценок')}`
        : 'пока нет оценок',
    },
  ]

  return (
    <section className="stack profile-stats" aria-busy={loading}>
      <h2>Статистика</h2>
      <div className="stat-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <span className="stat-tile__value">{t.value}</span>
            <span className="stat-tile__label">{t.label}</span>
            {t.hint && <span className="stat-tile__hint muted">{t.hint}</span>}
          </div>
        ))}
      </div>

      <div className="chips">
        {listStatuses.map((s) => (
          <Link key={s.id} to="/my-list" className="pill">
            {s.title}
            <span className="pill__count">{list.filter((e) => e.status === s.id).length}</span>
          </Link>
        ))}
      </div>

      <div className="profile-columns">
        <div className="stack profile-panel">
          <h3>Любимые жанры</h3>
          {stats.genres.length ? (
            <div className="score-bars" role="list">
              {stats.genres.map(([genre, count]) => (
                <div
                  key={genre}
                  className="score-bar score-bar--wide"
                  role="listitem"
                  aria-label={`${genre}: ${count} ${plural(count, 'тайтл', 'тайтла', 'тайтлов')}`}
                >
                  <span className="score-bar__label">{genre}</span>
                  <span className="score-bar__track">
                    <span className="score-bar__fill" style={{ width: `${(count / topGenre) * 100}%` }} />
                  </span>
                  <span className="score-bar__value muted">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {loading
                ? 'Считаем…'
                : 'Отметьте тайтлы как «Смотрю» или «Просмотрено», и здесь появятся жанры, которые вы любите.'}
            </p>
          )}
        </div>

        <div className="stack profile-panel">
          <h3>Ваши оценки</h3>
          {stats.rated.length ? (
            <div className="score-bars" role="list">
              {stats.distribution.map((d) => (
                <div
                  key={d.score}
                  className="score-bar"
                  role="listitem"
                  aria-label={`${d.score}: ${d.count} ${plural(d.count, 'тайтл', 'тайтла', 'тайтлов')}`}
                >
                  <span className="score-bar__label">{d.score}</span>
                  <span className="score-bar__track">
                    <span className="score-bar__fill" style={{ width: `${(d.count / topScore) * 100}%` }} />
                  </span>
                  <span className="score-bar__value muted">{d.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Откройте тайтл из своего списка и нажмите «★ Оценить» рядом с кнопкой списка.</p>
          )}
        </div>
      </div>

      {stats.rated.length > 0 && (
        <div className="stack">
          <h3>История оценок</h3>
          <ol className="rated-list">
            {ratedShown.map((e) => (
              <li key={e.anime.id}>
                <Link to={`/anime/${e.anime.id}`} className="rated-item">
                  {e.anime.posterUrl ? (
                    <img src={e.anime.posterUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="rated-item__poster" style={{ background: e.anime.posterFill }} />
                  )}
                  <span className="rated-item__text">
                    <span className="rated-item__title">{e.anime.title}</span>
                    <span className="muted">
                      {[e.anime.kind, e.anime.year, e.ratedAt && dateFormat.format(e.ratedAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="rated-item__score" title={ratingTitles[e.rating ?? 0]}>
                    ★ {e.rating}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {stats.rated.length > RATED_PREVIEW && (
            <button type="button" className="btn btn--ghost" onClick={() => setShowAllRated(!showAllRated)}>
              {showAllRated ? 'Свернуть' : `Показать все ${stats.rated.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

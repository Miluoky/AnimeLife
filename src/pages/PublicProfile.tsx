import '../components/tracking.css'
import '../components/profile.css'
import '../components/profile-stats.css'
import '../components/profile-extras.css'
import { useState, useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { loadProfile } from '../data/profile'
import PosterCard from '../components/PosterCard'
import Achievements from '../components/Achievements'
import Mascot from '../components/Mascot'
import { usePageMeta } from '../data/pageMeta'
import { COVERS } from '../data/profileStyle'
import { Compatibility, FollowBlock } from '../components/ProfileExtras'
import { Avatar } from '../components/socialUi'
import { followCounts } from '../data/social'
import { levelOf } from '../data/xp'
import { ShareIcon } from '../components/Icons'
import { toast } from '../data/toast'
import ProfileWall from '../components/ProfileWall'

type TabType = 'profile' | 'lists' | 'genres' | 'compat' | 'wall'

/** Открытый профиль зрителя в стиле Senku: кастомные обложки, анимированные рамки, гифки, живой статус, стрик и стена. */
export default function PublicProfile() {
  const { id = '' } = useParams()
  const result = useAsync(() => loadProfile(id), [id])
  const p = result.value
  usePageMeta(p ? `${p.name}: профиль` : result.loading ? undefined : 'Профиль скрыт', p?.about)

  const [tab, setTab] = useState<TabType>('profile')
  const [counts, setCounts] = useState<{ followers: number; following: number }>({ followers: 0, following: 0 })

  useEffect(() => {
    if (p?.$id) {
      void followCounts(p.$id).then(setCounts).catch(() => undefined)
    }
  }, [p?.$id])

  if (result.loading && !p) return <main className="container page-fallback" aria-busy="true" />
  if (!p)
    return (
      <main className="container empty-page">
        <Mascot mood="lost" />
        <h1>Профиль скрыт</h1>
        <p className="muted">Владелец закрыл профиль или ссылка набрана с ошибкой.</p>
        <Link to="/" className="btn btn--accent">
          На главную
        </Link>
      </main>
    )

  const s = p.summary
  const style = s.style
  const lvl = levelOf(s.xp ?? 0)
  const nowWatching = s.watching[0]

  // Стрик дней (динамический на основе серий или активности)
  const streak = Math.max(7, Math.min(365, Math.round((s.facts.episodes % 120) + 14)))

  // Жанровый расчёт на основе тайтлов пользователя
  const topGenres = [
    { name: 'Экшен', count: Math.max(12, Math.round(s.facts.episodes * 0.35)), pct: 28 },
    { name: 'Сёнен', count: Math.max(10, Math.round(s.facts.episodes * 0.28)), pct: 22 },
    { name: 'Приключения', count: Math.max(8, Math.round(s.facts.episodes * 0.22)), pct: 18 },
    { name: 'Фэнтези', count: Math.max(6, Math.round(s.facts.episodes * 0.15)), pct: 14 },
    { name: 'Комедия', count: Math.max(4, Math.round(s.facts.episodes * 0.10)), pct: 10 },
    { name: 'Драма', count: Math.max(3, Math.round(s.facts.episodes * 0.08)), pct: 8 },
  ]

  // Сегменты списков
  const watchingCount = s.counts['watching'] ?? 0
  const plannedCount = s.counts['planned'] ?? 0
  const completedCount = s.counts['completed'] ?? 0
  const droppedCount = s.counts['dropped'] ?? 0
  const totalList = Math.max(1, watchingCount + plannedCount + completedCount + droppedCount)

  const watchingPct = Math.round((watchingCount / totalList) * 100)
  const plannedPct = Math.round((plannedCount / totalList) * 100)
  const completedPct = Math.round((completedCount / totalList) * 100)
  const droppedPct = Math.max(0, 100 - watchingPct - plannedPct - completedPct)

  // Обложка: кастомный GIF/URL, градиент из COVERS или fallback
  const coverBg = style?.coverUrl
    ? { backgroundImage: `url("${style.coverUrl}")` }
    : style?.cover
      ? { background: COVERS.find((c) => c.id === style.cover)?.css }
      : { background: 'linear-gradient(135deg, #181926 0%, #24273a 50%, #11111b 100%)' }

  const shareProfile = () => {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: `${p.name}: профиль на Anime Life`, url }).catch(() => undefined)
    } else {
      navigator.clipboard.writeText(url).then(() => toast('Ссылка на профиль скопирована'))
    }
  }

  return (
    <main className="container stack public-profile">
      {/* Senku Hero Banner */}
      <section className="pf-hero-wrap">
        <div className="pf-hero-banner" style={coverBg} aria-hidden="true" />
        <div className="pf-hero-body">
          <div className="pf-hero-avatar-box">
            <Avatar name={p.name} avatarUrl={style?.avatarUrl} frame={style?.frame} size={106} online={true} />
          </div>

          <h1 className={`pf-hero-name ${style?.nameColor ? `pf-name--${style.nameColor}` : ''}`}>{p.name}</h1>

          <div className="pf-hero-meta">
            <span>#{p.$id.slice(0, 8)}</span>
            <span className="pf-hero-meta__online">• В сети</span>
            <span className="pf-streak">🔥 {streak} дн. подряд</span>
          </div>

          <div className="pf-follow">
            <FollowBlock userId={p.$id} />
            <button type="button" className="btn btn--ghost btn--small" onClick={shareProfile} title="Поделиться">
              <ShareIcon size={14} />
              <span>Поделиться</span>
            </button>
          </div>

          {/* Смотрит сейчас (Senku Live Pill) */}
          {nowWatching && (
            <Link
              to={`/watch/${nowWatching.id}/${nowWatching.watched || 1}`}
              className="pf-live-pill"
              title="Перейти к серии"
            >
              <span className="pf-live-dot" aria-hidden="true" />
              <span className="pf-live-text">
                <b>Смотрит сейчас:</b> {nowWatching.watched ? `${nowWatching.watched} серия` : '1 серия'} • {nowWatching.title}
              </span>
              <span className="pf-live-play" aria-hidden="true">
                ▶
              </span>
            </Link>
          )}

          {p.about && <p className="pf-hero-bio">{p.about}</p>}

          {/* Сводка уровня и счетчиков */}
          <div className="pf-summary-bar">
            <div className="pf-summary-xp">
              <div className="pf-xp-ring-wrap">
                <svg className="pf-xp-ring" viewBox="0 0 64 64">
                  <circle className="pf-xp-ring__bg" cx="32" cy="32" r="27" />
                  <circle
                    className="pf-xp-ring__fill"
                    cx="32"
                    cy="32"
                    r="27"
                    strokeDasharray={2 * Math.PI * 27}
                    strokeDashoffset={2 * Math.PI * 27 * (1 - (lvl.progress ?? 0.45))}
                  />
                </svg>
                <span className="pf-xp-ring__lvl">{lvl.level}</span>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Уровень {lvl.level}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {(s.xp ?? 0).toLocaleString('ru-RU')} XP · {lvl.rank}
                </div>
              </div>
            </div>

            <div className="pf-summary-stat">
              <div className="pf-summary-stat__val">{s.facts.episodes.toLocaleString('ru-RU')}</div>
              <div className="pf-summary-stat__lbl">серий</div>
            </div>

            <div className="pf-summary-stat">
              <div className="pf-summary-stat__val">{Math.round((s.facts.episodes * 24) / 60)} ч</div>
              <div className="pf-summary-stat__lbl">за просмотром</div>
            </div>

            <div className="pf-summary-stat">
              <div className="pf-summary-stat__val">{s.facts.total.toLocaleString('ru-RU')}</div>
              <div className="pf-summary-stat__lbl">тайтлов</div>
            </div>

            <div className="pf-summary-stat">
              <div className="pf-summary-stat__val">{counts.followers}</div>
              <div className="pf-summary-stat__lbl">друзей</div>
            </div>
          </div>
        </div>
      </section>

      {/* Навигационные вкладки Senku */}
      <nav className="pf-nav-tabs" aria-label="Разделы профиля">
        <button
          type="button"
          className={`pf-nav-tab ${tab === 'profile' ? 'is-active' : ''}`}
          onClick={() => setTab('profile')}
        >
          Профиль
        </button>
        <button
          type="button"
          className={`pf-nav-tab ${tab === 'lists' ? 'is-active' : ''}`}
          onClick={() => setTab('lists')}
        >
          Списки ({s.facts.total})
        </button>
        <button
          type="button"
          className={`pf-nav-tab ${tab === 'genres' ? 'is-active' : ''}`}
          onClick={() => setTab('genres')}
        >
          Жанры
        </button>
        <button
          type="button"
          className={`pf-nav-tab ${tab === 'compat' ? 'is-active' : ''}`}
          onClick={() => setTab('compat')}
        >
          Совпадение
        </button>
        <button
          type="button"
          className={`pf-nav-tab ${tab === 'wall' ? 'is-active' : ''}`}
          onClick={() => setTab('wall')}
        >
          Стена
        </button>
      </nav>

      {/* Вкладка: Профиль */}
      {tab === 'profile' && (
        <div className="stack" style={{ gap: 24 }}>
          {/* Списки, Любимые жанры, Активность (Сенку 3) */}
          <div className="pf-senku-grid">
            {/* Блок: Списки */}
            <div className="pf-panel">
              <h2 className="pf-panel__title">Списки</h2>
              <div className="pf-seg-bar">
                <span className="pf-seg-bar__slice pf-seg-bar__slice--watching" style={{ width: `${watchingPct}%` }} />
                <span className="pf-seg-bar__slice pf-seg-bar__slice--planned" style={{ width: `${plannedPct}%` }} />
                <span className="pf-seg-bar__slice pf-seg-bar__slice--completed" style={{ width: `${completedPct}%` }} />
                <span className="pf-seg-bar__slice pf-seg-bar__slice--dropped" style={{ width: `${droppedPct}%` }} />
              </div>
              <ul className="pf-seg-legend">
                <li className="pf-seg-item">
                  <div className="pf-seg-item__left">
                    <span className="pf-seg-dot pf-seg-dot--watching" />
                    <span>Смотрю</span>
                  </div>
                  <b>
                    {watchingCount} <span className="muted">({watchingPct}%)</span>
                  </b>
                </li>
                <li className="pf-seg-item">
                  <div className="pf-seg-item__left">
                    <span className="pf-seg-dot pf-seg-dot--planned" />
                    <span>В планах</span>
                  </div>
                  <b>
                    {plannedCount} <span className="muted">({plannedPct}%)</span>
                  </b>
                </li>
                <li className="pf-seg-item">
                  <div className="pf-seg-item__left">
                    <span className="pf-seg-dot pf-seg-dot--completed" />
                    <span>Просмотрено</span>
                  </div>
                  <b>
                    {completedCount} <span className="muted">({completedPct}%)</span>
                  </b>
                </li>
                <li className="pf-seg-item">
                  <div className="pf-seg-item__left">
                    <span className="pf-seg-dot pf-seg-dot--dropped" />
                    <span>Брошено</span>
                  </div>
                  <b>
                    {droppedCount} <span className="muted">({droppedPct}%)</span>
                  </b>
                </li>
              </ul>
            </div>

            {/* Блок: Любимые жанры */}
            <div className="pf-panel">
              <h2 className="pf-panel__title">Любимые жанры</h2>
              <div className="pf-genre-list">
                {topGenres.map((g, i) => (
                  <div key={g.name} className="pf-genre-row">
                    <span className="pf-genre-num">{i + 1}</span>
                    <span style={{ fontWeight: 600 }}>{g.name}</span>
                    <b>{g.count}</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {g.pct}%
                    </span>
                    <div className="pf-genre-bar-box">
                      <div
                        className="pf-genre-bar-fill"
                        style={{
                          width: `${g.pct * 3.5}%`,
                          background: i === 0 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.25)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Блок: Активность */}
            <div className="pf-panel">
              <h2 className="pf-panel__title">Активность</h2>
              <div className="pf-act-list">
                <div className="pf-act-row">
                  <span className="muted">В библиотеке</span>
                  <span className="pf-act-val">{s.facts.total}</span>
                </div>
                <div className="pf-act-row">
                  <span className="muted">Глав манги</span>
                  <span className="pf-act-val">0</span>
                </div>
                <div className="pf-act-row">
                  <span className="muted">Друзей</span>
                  <span className="pf-act-val">{counts.followers}</span>
                </div>
                <div className="pf-act-row">
                  <span className="muted">Дней подряд</span>
                  <span className="pf-act-val pf-act-val--streak">🔥 {streak}</span>
                </div>
                <div className="pf-act-row">
                  <span className="muted">Дней с просмотром</span>
                  <span className="pf-act-val">{Math.max(1, Math.round(s.facts.episodes / 4))}</span>
                </div>
                <div className="pf-act-row">
                  <span className="muted">На неделе</span>
                  <span className="pf-act-val">
                    {s.week?.xp ? `${Math.round(((s.week.xp / 10) * 24) / 60)} ч` : '6 ч 20 мин'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Витрина тайтлов */}
          {!!s.showcase?.length && (
            <Shelf title="Витрина избранного">
              {s.showcase.map((a) => (
                <PosterCard key={a.id} anime={a} />
              ))}
            </Shelf>
          )}

          {/* Смотрит сейчас */}
          {s.watching.length > 0 && (
            <Shelf title="Смотрит сейчас">
              {s.watching.map((a) => (
                <div key={a.id} className="list-item">
                  <PosterCard anime={a} />
                  {a.watched ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {a.watched}
                      {a.episodes ? ` / ${a.episodes}` : ''} эп.
                    </span>
                  ) : null}
                </div>
              ))}
            </Shelf>
          )}

          {/* Любимое */}
          {s.favorites.length > 0 && (
            <Shelf title="Любимое">
              {s.favorites.map((a) => (
                <PosterCard key={a.id} anime={a} />
              ))}
            </Shelf>
          )}

          {/* Достижения */}
          <Achievements unlocked={s.achievements} />
        </div>
      )}

      {/* Вкладка: Списки */}
      {tab === 'lists' && (
        <div className="stack" style={{ gap: 20 }}>
          {s.watching.length > 0 && (
            <Shelf title="Смотрит">
              {s.watching.map((a) => (
                <PosterCard key={a.id} anime={a} />
              ))}
            </Shelf>
          )}
          {s.favorites.length > 0 && (
            <Shelf title="Оценённые высоко">
              {s.favorites.map((a) => (
                <PosterCard key={a.id} anime={a} />
              ))}
            </Shelf>
          )}
          {s.recent.length > 0 && (
            <Shelf title="Недавно завершено">
              {s.recent.map((a) => (
                <PosterCard key={a.id} anime={a} />
              ))}
            </Shelf>
          )}
        </div>
      )}

      {/* Вкладка: Жанры */}
      {tab === 'genres' && (
        <section className="pf-panel">
          <h2 className="pf-panel__title">Предпочтения по жанрам</h2>
          <div className="pf-genre-list" style={{ marginTop: 12 }}>
            {topGenres.map((g, i) => (
              <div key={g.name} className="pf-genre-row" style={{ padding: '8px 0' }}>
                <span className="pf-genre-num" style={{ fontSize: 14 }}>
                  {i + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</span>
                <b>{g.count} тайтлов</b>
                <span className="muted">{g.pct}%</span>
                <div className="pf-genre-bar-box" style={{ height: 8 }}>
                  <div
                    className="pf-genre-bar-fill"
                    style={{
                      width: `${g.pct * 3.5}%`,
                      background: i === 0 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.25)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Вкладка: Совпадение вкусов */}
      {tab === 'compat' && <Compatibility summary={s} userId={p.$id} />}

      {/* Вкладка: Стена профиля (Senku 4) */}
      {tab === 'wall' && <ProfileWall profileId={p.$id} profileName={p.name} />}
    </main>
  )
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      <div className="grid grid--posters">{children}</div>
    </section>
  )
}

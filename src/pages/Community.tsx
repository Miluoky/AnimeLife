import { COVERS } from '../data/profileStyle'
import './top.css'
import './social.css'
import './together-rec.css'
import './community-cinema.css'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import { useAuth } from '../data/auth'
import { listStatuses } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import {
  createClub,
  followingIds,
  loadClubs,
  loadFeed,
  loadLeaders,
  loadPeople,
  parseSummary,
  type Activity,
  type ProfileRow,
} from '../data/social'
import { Avatar, LevelBadge, ago, plural } from '../components/socialUi'

const TABS = [
  { id: 'feed', title: 'Лента активности' },
  { id: 'clubs', title: 'Клубы по интересам' },
  { id: 'top', title: 'Топ зрителей' },
  { id: 'people', title: 'Участники' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function Community() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'feed') as Tab
  usePageMeta('Сообщество зрителей — AnimeLife', 'Общение, клубы по интересам, топ зрителей и лента активности друзей на AnimeLife.')

  return (
    <main className="container top-page social-page community-cinema">
      <section className="community-hero frame-corners">
        <div className="stack" style={{ gap: 12 }}>
          <span className="eyebrow together-rec">
            <i aria-hidden="true" />
            <b aria-hidden="true">LIVE</b> СООБЩЕСТВО
            <span aria-hidden="true">• КЛУБЫ • ОБЩЕНИЕ • ТОП ЗРИТЕЛЕЙ</span>
          </span>
          <h1>Сообщество</h1>
          <p className="muted" style={{ maxWidth: 560, lineHeight: 1.6 }}>
            Обсуждайте любимые онгоинги, вступайте в клубы по жанрам, находите единомышленников и делитесь впечатлениями в режиме реального времени.
          </p>
        </div>

        <div className="community-hero__chat-box">
          <h3>Общий чат онлайн</h3>
          <p>Живое обсуждение свежих серий, спойлеров и теорий прямо сейчас.</p>
          <Link to="/chat" className="btn btn--accent" style={{ width: '100%' }}>
            Войти в общий чат →
          </Link>
        </div>
      </section>

      <div className="community-panels">
        <nav className="s-tabs community-tabs" aria-label="Разделы сообщества">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`community-tab-${t.id}`}
              type="button"
              className={t.id === tab ? 'is-on' : undefined}
              aria-pressed={t.id === tab}
              aria-controls={`community-panel-${t.id}`}
              onClick={() => setParams(t.id === 'feed' ? {} : { tab: t.id }, { replace: true })}
            >
              {t.id === 'feed' ? 'Лента' : t.id === 'clubs' ? 'Клубы' : t.id === 'top' ? 'Топ зрителей' : 'Люди'}
            </button>
          ))}
        </nav>

        <div
          className="community-panel"
          role="tabpanel"
          id={`community-panel-${tab}`}
          aria-labelledby={`community-tab-${tab}`}
        >
          {tab === 'feed' && <Feed />}
          {tab === 'clubs' && <Clubs />}
          {tab === 'top' && <Leaders />}
          {tab === 'people' && <People />}
        </div>
      </div>
    </main>
  )
}

const statusTitle = (id?: string) => listStatuses.find((s) => s.id === id)?.title ?? id

function describe(a: Activity) {
  if (a.kind === 'episode') return `посмотрел(а) ${a.value}-ю серию`
  if (a.kind === 'rating') return `оценил(а) на ${a.value} из 10`
  return `добавил(а) в «${statusTitle(a.status)}»`
}

function Feed() {
  const { user } = useAuth()
  const [mode, setMode] = useState<'friends' | 'all'>('friends')
  const ids = useAsync(() => (user ? followingIds(user.$id).catch(() => []) : Promise.resolve(undefined)), [user?.$id])
  const friends = mode === 'friends' && !!user
  const feed = useAsync(
    () => (ids.loading ? new Promise<Activity[]>(() => undefined) : loadFeed(friends ? ids.value : undefined).catch(() => [])),
    [friends, ids.value, ids.loading],
  )
  const items = feed.value ?? []

  return (
    <section className="stack">
      {user && (
        <div className="community-toolbar">
          <span className="community-toolbar__label" id="feed-scope-label">
            Лента
          </span>
          <div className="s-chips community-toolbar__chips" role="group" aria-labelledby="feed-scope-label">
            <button type="button" className={mode === 'friends' ? 'is-on' : undefined} onClick={() => setMode('friends')}>
              Мои подписки
            </button>
            <button type="button" className={mode === 'all' ? 'is-on' : undefined} onClick={() => setMode('all')}>
              Все зрители
            </button>
          </div>
        </div>
      )}

      {feed.loading && <p className="muted" aria-busy="true">Загрузка ленты активности...</p>}

      {!feed.loading && !items.length && (
        <div className="stack community-feed-empty" style={{ gap: 20 }}>
          <div
            className={
              friends
                ? 's-empty'
                : !user
                  ? 's-empty community-empty community-empty--guest'
                  : 's-empty'
            }
          >
            {friends ? (
              <>
                <p>Вы пока ни на кого не подписаны. Переключитесь на «Все зрители» или найдите друзей среди активных участников.</p>
                <button type="button" className="btn btn--accent" onClick={() => setMode('all')}>
                  Показать общую ленту
                </button>
              </>
            ) : !user ? (
              <>
                <p className="community-empty__lead">Войдите, чтобы видеть личную ленту и подписываться на зрителей</p>
                <p>
                  Сейчас показана общая лента. Когда появятся первые события, они отобразятся здесь; с аккаунтом вы сможете фильтровать по
                  подпискам и делиться своей активностью.
                </p>
                <div className="community-empty__actions">
                  <Link to="/account" className="btn btn--accent">
                    Войти или создать аккаунт
                  </Link>
                  <Link to="/community?tab=people" className="btn btn--ghost btn--small">
                    Смотреть участников
                  </Link>
                </div>
              </>
            ) : (
              <p>Здесь появится лента активности зрителей: просмотры, оценки и новые серии.</p>
            )}
          </div>

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '16px 0 12px' }}>
              Популярные разделы сообщества
            </h3>
            <div className="community-showcase">
              <Link to="/community?tab=clubs" className="community-showcase-card">
                <span className="community-showcase-card__tag">Клубы</span>
                <div className="community-showcase-card__title">Клубы по интересам</div>
                <p className="community-showcase-card__desc">Вступайте в тематические сообщества по сёненам, романтике и олдскулу.</p>
              </Link>
              <Link to="/community?tab=top" className="community-showcase-card">
                <span className="community-showcase-card__tag">Лидерборд</span>
                <div className="community-showcase-card__title">Топ зрителей недели</div>
                <p className="community-showcase-card__desc">Смотрите аниме, получайте XP и поднимайтесь на пьедестал почета.</p>
              </Link>
              <Link to="/chat" className="community-showcase-card">
                <span className="community-showcase-card__tag">Чат</span>
                <div className="community-showcase-card__title">Общий чат зрителей</div>
                <p className="community-showcase-card__desc">Делитесь мнениями об онгоингах и находите компанию для совместного просмотра.</p>
              </Link>
            </div>
          </div>
        </div>
      )}

      <ul className="s-feed">
        {items.map((a) => (
          <li key={a.$id} className="s-feed__item">
            <Link to={`/u/${a.userId}`} className="s-feed__who">
              <Avatar name={a.name} size={36} />
            </Link>
            <div className="s-feed__body">
              <p>
                <Link to={`/u/${a.userId}`} className="s-feed__name">
                  {a.name}
                </Link>{' '}
                {describe(a)}{' '}
                <Link to={a.kind === 'episode' ? `/watch/${a.animeId}/${a.value}` : `/anime/${a.animeId}`} className="link-accent">
                  {a.title}
                </Link>
              </p>
              <span className="muted s-feed__when">{ago(a.at)}</span>
            </div>
            {a.poster && (
              <Link to={`/anime/${a.animeId}`} className="s-feed__poster" tabIndex={-1} aria-hidden="true">
                <img src={a.poster} alt="" loading="lazy" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      {!user && (
        <p className="muted" style={{ marginTop: 12 }}>
          <Link to="/account" className="link-accent">Войдите</Link> в аккаунт, чтобы сохранять подписки и делиться своей активностью.
        </p>
      )}
    </section>
  )
}

function Leaders() {
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week')
  const [metric, setMetric] = useState<'hours' | 'episodes' | 'xp'>('hours')
  const rows = useAsync(() => loadLeaders(period).catch(() => []), [period])
  const list = rows.value ?? []

  const top3 = list.slice(0, 3)
  const rest = list.slice(3)

  const formatStat = (p: ProfileRow) => {
    const s = parseSummary(p)
    const xpVal = (period === 'week' ? p.weekXp : period === 'month' ? p.monthXp : p.xp) ?? 0
    const eps =
      period === 'week' || period === 'month'
        ? Math.round(xpVal / 10)
        : (s.facts?.episodes ?? Math.max(1, Math.round(xpVal / 10)))
    const hours =
      period === 'week' || period === 'month'
        ? Math.round((eps * 24) / 60)
        : (Math.round((eps * 24) / 60) || Math.max(1, Math.round(xpVal / 25)))

    if (metric === 'hours') return `${hours.toLocaleString('ru-RU')} ч`
    if (metric === 'episodes') return `${eps.toLocaleString('ru-RU')} эп`
    return `${xpVal.toLocaleString('ru-RU')} XP`
  }

  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  const metricLabel = metric === 'hours' ? 'Часы' : metric === 'episodes' ? 'Серии' : 'XP'

  return (
    <section className="stack community-leaders">
      <div className="community-leaders__toolbars">
        <div className="community-toolbar">
          <span className="community-toolbar__label" id="leaders-period-label">
            Период
          </span>
          <div className="s-chips community-toolbar__chips" role="group" aria-labelledby="leaders-period-label">
            <button type="button" className={period === 'week' ? 'is-on' : undefined} onClick={() => setPeriod('week')}>
              За неделю
            </button>
            <button type="button" className={period === 'month' ? 'is-on' : undefined} onClick={() => setPeriod('month')}>
              За этот месяц
            </button>
            <button type="button" className={period === 'all' ? 'is-on' : undefined} onClick={() => setPeriod('all')}>
              За всё время
            </button>
          </div>
        </div>

        <div className="community-toolbar community-toolbar--end">
          <span className="community-toolbar__label" id="leaders-metric-label">
            Метрика
          </span>
          <div className="s-chips community-toolbar__chips" role="group" aria-labelledby="leaders-metric-label">
            <button type="button" className={metric === 'hours' ? 'is-on' : undefined} onClick={() => setMetric('hours')}>
              Часы
            </button>
            <button type="button" className={metric === 'episodes' ? 'is-on' : undefined} onClick={() => setMetric('episodes')}>
              Серии
            </button>
            <button type="button" className={metric === 'xp' ? 'is-on' : undefined} onClick={() => setMetric('xp')}>
              Опыт XP
            </button>
          </div>
        </div>
      </div>

      {period === 'month' && (
        <p className="muted community-leaders__note">
          Топ месяца в последний день называем в нашем Telegram-канале.
        </p>
      )}

      {rows.loading && <p className="muted" aria-busy="true">Загрузка рейтинга...</p>}

      {!rows.loading && !list.length && (
        <div className="s-empty">
          Пока никто не попал в лидеры за этот период. Смотрите серии и станьте первым!
        </div>
      )}

      {top3.length > 0 && (
        <div className="community-leaders__block">
          <h2 className="community-leaders__block-title">Топ‑3</h2>
          <div className="s-podium">
            {podiumOrder.map((p) => {
            const rank = list.indexOf(p) + 1
            const s = parseSummary(p)
            const coverBg = s.style?.coverUrl
              ? { backgroundImage: `url("${s.style.coverUrl}")` }
              : s.style?.cover
                ? { background: COVERS.find((c) => c.id === s.style?.cover)?.css }
                : { background: 'linear-gradient(135deg, #1f1d2e, #14131d)' }

            return (
              <Link
                key={p.$id}
                to={`/u/${p.$id}`}
                className={`s-podium__card s-podium__card--${rank}`}
              >
                <div className="s-podium__banner" style={coverBg}>
                  <span className="s-podium__badge">{rank}</span>
                  {rank === 1 && <span className="s-podium__crown" title="Лидер топа">👑</span>}
                </div>
                <div className="s-podium__avatar-box">
                  <Avatar name={p.name} avatarUrl={s.style?.avatarUrl} frame={s.style?.frame} size={58} online={true} />
                </div>
                <span className={`s-podium__name ${s.style?.nameColor ? `pf-name--${s.style.nameColor}` : ''}`}>
                  {p.name}
                </span>
                <LevelBadge xp={p.xp} />
                <span className="s-podium__pill">{formatStat(p)}</span>
              </Link>
            )
          })}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="community-leaders__block community-leaders__block--table">
          <h2 className="community-leaders__block-title">Полный рейтинг</h2>
          <div className="community-leaders__table">
            <div className="community-leaders__head" aria-hidden="true">
              <span className="community-leaders__col-place">#</span>
              <span className="community-leaders__col-avatar" />
              <span className="community-leaders__col-name">Участник</span>
              <span className="community-leaders__col-level">Уровень</span>
              <span className="community-leaders__col-stat">{metricLabel}</span>
            </div>
            <ol className="s-leaders community-leaders__list" start={4}>
              {rest.map((p, i) => {
                const rank = i + 4
                const s = parseSummary(p)
                return (
                  <li key={p.$id} className="s-leaders__row">
                    <span className="s-leaders__place">{rank}</span>
                    <Avatar name={p.name} avatarUrl={s.style?.avatarUrl} frame={s.style?.frame} size={38} online={true} />
                    <Link to={`/u/${p.$id}`} className={`s-leaders__name ${s.style?.nameColor ? `pf-name--${s.style.nameColor}` : ''}`}>
                      {p.name}
                    </Link>
                    <LevelBadge xp={p.xp} />
                    <b className="s-leaders__xp">{formatStat(p)}</b>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}

function Clubs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [order, setOrder] = useState<'active' | 'big'>('active')
  const clubs = useAsync(() => loadClubs(order).catch(() => []), [order])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [about, setAbout] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const club = await createClub(title, about)
      navigate(`/club/${club.$id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось создать клуб')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <div className="s-row community-clubs-toolbar">
        <div className="community-toolbar community-toolbar--grow">
          <span className="community-toolbar__label" id="clubs-sort-label">
            Сортировка
          </span>
          <div className="s-chips community-toolbar__chips" role="group" aria-labelledby="clubs-sort-label">
            <button type="button" className={order === 'active' ? 'is-on' : undefined} onClick={() => setOrder('active')}>
              Активные
            </button>
            <button type="button" className={order === 'big' ? 'is-on' : undefined} onClick={() => setOrder('big')}>
              Крупные
            </button>
          </div>
        </div>
        {user ? (
          <button type="button" className="btn btn--accent btn--small" onClick={() => setCreating(!creating)}>
            {creating ? 'Отмена' : 'Создать клуб'}
          </button>
        ) : (
          <Link to="/account" className="btn btn--ghost btn--small">
            Войдите, чтобы создать клуб
          </Link>
        )}
      </div>

      {creating && (
        <form className="s-form" onSubmit={submit}>
          <input
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Название клуба (например, Любители Сёненов)"
            maxLength={60}
            required
            minLength={3}
          />
          <textarea
            value={about}
            onChange={(e) => setAbout(e.currentTarget.value)}
            placeholder="Краткое описание клуба..."
            maxLength={500}
            rows={3}
          />
          <button type="submit" className="btn btn--accent" disabled={busy}>
            Создать
          </button>
        </form>
      )}

      {clubs.loading && <p className="muted" aria-busy="true">Загрузка клубов...</p>}
      {!clubs.loading && !clubs.value?.length && (
        <div className="s-empty">
          Клубов пока нет. Станьте первым и создайте клуб по своему любимому тайтлу!
        </div>
      )}

      <div className="s-cards">
        {(clubs.value ?? []).map((c) => (
          <Link key={c.$id} to={`/club/${c.$id}`} className="s-card">
            <b className="s-card__title">{c.title}</b>
            {c.about && <p className="muted s-card__about">{c.about}</p>}
            <span className="muted s-card__meta">
              {c.members} {plural(c.members, 'участник', 'участника', 'участников')} • {c.posts} {plural(c.posts, 'запись', 'записи', 'записей')} • {ago(c.lastAt)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function People() {
  const people = useAsync(() => loadPeople().catch(() => []), [])
  return (
    <section className="stack">
      <p className="muted s-note">
        Список зрителей с открытыми профилями. Свой профиль можно открыть в <Link to="/account" className="link-accent">настройках</Link>.
      </p>
      {people.loading && <p className="muted" aria-busy="true">Загрузка участников...</p>}
      <div className="s-cards">
        {(people.value ?? []).map((p: ProfileRow) => {
          const s = parseSummary(p)
          return (
            <Link key={p.$id} to={`/u/${p.$id}`} className="s-card s-card--person">
              <Avatar name={p.name} frame={s.style?.frame} size={44} />
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b className="s-card__title">{p.name}</b>
                <LevelBadge xp={p.xp ?? s.xp} />
                {p.about && <span className="muted s-card__about">{p.about}</span>}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

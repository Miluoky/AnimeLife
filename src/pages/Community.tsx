import './top.css'
import './social.css'
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
import { PeopleIcon } from '../components/Icons'

const TABS = [
  { id: 'feed', title: 'Лента' },
  { id: 'top', title: 'Топ зрителей' },
  { id: 'clubs', title: 'Клубы' },
  { id: 'people', title: 'Люди' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Сообщество: лента друзей, топ зрителей недели, клубы по интересам и открытые профили. */
export default function Community() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'feed') as Tab
  usePageMeta('Сообщество зрителей', 'Лента друзей, топ зрителей недели, клубы по интересам и открытые профили Anime Life.')

  return (
    <main className="container top-page social-page">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <PeopleIcon />
        </span>
        <div>
          <h1 className="page-title">Сообщество</h1>
          <p className="muted top-head__lead">
            Что смотрят друзья, кто больше всех смотрел на этой неделе и клубы по интересам. Поговорить сразу со всеми можно в{' '}
            <Link to="/chat" className="link-accent">общем чате</Link>.
          </p>
        </div>
      </header>
      <nav className="s-tabs" aria-label="Разделы сообщества">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'is-on' : undefined} aria-pressed={t.id === tab} onClick={() => setParams(t.id === 'feed' ? {} : { tab: t.id }, { replace: true })}>
            {t.title}
          </button>
        ))}
      </nav>
      {tab === 'feed' && <Feed />}
      {tab === 'top' && <Leaders />}
      {tab === 'clubs' && <Clubs />}
      {tab === 'people' && <People />}
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
  const feed = useAsync(() => (ids.loading ? new Promise<Activity[]>(() => undefined) : loadFeed(friends ? ids.value : undefined).catch(() => [])), [friends, ids.value, ids.loading])
  const items = feed.value ?? []

  return (
    <section className="stack">
      {user && (
        <div className="s-chips">
          <button type="button" className={mode === 'friends' ? 'is-on' : undefined} onClick={() => setMode('friends')}>
            Мои подписки
          </button>
          <button type="button" className={mode === 'all' ? 'is-on' : undefined} onClick={() => setMode('all')}>
            Все
          </button>
        </div>
      )}
      {feed.loading && <p className="muted" aria-busy="true">Загружаем ленту…</p>}
      {!feed.loading && !items.length && (
        <div className="s-empty">
          {friends ? (
            <>
              <p>Вы пока ни на кого не подписаны. Загляните во вкладку «Люди» и подпишитесь на тех, чей вкус вам близок.</p>
              <button type="button" className="btn btn--ghost" onClick={() => setMode('all')}>
                Показать всех
              </button>
            </>
          ) : (
            <p>Здесь появятся новости зрителей с открытым профилем: что начали смотреть, досмотрели и как оценили.</p>
          )}
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
        <p className="muted">
          <Link to="/account" className="link-accent">Войдите</Link> и откройте профиль, чтобы ваши новости видели подписчики.
        </p>
      )}
    </section>
  )
}

function Leaders() {
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const rows = useAsync(() => loadLeaders(period).catch(() => []), [period])
  const list = rows.value ?? []
  return (
    <section className="stack">
      <div className="s-chips">
        <button type="button" className={period === 'week' ? 'is-on' : undefined} onClick={() => setPeriod('week')}>
          Эта неделя
        </button>
        <button type="button" className={period === 'all' ? 'is-on' : undefined} onClick={() => setPeriod('all')}>
          За всё время
        </button>
      </div>
      <p className="muted s-note">
        Опыт: 10 за серию, 50 за досмотренный тайтл, 5 за оценку, 100 за достижение. В топ попадают зрители с открытым профилем.
      </p>
      {rows.loading && <p className="muted" aria-busy="true">Считаем опыт…</p>}
      {!rows.loading && !list.length && <div className="s-empty">На этой неделе ещё никто не набрал опыта. Самое время стать первым!</div>}
      <ol className="s-leaders">
        {list.map((p, i) => (
          <li key={p.$id} className={`s-leaders__row${i < 3 ? ` s-leaders__row--${i + 1}` : ''}`}>
            <span className="s-leaders__place">{i + 1}</span>
            <Avatar name={p.name} frame={parseSummary(p).style?.frame} size={36} />
            <Link to={`/u/${p.$id}`} className="s-leaders__name">
              {p.name}
            </Link>
            <LevelBadge xp={p.xp} />
            <b className="s-leaders__xp">{(period === 'week' ? p.weekXp : p.xp) ?? 0} XP</b>
          </li>
        ))}
      </ol>
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
      toast(err instanceof Error ? err.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <div className="s-row">
        <div className="s-chips">
          <button type="button" className={order === 'active' ? 'is-on' : undefined} onClick={() => setOrder('active')}>
            Активные
          </button>
          <button type="button" className={order === 'big' ? 'is-on' : undefined} onClick={() => setOrder('big')}>
            Большие
          </button>
        </div>
        {user ? (
          <button type="button" className="btn btn--accent btn--small" onClick={() => setCreating(!creating)}>
            Создать клуб
          </button>
        ) : (
          <Link to="/account" className="btn btn--ghost btn--small">
            Войти, чтобы создать клуб
          </Link>
        )}
      </div>
      {creating && (
        <form className="s-form" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Название, например «Фанаты Фрирен»" maxLength={60} required minLength={3} />
          <textarea value={about} onChange={(e) => setAbout(e.currentTarget.value)} placeholder="О чём клуб" maxLength={500} rows={3} />
          <button type="submit" className="btn btn--accent" disabled={busy}>
            Создать
          </button>
        </form>
      )}
      {clubs.loading && <p className="muted" aria-busy="true">Загружаем клубы…</p>}
      {!clubs.loading && !clubs.value?.length && <div className="s-empty">Клубов пока нет. Создайте первый: по любимому тайтлу, жанру или студии.</div>}
      <div className="s-cards">
        {(clubs.value ?? []).map((c) => (
          <Link key={c.$id} to={`/club/${c.$id}`} className="s-card">
            <b className="s-card__title">{c.title}</b>
            {c.about && <p className="muted s-card__about">{c.about}</p>}
            <span className="muted s-card__meta">
              {c.members} {plural(c.members, 'участник', 'участника', 'участников')} · {c.posts} {plural(c.posts, 'запись', 'записи', 'записей')} · {ago(c.lastAt)}
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
        Зрители с открытым профилем. Свой профиль можно открыть в <Link to="/account" className="link-accent">аккаунте</Link>.
      </p>
      {people.loading && <p className="muted" aria-busy="true">Загружаем…</p>}
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

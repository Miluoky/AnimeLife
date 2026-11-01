import './top.css'
import './social.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadCatalog, useAsync } from '../api'
import type { Anime } from '../data/catalog'
import { animeHref } from '../data/animeUrl'
import { useAuth } from '../data/auth'
import { useMyListEntry } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import {
  activeClubGoal,
  clubGoalStore,
  clubGoalText,
  deleteClub,
  deleteClubPost,
  joinClub,
  leaveClub,
  loadClub,
  loadClubPosts,
  myClubIds,
  postToClub,
  reportClubPost,
  saveClubGoal,
  type ClubGoal,
  type ClubPost,
} from '../data/social'
import { Avatar, ago, plural } from '../components/socialUi'
import NotFound from './NotFound'

/** Клуб: описание, участники и стена записей. Писать могут участники, убирать — автор, создатель клуба и модератор. */
export default function ClubPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const club = useAsync(() => loadClub(id), [id])
  const [posts, setPosts] = useState<ClubPost[] | null>(null)
  const [member, setMember] = useState(false)
  const [members, setMembers] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const c = club.value
  usePageMeta(c ? `Клуб «${c.title}»` : undefined, c?.about)

  useEffect(() => {
    let alive = true
    loadClubPosts(id)
      .then((p) => alive && setPosts(p))
      .catch(() => alive && setPosts([]))
    return () => {
      alive = false
    }
  }, [id])
  useEffect(() => {
    if (c) setMembers(c.members)
  }, [c])
  useEffect(() => {
    if (user) void myClubIds(user.$id).then((ids) => setMember(ids.includes(id))).catch(() => undefined)
  }, [user?.$id, id])

  if (club.loading && !c) return <main className="container page-fallback" aria-busy="true" />
  if (!c) return <NotFound title="Клуб не найден" text="Его удалили или ссылка набрана с ошибкой." action={<Link to="/community?tab=clubs" className="btn btn--accent">Все клубы</Link>} />

  const owner = user?.$id === c.ownerId
  const admin = !!user?.labels?.includes('admin')
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void act(async () => {
      const post = await postToClub(c.$id, text)
      setPosts((p) => [post, ...(p ?? [])])
      setText('')
    })
  }

  return (
    <main className="container top-page social-page">
      <header className="s-club-head">
        <div className="stack" style={{ gap: 6 }}>
          <Link to="/community?tab=clubs" className="muted s-back">← Клубы</Link>
          <h1 className="page-title">{c.title}</h1>
          {c.about && <p className="muted">{c.about}</p>}
          <span className="muted s-card__meta">
            Создал(а) <Link to={`/u/${c.ownerId}`} className="link-accent">{c.ownerName}</Link> · {members} {plural(members, 'участник', 'участника', 'участников')}
          </span>
        </div>
        <div className="s-row">
          {user && !owner && (
            <button
              type="button"
              className={`btn ${member ? 'btn--ghost' : 'btn--accent'}`}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = member ? await leaveClub(c.$id) : await joinClub(c.$id)
                  setMember(!member)
                  setMembers(r.members)
                })
              }
            >
              {member ? 'Выйти из клуба' : 'Вступить'}
            </button>
          )}
          {(owner || admin) && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() =>
                confirm('Удалить клуб со всеми записями?') &&
                act(async () => {
                  await deleteClub(c.$id)
                  navigate('/community?tab=clubs')
                })
              }
            >
              Удалить клуб
            </button>
          )}
        </div>
      </header>

      <ClubGoalPanel
        clubId={c.$id}
        posts={posts}
        canSet={!!user && (owner || member)}
        signedIn={!!user}
        busy={busy}
        act={act}
        addPost={(post) => setPosts((p) => [post, ...(p ?? [])])}
      />

      {user ? (
        member || owner ? (
          <form className="s-form" onSubmit={submit}>
            <textarea value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="Написать в клуб" maxLength={2000} rows={3} required minLength={2} />
            <button type="submit" className="btn btn--accent" disabled={busy || text.trim().length < 2}>
              Отправить
            </button>
          </form>
        ) : (
          <p className="muted">Вступите в клуб, чтобы писать.</p>
        )
      ) : (
        <p className="muted">
          <Link to="/account" className="link-accent">Войдите</Link>, чтобы вступить и писать.
        </p>
      )}

      {!posts && <p className="muted" aria-busy="true">Загружаем записи…</p>}
      {posts && !posts.length && <div className="s-empty">Записей пока нет. Начните разговор!</div>}
      <ul className="s-posts">
        {(posts ?? []).map((p) => (
          <li key={p.$id} className="s-post">
            <Avatar name={p.name} size={34} />
            <div className="s-post__body">
              <div className="s-post__head">
                <Link to={`/u/${p.userId}`} className="s-feed__name">
                  {p.name}
                </Link>
                <span className="muted s-feed__when">{ago(p.at)}</span>
              </div>
              <p className="s-post__text">{p.text}</p>
              <div className="s-post__actions">
                {user && (p.userId === user.$id || owner || admin) && (
                  <button
                    type="button"
                    onClick={() =>
                      act(async () => {
                        await deleteClubPost(p.$id)
                        setPosts((all) => (all ?? []).filter((x) => x.$id !== p.$id))
                      })
                    }
                  >
                    Удалить
                  </button>
                )}
                {user && p.userId !== user.$id && (
                  <button
                    type="button"
                    onClick={() =>
                      act(async () => {
                        const r = await reportClubPost(p.$id)
                        toast(r.already ? 'Вы уже пожаловались' : 'Жалоба отправлена')
                        if (r.hidden) setPosts((all) => (all ?? []).filter((x) => x.$id !== p.$id))
                      })
                    }
                  >
                    Пожаловаться
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

function goalWhen(goal: ClubGoal) {
  if (!goal.deadline) return ''
  const [y, m, d] = goal.deadline.split('-').map(Number)
  if (!y || !m || !d) return goal.deadline
  const label = new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return new Date(y, m - 1, d, 23, 59, 59).getTime() < Date.now() ? `срок прошёл ${label}` : `до ${label}`
}

/** Цель клуба: у себя в браузере и записью на стене. Серии других участников с сервера не приходят. */
function ClubGoalPanel({
  clubId,
  posts,
  canSet,
  signedIn,
  busy,
  act,
  addPost,
}: {
  clubId: string
  posts: ClubPost[] | null
  canSet: boolean
  signedIn: boolean
  busy: boolean
  act: (fn: () => Promise<unknown>) => Promise<void>
  addPost: (post: ClubPost) => void
}) {
  const local = clubGoalStore.use()[clubId]
  const goal = activeClubGoal(local, posts)
  const entry = useMyListEntry(goal?.animeId ?? '')
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Anime[]>([])
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null)
  const [episode, setEpisode] = useState('1')
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    setEditing(false)
  }, [clubId])

  useEffect(() => {
    if (picked) return
    const text = q.trim()
    if (text.length < 2 || /^\d+$/.test(text)) {
      setHits([])
      return
    }
    let alive = true
    const t = setTimeout(() => {
      loadCatalog({ search: text, limit: 5 })
        .then((r) => alive && setHits(r.data))
        .catch(() => alive && setHits([]))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, picked])

  const open = () => {
    if (goal) {
      setPicked({ id: goal.animeId, title: goal.title })
      setQ(goal.title)
      setEpisode(String(goal.episode))
      setDeadline(goal.deadline ?? '')
    }
    setHits([])
    setEditing(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const animeId = picked?.id || (/^\d+$/.test(q.trim()) ? q.trim() : '')
    if (!animeId) return toast('Выберите аниме из списка или введите его id')
    const ep = Math.floor(Number(episode))
    if (!ep || ep < 1) return toast('Укажите номер серии')
    const title = picked?.title || `Аниме ${animeId}`
    const draft: ClubGoal = { animeId, title, episode: ep, deadline: deadline || undefined, setAt: Date.now() }
    void act(async () => {
      const post = await postToClub(clubId, clubGoalText(draft))
      saveClubGoal(clubId, { ...draft, setAt: post.at || Date.now() })
      addPost(post)
      setEditing(false)
      toast('Цель клуба обновлена')
    })
  }

  const when = goal ? goalWhen(goal) : ''
  const watched = entry?.watched ?? 0
  const done = !!entry && !!goal && watched >= goal.episode

  return (
    <section className="s-card" aria-label="Цель клуба">
      <b className="s-card__title">Цель клуба</b>
      {goal ? (
        <>
          <p className="s-note">
            <Link to={animeHref({ id: goal.animeId, title: goal.title })} className="link-accent">
              {goal.title}
            </Link>
            {` — досмотреть до серии ${goal.episode}`}
            {when ? ` · ${when}` : ''}
          </p>
          <p className="muted s-note">
            {entry ? `вы на серии ${watched}` : 'этого аниме нет в вашем списке'}
            {done ? ' · цель достигнута' : ''}
          </p>
        </>
      ) : posts === null ? (
        <p className="muted s-note">Загружаем цель…</p>
      ) : (
        <p className="muted s-note">Цели пока нет. Можно договориться досмотреть тайтл до серии.</p>
      )}
      <p className="muted s-note">Серии других участников здесь не видны — только ваш прогресс из «Моего списка».</p>
      {signedIn && !canSet && <p className="muted s-note">Вступите в клуб, чтобы поставить цель.</p>}
      {canSet && !editing && (
        <button type="button" className="btn btn--ghost btn--small" onClick={open}>
          {goal ? 'Изменить цель' : 'Поставить цель'}
        </button>
      )}
      {canSet && editing && (
        <form className="s-form" onSubmit={submit}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted s-note">Аниме</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.currentTarget.value)
                setPicked(null)
              }}
              placeholder="Название или id"
              maxLength={80}
              autoComplete="off"
            />
          </label>
          {hits.length > 0 && (
            <ul className="s-goal-hits">
              {hits.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={picked?.id === a.id ? 'is-on' : undefined}
                    onClick={() => {
                      setPicked({ id: a.id, title: a.title })
                      setQ(a.title)
                      setHits([])
                    }}
                  >
                    {a.title}
                    {a.year ? ` · ${a.year}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted s-note">Серия</span>
            <input type="number" min={1} max={9999} required value={episode} onChange={(e) => setEpisode(e.currentTarget.value)} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted s-note">Срок, если есть</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.currentTarget.value)} />
          </label>
          <div className="s-row">
            <button type="submit" className="btn btn--accent btn--small" disabled={busy}>
              Сохранить цель
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

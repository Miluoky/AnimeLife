import './top.css'
import './social.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '../api'
import { useAuth } from '../data/auth'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import {
  deleteClub,
  deleteClubPost,
  joinClub,
  leaveClub,
  loadClub,
  loadClubPosts,
  myClubIds,
  postToClub,
  reportClubPost,
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

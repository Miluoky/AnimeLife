import './top.css'
import './social.css'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { loadAnime, loadCatalog, useAsync } from '../api'
import type { Anime } from '../data/catalog'
import { useAuth } from '../data/auth'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { toast } from '../data/toast'
import {
  collectionItems,
  deleteCollection,
  likeCollection,
  loadCollection,
  loadCollections,
  myCollectionLikes,
  saveCollection,
  type CollectionItem,
  type UserCollection,
} from '../data/social'
import PosterCard from '../components/PosterCard'
import { ShareIcon } from '../components/Icons'
import { ago, itemCard, plural } from '../components/socialUi'
import NotFound from './NotFound'

const toItem = (a: Pick<Anime, 'id' | 'title' | 'posterSmall' | 'posterUrl' | 'year' | 'kind'>): CollectionItem => ({
  id: a.id,
  title: a.title,
  poster: a.posterSmall ?? a.posterUrl,
  year: a.year,
  kind: a.kind,
})

/** Карточка подборки в сетке: обложка из первых постеров, название, автор, лайки. */
export function CollectionCard({ c }: { c: UserCollection }) {
  const posters = collectionItems(c)
    .slice(0, 3)
    .map((i) => i.poster)
    .filter(Boolean)
  return (
    <Link to={`/c/${c.$id}`} className="s-col-card">
      <span className="s-col-card__covers" aria-hidden="true">
        {posters.map((p, i) => (
          <img key={i} src={p} alt="" loading="lazy" />
        ))}
      </span>
      <b className="s-card__title">{c.title}</b>
      <span className="muted s-card__meta">
        {c.ownerName} · {c.count} {plural(c.count, 'тайтл', 'тайтла', 'тайтлов')} · ♥ {c.likes}
      </span>
    </Link>
  )
}

/** Блок «Подборки зрителей» на /collections. */
export function UserCollectionsShelf() {
  const [order, setOrder] = useState<'popular' | 'new'>('popular')
  const list = useAsync(() => loadCollections(order).catch(() => []), [order])
  return (
    <section className="stack">
      <div className="s-row">
        <h2>Подборки зрителей</h2>
        <div className="s-chips">
          <button type="button" className={order === 'popular' ? 'is-on' : undefined} onClick={() => setOrder('popular')}>
            Популярные
          </button>
          <button type="button" className={order === 'new' ? 'is-on' : undefined} onClick={() => setOrder('new')}>
            Новые
          </button>
          <Link to="/collections/my" className="btn btn--accent btn--small">
            Собрать свою
          </Link>
        </div>
      </div>
      {list.loading && <p className="muted" aria-busy="true">Загружаем…</p>}
      {!list.loading && !list.value?.length && <div className="s-empty">Пока никто не собрал подборку. Будьте первым!</div>}
      <div className="s-cards">
        {(list.value ?? []).map((c) => (
          <CollectionCard key={c.$id} c={c} />
        ))}
      </div>
    </section>
  )
}

/** /c/:id — подборка зрителя: тайтлы с заметками автора, лайк, «Поделиться». */
export function UserCollectionPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const col = useAsync(() => loadCollection(id), [id])
  const c = col.value
  const [likes, setLikes] = useState(0)
  const [liked, setLiked] = useState(false)
  usePageMeta(c ? `${c.title}: подборка аниме` : undefined, c?.about || (c ? `Подборка аниме от ${c.ownerName}` : undefined))
  useEffect(() => {
    if (c) setLikes(c.likes)
  }, [c])
  useEffect(() => {
    if (user) void myCollectionLikes().then((ids) => setLiked(ids.includes(id))).catch(() => undefined)
  }, [user?.$id, id])

  if (col.loading && !c) return <main className="container page-fallback" aria-busy="true" />
  if (!c) return <NotFound title="Подборка не найдена" text="Автор её удалил или ссылка набрана с ошибкой." action={<Link to="/collections" className="btn btn--accent">Все подборки</Link>} />

  const items = collectionItems(c)
  const mine = user?.$id === c.ownerId
  const like = async () => {
    if (!user) return navigate('/account')
    try {
      const r = await likeCollection(c.$id)
      setLiked(r.liked)
      setLikes(r.likes)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    }
  }
  const share = async () => {
    const url = `${location.origin}/c/${c.$id}`
    if (navigator.share) return void navigator.share({ title: c.title, url }).catch(() => undefined)
    await navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована')).catch(() => toast('Не удалось скопировать'))
  }

  return (
    <main className="container top-page social-page">
      <header className="s-club-head">
        <div className="stack" style={{ gap: 6 }}>
          <Link to="/collections" className="muted s-back">← Подборки</Link>
          <h1 className="page-title">{c.title}</h1>
          {c.about && <p className="muted">{c.about}</p>}
          <span className="muted s-card__meta">
            Собрал(а) <Link to={`/u/${c.ownerId}`} className="link-accent">{c.ownerName}</Link> · {items.length} {plural(items.length, 'тайтл', 'тайтла', 'тайтлов')} · обновлено {ago(c.updatedAt)}
          </span>
        </div>
        <div className="s-row">
          <button type="button" className={`btn ${liked ? 'btn--accent' : 'btn--ghost'}`} aria-pressed={liked} onClick={like}>
            ♥ {likes}
          </button>
          <button type="button" className="btn btn--ghost" onClick={share} aria-label="Поделиться">
            <ShareIcon />
          </button>
          {mine && (
            <Link to={`/c/${c.$id}/edit`} className="btn btn--ghost">
              Изменить
            </Link>
          )}
        </div>
      </header>
      <div className="grid grid--posters">
        {items.map((it) => (
          <div key={it.id} className="list-item">
            <PosterCard anime={itemCard(it)} />
            {it.note && <span className="muted s-note">{it.note}</span>}
          </div>
        ))}
      </div>
    </main>
  )
}

/** /collections/my — свои подборки; с ?add=<id> можно сразу добавить тайтл в одну из них. */
export function MyCollections() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const add = params.get('add') ?? ''
  const mine = useAsync(() => (user ? loadCollections('new', user.$id).catch(() => []) : Promise.resolve([])), [user?.$id])
  const anime = useAsync(() => (add ? loadAnime(add).then((r) => r.data).catch(() => undefined) : Promise.resolve(undefined)), [add])
  const [done, setDone] = useState<string[]>([])
  usePageMeta('Мои подборки')

  if (!user)
    return (
      <main className="container empty-page">
        <h1>Свои подборки</h1>
        <p className="muted">Войдите, чтобы собирать подборки и делиться ими.</p>
        <Link to="/account" className="btn btn--accent">Войти</Link>
      </main>
    )

  const addTo = async (c: UserCollection) => {
    if (!anime.value) return
    const items = collectionItems(c)
    if (items.some((i) => i.id === anime.value!.id)) return toast('Этот тайтл уже в подборке')
    try {
      await saveCollection({ id: c.$id, title: c.title, about: c.about ?? '', items: [...items, toItem(anime.value)] })
      setDone((d) => [...d, c.$id])
      toast(`Добавлено в «${c.title}»`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    }
  }

  return (
    <main className="container top-page social-page">
      <header className="s-row">
        <h1 className="page-title">{anime.value ? `«${anime.value.title}» в подборку` : 'Мои подборки'}</h1>
        <Link to={`/collections/new${add ? `?add=${add}` : ''}`} className="btn btn--accent">
          Новая подборка
        </Link>
      </header>
      {mine.loading && <p className="muted" aria-busy="true">Загружаем…</p>}
      {!mine.loading && !mine.value?.length && <div className="s-empty">У вас пока нет подборок. Соберите первую: «Аниме на вечер», «Плакал навзрыд» или «С чего начать другу».</div>}
      <div className="s-cards">
        {(mine.value ?? []).map((c) => (
          <div key={c.$id} className="stack" style={{ gap: 8 }}>
            <CollectionCard c={c} />
            {anime.value && (
              <button type="button" className="btn btn--ghost btn--small" disabled={done.includes(c.$id)} onClick={() => addTo(c)}>
                {done.includes(c.$id) ? 'Добавлено' : 'Добавить сюда'}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

/** /collections/new и /c/:id/edit — редактор подборки: поиск тайтлов, «из моего списка», заметки к тайтлам. */
export function CollectionEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const list = useMyList()
  const [title, setTitle] = useState('')
  const [about, setAbout] = useState('')
  const [items, setItems] = useState<CollectionItem[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Anime[]>([])
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)
  usePageMeta(id ? 'Изменить подборку' : 'Новая подборка')

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (id)
      void loadCollection(id).then((c) => {
        if (!c) return
        setTitle(c.title)
        setAbout(c.about ?? '')
        setItems(collectionItems(c))
      })
    const add = params.get('add')
    if (add) void loadAnime(add).then((r) => r.data && setItems((all) => (all.some((i) => i.id === add) ? all : [...all, toItem(r.data!)])))
  }, [id])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return setFound([])
    const t = setTimeout(() => {
      void loadCatalog({ search: q, limit: 8 }).then((r) => setFound(r.data))
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  const has = useMemo(() => new Set(items.map((i) => i.id)), [items])
  const fromList = list.filter((e) => !has.has(e.anime.id)).slice(0, 18)
  const add = (a: Parameters<typeof toItem>[0]) => !has.has(a.id) && setItems((all) => [...all, toItem(a)])
  const move = (i: number, d: number) =>
    setItems((all) => {
      const j = i + d
      if (j < 0 || j >= all.length) return all
      const next = [...all]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  if (!user)
    return (
      <main className="container empty-page">
        <h1>Новая подборка</h1>
        <p className="muted">Войдите, чтобы собирать подборки.</p>
        <Link to="/account" className="btn btn--accent">Войти</Link>
      </main>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const c = await saveCollection({ id, title, about, items })
      toast('Подборка сохранена')
      navigate(`/c/${c.$id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!id || !confirm('Удалить подборку?')) return
    await deleteCollection(id).catch(() => undefined)
    navigate('/collections/my')
  }

  return (
    <main className="container top-page social-page">
      <h1 className="page-title">{id ? 'Изменить подборку' : 'Новая подборка'}</h1>
      <form className="s-form" onSubmit={submit}>
        <input value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder="Название подборки" maxLength={80} minLength={3} required />
        <textarea value={about} onChange={(e) => setAbout(e.currentTarget.value)} placeholder="Описание: для кого и под какое настроение" maxLength={500} rows={2} />
        <ol className="s-col-items">
          {items.map((it, i) => (
            <li key={it.id}>
              {it.poster ? <img src={it.poster} alt="" /> : <span className="s-col-items__ph" />}
              <span className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                <b>{it.title}</b>
                <input
                  value={it.note ?? ''}
                  maxLength={200}
                  placeholder="Заметка: почему стоит посмотреть"
                  onChange={(e) => {
                    const note = e.currentTarget.value
                    setItems((all) => all.map((x) => (x.id === it.id ? { ...x, note } : x)))
                  }}
                />
              </span>
              <span className="s-col-items__tools">
                <button type="button" onClick={() => move(i, -1)} aria-label="Выше" disabled={i === 0}>↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Ниже" disabled={i === items.length - 1}>↓</button>
                <button type="button" onClick={() => setItems((all) => all.filter((x) => x.id !== it.id))} aria-label="Убрать">✕</button>
              </span>
            </li>
          ))}
        </ol>
        {!items.length && <p className="muted">Добавьте тайтлы: найдите по названию или возьмите из своего списка.</p>}
        <input type="search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Найти аниме по названию" />
        {found.length > 0 && (
          <div className="s-pick">
            {found.map((a) => (
              <button key={a.id} type="button" disabled={has.has(a.id)} onClick={() => add(a)}>
                + {a.title} {a.year ? <span className="muted">{a.year}</span> : null}
              </button>
            ))}
          </div>
        )}
        {fromList.length > 0 && (
          <details>
            <summary className="muted">Из моего списка</summary>
            <div className="s-pick">
              {fromList.map((e) => (
                <button key={e.anime.id} type="button" onClick={() => add(e.anime)}>
                  + {e.anime.title}
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="s-row">
          <button type="submit" className="btn btn--accent" disabled={busy || !items.length || title.trim().length < 3}>
            Сохранить
          </button>
          {id && (
            <button type="button" className="btn btn--ghost" onClick={remove}>
              Удалить подборку
            </button>
          )}
        </div>
      </form>
    </main>
  )
}

import './profile-extras.css'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { ShareIcon } from './Icons'
import { listStore, useMyList, type ListEntry } from '../data/myList'
import { STATUS_ORDER, type ProfileSummary } from '../data/profile'
import { COVERS, FRAMES, profileStyleStore } from '../data/profileStyle'
import { follow, followCounts, isFollowing, unfollow } from '../data/social'
import { SHIKI_CLIENT_ID, disconnectShikimori, pullAll, pushAll, restoreLink, shikiAuthorizeUrl, shikiLinkStore } from '../data/shikiSync'
import { toast } from '../data/toast'
import { unlocked } from '../data/achievements'
import { INVITE_CAP, XP, levelOf, totalXp } from '../data/xp'
import { inviteStore } from '../data/inviteStore'
import PosterCard from './PosterCard'

/** Части профиля, которые появились вместе с сообществом: подписка, совпадение вкусов, оформление, Shikimori. */

export function FollowBlock({ userId }: { userId: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void followCounts(userId).then(setCounts).catch(() => undefined)
    if (user && user.$id !== userId) void isFollowing(user.$id, userId).then(setOn).catch(() => undefined)
  }, [userId, user?.$id])

  const toggle = async () => {
    if (!user) return navigate('/account')
    setBusy(true)
    try {
      const r = on ? await unfollow(userId) : await follow(userId)
      setOn(!on)
      setCounts((c) => c && { ...c, followers: r.followers })
      if (!on) toast('Подписка оформлена: его новости в «Сообществе»')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pf-follow">
      {counts && (
        <span className="muted">
          <b>{counts.followers}</b> подписчиков · <b>{counts.following}</b> подписок
        </span>
      )}
      {user?.$id !== userId && (
        <button type="button" className={`btn btn--small ${on ? 'btn--ghost' : 'btn--accent'}`} disabled={busy} onClick={toggle}>
          {on ? 'Вы подписаны' : 'Подписаться'}
        </button>
      )}
    </div>
  )
}

/** Совпадение вкусов: общие тайтлы и насколько похожи оценки. И что у него высоко, а вы ещё не видели. */
export function Compatibility({ summary, userId }: { summary: ProfileSummary; userId: string }) {
  const { user } = useAuth()
  const mine = useMyList()
  const result = useMemo(() => compare(mine, summary), [mine, summary])
  if (user?.$id === userId || !summary.rates?.length || mine.length < 3 || !result) return null
  const { percent, common, tips } = result
  return (
    <section className="stack pf-compat">
      <h2>Совпадение вкусов</h2>
      <div className="pf-compat__head">
        <span className="pf-compat__ring" style={{ '--p': percent } as React.CSSProperties}>
          <b>{percent}%</b>
        </span>
        <p className="muted">
          {percent >= 75 ? 'Почти один вкус на двоих.' : percent >= 50 ? 'Много общего.' : percent >= 25 ? 'Кое-что общее есть.' : 'Вкусы разные: тем интереснее советы.'} Общих тайтлов:{' '}
          {common.length}.
        </p>
      </div>
      {common.length > 0 && (
        <>
          <h3 className="pf-sub">Оба любите</h3>
          <div className="grid grid--posters">
            {common.slice(0, 6).map((e) => (
              <PosterCard key={e.anime.id} anime={e.anime} />
            ))}
          </div>
        </>
      )}
      {tips.length > 0 && (
        <>
          <h3 className="pf-sub">Он(а) оценил(а) высоко, а у вас ещё нет</h3>
          <div className="grid grid--posters">
            {tips.slice(0, 6).map((a) => (
              <PosterCard key={a.id} anime={a} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function compare(mine: ListEntry[], s: ProfileSummary) {
  if (!s.rates?.length) return null
  const theirs = new Map(s.rates.map(([id, rating, status]) => [id, { rating, status: STATUS_ORDER[status] }]))
  const seen = (status?: string) => status && status !== 'planned'
  const both = mine.filter((e) => seen(e.status) && seen(theirs.get(e.anime.id)?.status))
  const mySeen = mine.filter((e) => seen(e.status)).length
  const theirSeen = [...theirs.values()].filter((x) => seen(x.status)).length
  if (!mySeen || !theirSeen) return null
  // Пересечение списков (как Жаккар) и близость оценок у общих тайтлов.
  const overlap = both.length / Math.min(mySeen, theirSeen)
  const rated = both.filter((e) => e.rating && theirs.get(e.anime.id)!.rating)
  const closeness = rated.length ? 1 - rated.reduce((n, e) => n + Math.abs(e.rating! - theirs.get(e.anime.id)!.rating), 0) / rated.length / 9 : 0.5
  const percent = Math.round(Math.min(1, Math.sqrt(overlap) * 0.6 + closeness * 0.4) * 100)
  const common = both
    .filter((e) => (e.rating ?? 0) >= 7 || e.status === 'completed')
    .sort((a, b) => (b.rating ?? 0) + theirs.get(b.anime.id)!.rating - (a.rating ?? 0) - theirs.get(a.anime.id)!.rating)
  const have = new Set(mine.map((e) => e.anime.id))
  const cards = [...s.favorites, ...s.recent, ...(s.showcase ?? [])]
  const tips = [...new Map(cards.filter((a) => !have.has(a.id) && (theirs.get(a.id)?.rating ?? 0) >= 8).map((a) => [a.id, a])).values()]
  return { percent, common, tips }
}

/** Оформление профиля в аккаунте: обложка, рамка (по уровню) и витрина до 6 тайтлов. */
export function ProfileStyleEditor() {
  const style = profileStyleStore.use()
  const list = useMyList()
  const level = levelOf(totalXp(list, unlocked(list).size)).level
  const showcase = style.showcase ?? []
  const candidates = [...list].filter((e) => e.status !== 'planned').sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 40)
  const set = (patch: Partial<typeof style>) => profileStyleStore.set({ ...profileStyleStore.get(), ...patch })

  return (
    <section className="stack pf-style">
      <h2>Оформление профиля</h2>
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Обложка</span>
        <div className="pf-style__covers">
          {COVERS.map((c) => (
            <button key={c.id} type="button" title={c.title} aria-pressed={style.cover === c.id} style={{ background: c.css }} onClick={() => set({ cover: c.id })}>
              <span className="sr-only">{c.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Рамка аватара (открываются уровнем, у вас {level})</span>
        <div className="pf-style__frames">
          {FRAMES.map((f) => (
            <button key={f.id} type="button" disabled={level < f.level} aria-pressed={(style.frame ?? 'none') === f.id} onClick={() => set({ frame: f.id })}>
              <span className={`s-avatar s-avatar--${f.id}`} style={{ width: 36, height: 36 }} aria-hidden="true">
                A
              </span>
              <span>{f.title}</span>
              {level < f.level && <span className="muted">ур. {f.level}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Витрина: до 6 любимых тайтлов на видном месте ({showcase.length}/6)</span>
        <div className="pf-style__pick">
          {candidates.map((e) => {
            const on = showcase.includes(e.anime.id)
            return (
              <button
                key={e.anime.id}
                type="button"
                aria-pressed={on}
                disabled={!on && showcase.length >= 6}
                onClick={() => set({ showcase: on ? showcase.filter((x) => x !== e.anime.id) : [...showcase, e.anime.id] })}
              >
                {on ? '✓ ' : '+ '}
                {e.anime.title}
              </button>
            )
          })}
          {!candidates.length && <span className="muted">Добавьте тайтлы в список, и их можно будет выставить на витрину.</span>}
        </div>
      </div>
      <p className="muted pf-note">Изменения появятся в открытом профиле в течение минуты.</p>
    </section>
  )
}

/** Связь списка с Shikimori: вход через OAuth, автоотправка изменений и «Отправить весь список». */
export function ShikimoriSync() {
  const link = shikiLinkStore.use()
  const { user } = useAuth()
  const [busy, setBusy] = useState('')
  useEffect(() => {
    if (user && !link) restoreLink().catch(() => undefined)
  }, [user, link])
  if (!SHIKI_CLIENT_ID && !link) return null

  const takeAll = async () => {
    setBusy('Забираем…')
    try {
      const r = await pullAll()
      toast(`С Shikimori пришло ${r.total}: новых ${r.added}, у остальных обновлён прогресс`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy('')
    }
  }

  const sendAll = async () => {
    setBusy('Отправляем…')
    try {
      const n = await pushAll((done, total) => setBusy(`Отправлено ${done} из ${total}`))
      toast(`На Shikimori отправлено тайтлов: ${n}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="stack pf-shiki">
      <h2>Синхронизация с Shikimori</h2>
      {link ? (
        <>
          <p className="muted">
            Список связан с аккаунтом <b>{link.nickname}</b>: статусы, серии и оценки уходят на Shikimori сами. Список с Shikimori можно забрать сюда одной кнопкой.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--accent btn--small" disabled={!!busy || !listStore.get().length} onClick={sendAll}>
              {busy || 'Отправить весь список'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={!!busy} onClick={takeAll}>
              Забрать с Shikimori
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={!!busy}
              onClick={() => void disconnectShikimori().then(() => toast('Shikimori отключён')).catch(() => shikiLinkStore.set(null))}
            >
              Отключить
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Отмечайте серии здесь, а список на Shikimori обновится сам.</p>
          <a className="btn btn--accent btn--small" href={shikiAuthorizeUrl()}>
            Подключить Shikimori
          </a>
        </>
      )}
    </section>
  )
}

export function LevelCard() {
  const list = useMyList()
  useSyncExternalStore(inviteStore.subscribe, inviteStore.get)
  const xp = totalXp(list, unlocked(list).size)
  const l = levelOf(xp)
  return (
    <section className="pf-level">
      <div className="pf-level__badge">{l.level}</div>
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        <b>
          Уровень {l.level} · {l.rank}
        </b>
        <span className="pf-level__bar">
          <i style={{ width: `${Math.round(l.progress * 100)}%` }} />
        </span>
        <span className="muted pf-note">
          {xp} опыта, до следующего уровня {l.next}. <Link to="/community?tab=top" className="link-accent">Топ зрителей</Link> ·{' '}
          <Link to="/recap" className="link-accent">Мои итоги года</Link>
        </span>
      </div>
    </section>
  )
}

/** «Позови друга»: своя ссылка, счётчик пришедших и опыт за них (functions/community/src/invites.js). */
export function InviteCard() {
  const { user } = useAuth()
  const stats = useSyncExternalStore(inviteStore.subscribe, inviteStore.get)
  const [link, setLink] = useState('')
  useEffect(() => {
    if (!user) return
    void import('../data/invites').then((m) => {
      setLink(m.inviteLink(user.$id))
      m.loadInviteStats().catch(() => undefined)
    })
  }, [user])
  if (!user) return null
  const share = async () => {
    if (!link) return
    if (navigator.share) {
      await navigator.share({ title: 'Смотрим аниме вместе на Anime Life', url: link }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      toast('Ссылка скопирована')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }
  return (
    <section className="stack pf-invite" id="invite">
      <h2>Позови друга</h2>
      <p className="muted pf-note">
        Друг заходит по вашей ссылке и заводит аккаунт: вам +{XP.invite} опыта и достижение «Душа компании», ему +{XP.invited} на старт.
        Засчитываются новые аккаунты, опыт идёт за первых {INVITE_CAP} друзей.
      </p>
      <div className="pf-invite__row">
        <input className="pf-invite__link" readOnly value={link} aria-label="Ваша ссылка-приглашение" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--accent btn--small" onClick={share} disabled={!link}>
          <ShareIcon size={16} />
          Поделиться
        </button>
      </div>
      <p className="pf-note">
        {stats.invited > 0 ? (
          <>
            По вашей ссылке пришли: <b>{stats.invited}</b> · +{Math.min(stats.invited, INVITE_CAP) * XP.invite} опыта
          </>
        ) : (
          <span className="muted">По вашей ссылке пока никто не пришёл.</span>
        )}
      </p>
    </section>
  )
}

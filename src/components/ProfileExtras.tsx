import './profile-extras.css'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { ShareIcon } from './Icons'
import { listStore, useMyList, type ListEntry } from '../data/myList'
import { STATUS_ORDER, type ProfileSummary } from '../data/profile'
import { COVERS, FRAMES, NAME_COLORS, profileStyleStore } from '../data/profileStyle'
import { Avatar } from './socialUi'
import { follow, followCounts, isFollowing, unfollow } from '../data/social'
import {
  SHIKI_CLIENT_ID,
  disconnectShikimori,
  pullAll,
  pushAll,
  restoreLink,
  shikiAuthorizeUrl,
  shikiLinkStore,
  shikiServerSyncEnabled,
} from '../data/shikiSync'
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

/** Оформление профиля в аккаунте: обложка (включая GIF), аватар, цвет ника, рамка (по уровню) и витрина до 6 тайтлов. */
export function ProfileStyleEditor() {
  const { user } = useAuth()
  const style = profileStyleStore.use()
  const list = useMyList()
  const level = levelOf(totalXp(list, unlocked(list).size)).level
  const showcase = style.showcase ?? []
  const candidates = [...list].filter((e) => e.status !== 'planned').sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 40)
  const set = (patch: Partial<typeof style>) => profileStyleStore.set({ ...profileStyleStore.get(), ...patch })
  const [saving, setSaving] = useState(false)

  const displayName = user?.name || user?.email?.split('@')[0] || 'Ваш никнейм'
  const frameName = FRAMES.find((f) => f.id === (style.frame ?? 'none'))?.title || 'Без рамки'
  const coverBg = style.coverUrl
    ? { backgroundImage: `url("${style.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : style.cover
      ? { background: COVERS.find((c) => c.id === style.cover)?.css }
      : { background: 'linear-gradient(135deg, #181926 0%, #24273a 50%, #11111b 100%)' }

  const saveNow = async () => {
    setSaving(true)
    try {
      const { publishProfile } = await import('../data/profile')
      await publishProfile()
      toast('Оформление сохранено и опубликовано!')
    } catch {
      toast('Оформление сохранено локально')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="stack pf-style">
      <h2>Оформление профиля</h2>

      {/* Живой предпросмотр профиля Senku */}
      <div className="stack" style={{ gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontWeight: 600 }}>Живой предпросмотр Senku</span>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Live Preview</span>
        </div>
        <div className="pf-hero-wrap" style={{ borderRadius: 14 }}>
          <div
            className="pf-hero-banner"
            style={{ ...coverBg, height: 140 }}
            aria-hidden="true"
          />
          <div className="pf-hero-body" style={{ marginTop: -46, padding: '0 16px 20px', gap: 10 }}>
            <div className="pf-hero-avatar-box">
              <Avatar
                name={displayName}
                avatarUrl={style.avatarUrl}
                frame={style.frame}
                size={92}
                online={true}
              />
            </div>
            <h3
              className={`pf-hero-name ${style.nameColor ? `pf-name--${style.nameColor}` : ''}`}
              style={{ fontSize: 24, margin: 0 }}
            >
              {displayName}
            </h3>
            <div className="pf-hero-meta" style={{ gap: 12, fontSize: 13 }}>
              <span>Уровень {level}</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>• В сети</span>
              <span className="pf-streak">✨ {frameName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Кастомная обложка (GIF / Картинка) */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Кастомная обложка профиля (GIF, WebP, PNG, JPG)</span>
        <div className="pf-style__input-box">
          <input
            type="url"
            className="pf-style__input"
            placeholder="Вставьте ссылку на GIF или картинку (например: https://...)"
            value={style.coverUrl ?? ''}
            onChange={(e) => set({ coverUrl: e.target.value.trim() || undefined })}
          />
          {style.coverUrl && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => set({ coverUrl: undefined })}>
              Сбросить
            </button>
          )}
        </div>
        {style.coverUrl && (
          <div
            className="pf-cover"
            style={{ backgroundImage: `url(${style.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', height: 100, borderRadius: 10, marginBottom: 0 }}
          />
        )}
      </div>

      {/* Стандартные градиенты обложки */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Или выберите стандартную тему обложки</span>
        <div className="pf-style__covers">
          {COVERS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.title}
              aria-pressed={style.cover === c.id && !style.coverUrl}
              style={{ background: c.css }}
              onClick={() => set({ cover: c.id, coverUrl: undefined })}
            >
              <span className="sr-only">{c.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Кастомный аватар (GIF / Картинка) */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Кастомный аватар (GIF, WebP, PNG, JPG)</span>
        <div className="pf-style__input-box">
          <input
            type="url"
            className="pf-style__input"
            placeholder="Вставьте ссылку на аватарку или анимированную GIF..."
            value={style.avatarUrl ?? ''}
            onChange={(e) => set({ avatarUrl: e.target.value.trim() || undefined })}
          />
          {style.avatarUrl && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => set({ avatarUrl: undefined })}>
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Цвет и свечение ника */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Цвет и неоновое свечение никнейма</span>
        <div className="pf-style__colors">
          {NAME_COLORS.map((nc) => (
            <button
              key={nc.id}
              type="button"
              className="pf-style__color-btn"
              aria-pressed={(style.nameColor ?? 'default') === nc.id}
              onClick={() => set({ nameColor: nc.id === 'default' ? undefined : nc.id })}
            >
              <span className="pf-style__color-dot" style={{ background: nc.color, boxShadow: `0 0 8px ${nc.color}aa` }} />
              <span>{nc.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Рамка аватара */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="muted">Рамка аватара (открываются уровнем, у вас {level})</span>
        <div className="pf-style__frames">
          {FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={level < f.level}
              aria-pressed={(style.frame ?? 'none') === f.id}
              onClick={() => set({ frame: f.id })}
              title={f.desc}
            >
              <Avatar name="A" avatarUrl={style.avatarUrl} frame={f.id} size={38} />
              <span>{f.title}</span>
              {level < f.level && <span className="muted">ур. {f.level}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Витрина тайтлов */}
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

      <div className="actions" style={{ marginTop: 6 }}>
        <button type="button" className="btn btn--accent btn--small" disabled={saving} onClick={saveNow}>
          {saving ? 'Сохраняем…' : 'Применить и сохранить сейчас'}
        </button>
      </div>
      <p className="muted pf-note">Изменения также автоматически отправляются в профиль в течение минуты.</p>
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
  const serverOk = shikiServerSyncEnabled()

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
      {!serverOk && (
        <p className="muted notice">Чтобы синхронизировать список с Shikimori, задайте VITE_SHIKIMORI_CLIENT_ID и секреты SHIKIMORI_* на воркере.</p>
      )}
      {link ? (
        <>
          <p className="muted">
            Список связан с аккаунтом <b>{link.nickname}</b>: статусы, серии и оценки уходят на Shikimori сами. Список с Shikimori можно забрать сюда одной кнопкой.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--accent btn--small" disabled={!!busy || !listStore.get().length || !serverOk} onClick={sendAll}>
              {busy || 'Отправить весь список'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" disabled={!!busy || !serverOk} onClick={takeAll}>
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
          {serverOk ? (
            <a className="btn btn--accent btn--small" href={shikiAuthorizeUrl()}>
              Подключить Shikimori
            </a>
          ) : (
            <p className="muted">Настройте OAuth Shikimori (клиентский ID и секреты на воркере), чтобы подключить аккаунт.</p>
          )}
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

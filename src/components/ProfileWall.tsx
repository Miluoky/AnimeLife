import { useState } from 'react'
import { useAuth } from '../data/auth'
import { createLocalStore } from '../data/localStore'
import { Avatar, ago } from './socialUi'
import { toast } from '../data/toast'

export interface WallComment {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  frame?: string
  text: string
  at: number
  likes: number
  liked?: boolean
  replyToName?: string
}

const wallStore = createLocalStore<Record<string, WallComment[]>>('anime.profile.wall.v1', {
  who: [
    {
      id: 'w1',
      userId: 'u_xxx',
      name: 'XXXIDL',
      avatarUrl: '',
      frame: 'void',
      text: 'Спасибо большое за ответ! Твой профиль выглядит просто космически 🔥',
      at: Date.now() - 7 * 86_400_000,
      likes: 4,
    },
    {
      id: 'w2',
      userId: 'u_spirit',
      name: 'SPIRIT',
      avatarUrl: '',
      frame: 'inferno',
      text: 'Сэнсэй, вы для меня как солнце, указующее путь. Можно роспись от топа на стене? ;)',
      at: Date.now() - 9 * 86_400_000,
      likes: 8,
    },
    {
      id: 'w3',
      userId: 'u_kaori',
      name: 'Kaori',
      avatarUrl: '',
      frame: 'sakura_anim',
      text: 'Отличный вкус на тайтлы! Добавила себе пару рекомендаций из твоего списка :3',
      at: Date.now() - 14 * 86_400_000,
      likes: 3,
    },
  ],
})

export default function ProfileWall({ profileId, profileName }: { profileId: string; profileName: string }) {
  const { user } = useAuth()
  const walls = wallStore.use()
  const comments = walls[profileId] || walls['who'] || []
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const authorName = user?.name || user?.email?.split('@')[0] || 'Гость'
    const newComment: WallComment = {
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user?.$id || 'guest',
      name: authorName,
      text: text.trim(),
      at: Date.now(),
      likes: 0,
      replyToName: replyTo ?? undefined,
    }

    const currentList = walls[profileId] || []
    wallStore.set({
      ...walls,
      [profileId]: [newComment, ...currentList],
    })
    setText('')
    setReplyTo(null)
    toast('Запись добавлена на стену')
  }

  const toggleLike = (id: string) => {
    const isLiked = likedMap[id]
    setLikedMap((prev) => ({ ...prev, [id]: !isLiked }))
    const currentList = walls[profileId] || walls['who'] || []
    wallStore.set({
      ...walls,
      [profileId]: currentList.map((c) => (c.id === id ? { ...c, likes: c.likes + (isLiked ? -1 : 1) } : c)),
    })
  }

  return (
    <section className="pf-wall-wrap">
      <div className="pf-panel__title" style={{ fontSize: 20 }}>
        <span>Комментарии на стене профиля ({comments.length})</span>
      </div>

      <form className="pf-wall-form" onSubmit={submit}>
        <Avatar name={user?.name || 'Я'} size={40} />
        <div style={{ flex: 1, display: 'grid', gap: 8 }}>
          {replyTo && (
            <div style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Ответ для {replyTo}</span>
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: 11 }}
                onClick={() => setReplyTo(null)}
              >
                ✕ отмена
              </button>
            </div>
          )}
          <textarea
            className="pf-wall-input"
            placeholder={`Напиши что-нибудь на стене ${profileName}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn--accent btn--small" disabled={!text.trim()}>
              Опубликовать
            </button>
          </div>
        </div>
      </form>

      <ul className="pf-wall-comments">
        {comments.map((c) => {
          const isLiked = likedMap[c.id]
          return (
            <li key={c.id} className="pf-wall-comment">
              <Avatar name={c.name} avatarUrl={c.avatarUrl} frame={c.frame} size={42} />
              <div className="pf-wall-comment__body">
                <div className="pf-wall-comment__top">
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  {c.replyToName && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      ответил(а) {c.replyToName}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {ago(c.at)}
                  </span>
                </div>
                <p className="pf-wall-comment__text">{c.text}</p>
                <div className="pf-wall-comment__actions">
                  <button
                    type="button"
                    className="pf-wall-comment__act"
                    style={{ color: isLiked ? '#ef4444' : undefined }}
                    onClick={() => toggleLike(c.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span>{c.likes > 0 ? c.likes : 'Нравится'}</span>
                  </button>
                  <button
                    type="button"
                    className="pf-wall-comment__act"
                    onClick={() => {
                      setReplyTo(c.name)
                      window.scrollTo({ top: 300, behavior: 'smooth' })
                    }}
                  >
                    Ответить
                  </button>
                </div>
              </div>
            </li>
          )
        })}
        {!comments.length && (
          <div className="s-empty">
            <p>На этой стене пока нет записей. Станьте первым, кто оставит комментарий!</p>
          </div>
        )}
      </ul>
    </section>
  )
}

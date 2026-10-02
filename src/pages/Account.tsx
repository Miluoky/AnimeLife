import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authErrorMessage, signIn, signOut, signUp, useAuth } from '../data/auth'
import { useMyList } from '../data/myList'
import { SOCIAL_LOGIN } from '../api/appwrite'
import { signInWithOAuth, signInWithTelegram, signInWithVk } from '../data/socialAuth'

const providers = [
  { id: 'vk', title: 'VK ID', mark: 'VK', on: !!SOCIAL_LOGIN.vkAppId },
  { id: 'yandex', title: 'Яндекс', mark: 'Я', on: SOCIAL_LOGIN.yandex },
  { id: 'google', title: 'Google', mark: 'G', on: SOCIAL_LOGIN.google },
  { id: 'telegram', title: 'Telegram', mark: 'TG', on: !!SOCIAL_LOGIN.telegramBotId },
] as const

/** Кнопки входа через другие сервисы. Показываем только те, что уже настроены. */
function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState('')
  const enabled = providers.filter((p) => p.on)
  if (!enabled.length) return null

  async function start(id: (typeof providers)[number]['id']) {
    setBusy(id)
    onError('')
    try {
      if (id === 'vk') await signInWithVk()
      else if (id === 'telegram') await signInWithTelegram()
      else signInWithOAuth(id)
      // VK, Google и Яндекс уводят на свою страницу, Telegram входит прямо здесь.
      if (id === 'telegram') setBusy('')
    } catch (err) {
      onError(authErrorMessage(err))
      setBusy('')
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="social-buttons">
        {enabled.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn social-btn social-btn--${p.id}`}
            disabled={!!busy}
            onClick={() => start(p.id)}
          >
            <span className="social-btn__mark" aria-hidden="true">
              {p.mark}
            </span>
            {busy === p.id ? 'Секунду…' : p.title}
          </button>
        ))}
      </div>
      <div className="divider">
        <span>или по почте</span>
      </div>
    </div>
  )
}

function titles(n: number) {
  const word = new Intl.PluralRules('ru').select(n)
  return `${n} ${word === 'one' ? 'тайтл' : word === 'few' ? 'тайтла' : 'тайтлов'}`
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') await signIn(email.trim(), password)
      else await signUp(name.trim(), email.trim(), password)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-card stack" onSubmit={onSubmit}>
      <div className="chips" role="tablist" aria-label="Вход или регистрация">
        {(
          [
            ['in', 'Вход'],
            ['up', 'Регистрация'],
          ] as const
        ).map(([id, title]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`pill${mode === id ? ' active' : ''}`}
            onClick={() => {
              setMode(id)
              setError('')
            }}
          >
            {title}
          </button>
        ))}
      </div>

      <SocialButtons onError={setError} />

      {mode === 'up' && (
        <label className="field">
          <span>Имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={128} />
        </label>
      )}
      <label className="field">
        <span>Почта</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span>Пароль</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        />
        {mode === 'up' && <small className="muted">Не короче 8 символов.</small>}
      </label>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--accent" disabled={busy}>
        {busy ? 'Секунду…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        После входа «Мой список» и история просмотра сохраняются в аккаунте. То, что уже отмечено в этом браузере,
        перенесётся автоматически.
      </p>
    </form>
  )
}

export default function Account() {
  const { checking, user, syncError } = useAuth()
  const list = useMyList()
  const [busy, setBusy] = useState(false)

  if (checking) return <main className="container empty-page" aria-busy="true" />

  return (
    <main className="container home">
      <section className="stack auth-page">
        <h1 className="page-title">{user ? 'Аккаунт' : 'Вход'}</h1>
        {user ? (
          <div className="auth-card stack">
            <div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{user.name || user.email || 'Без имени'}</div>
              {user.name && user.email && <div className="muted">{user.email}</div>}
            </div>
            <p className={syncError ? 'notice notice--error' : 'notice'} role="status">
              {syncError
                ? `Не получилось сохранить изменения в аккаунте: ${syncError}`
                : `Синхронизация включена. В списке ${titles(list.length)}, он одинаков на всех устройствах, где вы вошли.`}
            </p>
            <div className="actions">
              <Link to="/my-list" className="btn btn--accent">
                Мой список
              </Link>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await signOut().catch(() => undefined)
                  setBusy(false)
                }}
              >
                Выйти
              </button>
            </div>
          </div>
        ) : (
          <AuthForm />
        )}
      </section>
    </main>
  )
}

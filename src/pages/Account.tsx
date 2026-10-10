import './account.css'
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authErrorMessage, requestRecovery, signIn, signOut, signUp, useAuth } from '../data/auth'
import { useMyList } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import ProfileStats from '../components/ProfileStats'
import PushSettings from '../components/PushSettings'
import TelegramNotifySettings from '../components/TelegramNotifySettings'
import ProfileSettings from '../components/ProfileSettings'
import AppearanceSettings from '../components/AppearanceSettings'
import { SOCIAL_LOGIN } from '../api/appwrite'
import {
  signInWithOAuth,
  signInWithVk,
  startTelegram,
  waitForTelegram,
  type TelegramLogin,
} from '../data/socialAuth'

// Сводка посещений нужна только администратору: отдельная часть, обычные пользователи её не скачивают.
const AdminStatsCard = lazy(() => import('../components/AdminStatsCard'))

const providers = [
  { id: 'vk', title: 'VK ID', mark: 'VK', on: !!SOCIAL_LOGIN.vkAppId },
  { id: 'yandex', title: 'Яндекс', mark: 'Я', on: SOCIAL_LOGIN.yandex },
  { id: 'google', title: 'Google', mark: 'G', on: SOCIAL_LOGIN.google },
] as const

/**
 * Вход через бота: ссылка заранее готова, поэтому одно нажатие открывает Telegram,
 * а сайт ждёт, пока в боте нажмут «Подтвердить».
 */
function TelegramButton({ disabled, onError }: { disabled: boolean; onError: (message: string) => void }) {
  const [login, setLogin] = useState<TelegramLogin>()
  const [waiting, setWaiting] = useState(false)
  const wait = useRef<AbortController>()

  // Готовим код заранее и обновляем, когда он устаревает.
  useEffect(() => {
    if (waiting) return
    if (login && login.expiresAt > Date.now()) {
      const timer = setTimeout(() => setLogin(undefined), login.expiresAt - Date.now())
      return () => clearTimeout(timer)
    }
    let cancelled = false
    startTelegram()
      .then((next) => !cancelled && setLogin(next))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [login, waiting])

  useEffect(() => () => wait.current?.abort(), [])

  function begin() {
    if (!login) return
    onError('')
    setWaiting(true)
    const controller = new AbortController()
    wait.current = controller
    waitForTelegram(login, controller.signal)
      .catch((err) => !controller.signal.aborted && onError(authErrorMessage(err)))
      .finally(() => {
        if (controller.signal.aborted) return
        setWaiting(false)
        setLogin(undefined)
      })
  }

  function cancel() {
    wait.current?.abort()
    setWaiting(false)
    setLogin(undefined)
  }

  if (waiting && login) {
    return (
      <div className="notice telegram-wait" role="status">
        <span>
          Откройте бота в Telegram и нажмите «Подтвердить». Если Telegram не открылся,{' '}
          <a href={login.link} target="_blank" rel="noopener noreferrer">
            откройте его по ссылке
          </a>
          .
        </span>
        <button type="button" className="pill" onClick={cancel}>
          Отмена
        </button>
      </div>
    )
  }

  return login ? (
    <a
      className={`btn social-btn social-btn--telegram${disabled ? ' social-btn--off' : ''}`}
      href={login.link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => (disabled ? e.preventDefault() : begin())}
    >
      <span className="social-btn__mark" aria-hidden="true">
        TG
      </span>
      Telegram
    </a>
  ) : (
    <button type="button" className="btn social-btn social-btn--telegram" disabled>
      <span className="social-btn__mark" aria-hidden="true">
        TG
      </span>
      Telegram
    </button>
  )
}

/** Кнопки входа через другие сервисы. Показываем только те, что уже настроены. */
function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const [busy, setBusy] = useState('')
  const enabled = providers.filter((p) => p.on)
  if (!enabled.length && !SOCIAL_LOGIN.telegram) return null

  async function start(id: (typeof providers)[number]['id']) {
    setBusy(id)
    onError('')
    try {
      // VK, Google и Яндекс уводят на свою страницу и возвращают на сайт.
      if (id === 'vk') await signInWithVk()
      else signInWithOAuth(id)
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
        {SOCIAL_LOGIN.telegram && <TelegramButton disabled={!!busy} onError={onError} />}
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

/** Что даёт аккаунт: экран видоискателя рядом с формой входа (на телефоне скрыт, чтобы форма была сразу под рукой). */
function AccountPerks() {
  const perks = [
    ['Мой список', 'одинаковый на телефоне и компьютере'],
    ['Смотрю', 'серия и минута, где вы остановились'],
    ['Новые серии', 'уведомления о том, что вы смотрите'],
    ['Профиль', 'достижения, оценки и статистика'],
  ]
  return (
    <aside className="acc__screen frame-corners" aria-label="Что даёт аккаунт">
      <span className="acc__hud acc__hud--tl" aria-hidden="true">
        <i /> REC
      </span>
      <span className="acc__hud acc__hud--tr" aria-hidden="true">
        SYNC
      </span>
      <p className="acc__screen-title">Ваше аниме — на всех экранах</p>
      <ol className="acc__perks">
        {perks.map(([title, text], i) => (
          <li key={title}>
            <span className="acc__tc" aria-hidden="true">
              {`0${i + 1}`}
            </span>
            <span>
              <b>{title}</b> {text}
            </span>
          </li>
        ))}
      </ol>
      <span className="acc__hud acc__hud--bl" aria-hidden="true">
        00:24:00
      </span>
      <span className="acc__hud acc__hud--br" aria-hidden="true">
        ★ 10.0
      </span>
    </aside>
  )
}

function AuthForm() {
  // reset — «Забыли пароль?»: письмо со ссылкой на /account/recovery
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  function switchMode(next: typeof mode) {
    setMode(next)
    setError('')
    setSent(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'reset') {
        await requestRecovery(email.trim())
        setSent(true)
      } else if (mode === 'in') await signIn(email.trim(), password)
      else await signUp(name.trim(), email.trim(), password)
    } catch (err) {
      // У формы сброса нет пароля: «неверный аргумент» здесь — почта или адрес сайта для ссылки.
      const badArgument = err instanceof Error && 'type' in err && err.type === 'general_argument_invalid'
      setError(
        mode === 'reset' && badArgument
          ? 'Не получилось отправить письмо: проверьте почту. Если она верная, восстановление пароля на этом сайте пока не настроено.'
          : authErrorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth-card stack" onSubmit={onSubmit}>
      {/* Подложка выбранной вкладки скользит между «Входом» и «Регистрацией» */}
      <div className="seg seg--wide" role="tablist" aria-label="Вход или регистрация" style={{ '--i': mode === 'up' ? 1 : 0, '--n': 2 } as CSSProperties}>
        {(
          [
            ['in', 'Вход'],
            ['up', 'Регистрация'],
          ] as const
        ).map(([id, title]) => {
          // Сброс пароля — часть входа: вкладка «Вход» остаётся выбранной.
          const selected = mode === id || (mode === 'reset' && id === 'in')
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`seg__item${selected ? ' seg__item--on' : ''}`}
              onClick={() => switchMode(id)}
            >
              {title}
            </button>
          )
        })}
      </div>

      {mode === 'reset' ? (
        <p className="muted" style={{ margin: 0 }}>
          Укажите почту аккаунта: пришлём письмо со ссылкой, по которой можно задать новый пароль.
        </p>
      ) : (
        <SocialButtons onError={setError} />
      )}

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
      {mode !== 'reset' && (
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
      )}
      {mode === 'in' && (
        <button type="button" className="link-btn" onClick={() => switchMode('reset')}>
          Забыли пароль?
        </button>
      )}

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {sent && (
        <p className="notice" role="status">
          Письмо отправлено на {email.trim()}. Откройте ссылку из него в течение часа. Если письма нет, проверьте папку
          «Спам».
        </p>
      )}

      <button type="submit" className="btn btn--accent" disabled={busy}>
        {busy
          ? 'Секунду…'
          : { in: 'Войти', up: 'Создать аккаунт', reset: sent ? 'Отправить ещё раз' : 'Отправить ссылку' }[mode]}
      </button>
      {mode === 'reset' && (
        <button type="button" className="link-btn" onClick={() => switchMode('in')}>
          Назад ко входу
        </button>
      )}
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
  usePageMeta(checking ? undefined : user ? 'Профиль' : 'Вход и регистрация')

  if (checking) return <main className="container empty-page" aria-busy="true" />

  return (
    <main className="container home">
      <section className={`stack auth-page acc${user ? '' : ' acc--guest'}`}>
        <p className="acc__rec" aria-hidden="true">
          <i />
          <b>REC</b>
          <span>{user ? 'Профиль' : 'Вход'}</span>
          <span>{user ? 'Синхронизация' : 'CAM 01'}</span>
        </p>
        <h1 className="page-title">{user ? 'Профиль' : 'Вход'}</h1>
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
              {user.labels?.includes('admin') && (
                <>
                  <Link to="/moderation" className="btn btn--ghost">
                    Модерация
                  </Link>
                  <Link to="/admin/analytics" className="btn btn--ghost">
                    Статистика
                  </Link>
                </>
              )}
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
          <div className="acc__grid">
            <AuthForm />
            <AccountPerks />
          </div>
        )}
      </section>
      {user?.labels?.includes('admin') && (
        <Suspense fallback={null}>
          <AdminStatsCard />
        </Suspense>
      )}
      <AppearanceSettings />
      <PushSettings />
      <TelegramNotifySettings />
      {(user || list.length > 0) && <ProfileStats />}
      <ProfileSettings />
    </main>
  )
}

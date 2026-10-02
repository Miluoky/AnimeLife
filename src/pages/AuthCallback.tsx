import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authErrorMessage, finishSession } from '../data/auth'
import { SocialLoginError, VK_CALLBACK_PATH, finishVk } from '../data/socialAuth'

const failed: Record<string, string> = {
  google: 'Вход через Google не удался или был отменён.',
  yandex: 'Вход через Яндекс не удался или был отменён.',
}

/** Сюда сервисы возвращают пользователя после входа. Токен одноразовый, поэтому обрабатываем его ровно один раз. */
export default function AuthCallback() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(search)
    async function run() {
      if (pathname.endsWith(VK_CALLBACK_PATH)) return finishVk(params)
      const userId = params.get('userId')
      const secret = params.get('secret')
      if (!userId || !secret) throw new SocialLoginError(failed[params.get('failed') ?? ''] ?? 'Вход не удался.')
      return finishSession(userId, secret)
    }
    run()
      .then(() => navigate('/account', { replace: true }))
      .catch((e: unknown) => {
        setError(authErrorMessage(e))
        // Убираем одноразовые параметры из адреса.
        window.history.replaceState(null, '', window.location.pathname)
      })
  }, [pathname, search, navigate])

  return (
    <main className="container home">
      <section className="stack auth-page">
        <h1 className="page-title">Вход</h1>
        {error ? (
          <div className="auth-card stack">
            <p className="notice notice--error" role="alert">
              {error}
            </p>
            <Link to="/account" className="btn btn--accent">
              Попробовать ещё раз
            </Link>
          </div>
        ) : (
          <p className="muted" aria-busy="true">
            Входим в аккаунт…
          </p>
        )}
      </section>
    </main>
  )
}

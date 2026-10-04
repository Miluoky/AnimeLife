import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authErrorMessage, finishRecovery } from '../data/auth'
import { usePageMeta } from '../data/pageMeta'

/** Сюда ведёт ссылка из письма «Забыли пароль?»: userId и secret в адресе, здесь задают новый пароль. */
export default function PasswordRecovery() {
  const params = new URLSearchParams(useLocation().search)
  const userId = params.get('userId')
  const secret = params.get('secret')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  usePageMeta('Новый пароль')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId || !secret) return
    if (password !== repeat) return setError('Пароли не совпадают.')
    setBusy(true)
    setError('')
    try {
      await finishRecovery(userId, secret, password)
      setDone(true)
      // Одноразовый ключ больше не нужен: убираем его из адреса.
      window.history.replaceState(null, '', window.location.pathname)
    } catch (err) {
      const type = err instanceof Error && 'type' in err ? err.type : ''
      setError(
        type === 'user_invalid_token'
          ? 'Ссылка для смены пароля устарела или уже использована. Запросите новую на странице входа.'
          : authErrorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="container home">
      <section className="stack auth-page">
        <h1 className="page-title">Новый пароль</h1>
        {done ? (
          <div className="auth-card stack">
            <p className="notice" role="status">
              Пароль изменён. Теперь войдите с новым паролем.
            </p>
            <Link to="/account" className="btn btn--accent">
              Войти
            </Link>
          </div>
        ) : !userId || !secret ? (
          <div className="auth-card stack">
            <p className="notice notice--error" role="alert">
              В ссылке не хватает данных. Откройте ссылку из письма целиком или запросите новую.
            </p>
            <Link to="/account" className="btn btn--accent">
              На страницу входа
            </Link>
          </div>
        ) : (
          <form className="auth-card stack" onSubmit={onSubmit}>
            <label className="field">
              <span>Новый пароль</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <small className="muted">Не короче 8 символов.</small>
            </label>
            <label className="field">
              <span>Ещё раз</span>
              <input
                type="password"
                required
                minLength={8}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn--accent" disabled={busy}>
              {busy ? 'Секунду…' : 'Сохранить пароль'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

import './reviews.css'
import { useState } from 'react'
import { banUser, lookupBanUser, unbanUser, type BanUserInfo } from '../data/moderation'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ModerationBans() {
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [info, setInfo] = useState<BanUserInfo | null>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const payload = () => {
    const raw = query.trim()
    if (!raw) return null
    if (raw.includes('@')) return { email: raw }
    return { userId: raw }
  }

  async function lookup() {
    const p = payload()
    if (!p) return
    setBusy(true)
    setError('')
    try {
      setInfo(await lookupBanUser(p))
    } catch (e) {
      setInfo(null)
      setError(e instanceof Error ? e.message : 'Не получилось найти пользователя.')
    } finally {
      setBusy(false)
    }
  }

  async function ban() {
    const p = payload()
    if (!p) return
    setBusy(true)
    setError('')
    try {
      setInfo(await banUser({ ...p, reason: reason.trim() || undefined }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось заблокировать.')
    } finally {
      setBusy(false)
    }
  }

  async function unban() {
    const p = payload()
    if (!p) return
    setBusy(true)
    setError('')
    try {
      setInfo(await unbanUser(p))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось разблокировать.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="muted">
        Укажите id пользователя или email. Блокировка сразу завершает все сессии; в журнале остаются кто и когда принял решение.
      </p>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      <div className="stack review-form">
        <label className="field">
          <span>Id или email</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="user id или name@example.com"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Причина (необязательно)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        <div className="actions">
          <button type="button" className="btn btn--ghost btn--small" disabled={busy || !query.trim()} onClick={() => void lookup()}>
            Проверить
          </button>
          <button type="button" className="btn btn--accent btn--small" disabled={busy || !query.trim()} onClick={() => void ban()}>
            Заблокировать
          </button>
          <button type="button" className="btn btn--ghost btn--small" disabled={busy || !query.trim()} onClick={() => void unban()}>
            Разблокировать
          </button>
        </div>
      </div>
      {info && (
        <article className="review">
          <p>
            <strong>{info.name || 'Пользователь'}</strong>
            <span className="muted"> · {info.email}</span>
          </p>
          <p className="muted">Id: {info.userId}</p>
          <p>{info.active ? 'Аккаунт активен' : 'Аккаунт заблокирован'}</p>
          {!info.active && (
            <p className="muted">
              {info.moderatedAt ? `Заблокирован: ${dateFormat.format(new Date(info.moderatedAt))}` : ''}
              {info.moderatorName ? ` · модератор: ${info.moderatorName}` : info.moderatedBy ? ` · модератор id: ${info.moderatedBy}` : ''}
              {info.banReason ? ` · причина: ${info.banReason}` : ''}
            </p>
          )}
        </article>
      )}
    </>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { callCommunity, CommunityError } from '../data/community'
import { forgetDeletedAccount } from '../data/auth'
import { toast } from '../data/toast'
import { loadSessions, revokeSession, type UserSessionRow } from '../data/sessions'

/** Всё, что сайт хранит в этом браузере: список, история, настройки (ключи anime.*). */
function localData() {
  const out: Record<string, unknown> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('anime.')) continue
      const raw = localStorage.getItem(key) ?? ''
      try {
        out[key] = JSON.parse(raw)
      } catch {
        out[key] = raw
      }
    }
  } catch {
    // Хранилище недоступно: выгрузим только то, что на сервере.
  }
  return out
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** «Мои данные» в профиле: скачать всё одним файлом и удалить аккаунт без писем в поддержку. */
const sessionDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function AccountData() {
  const [busy, setBusy] = useState<'' | 'export' | 'delete'>('')
  const [asking, setAsking] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState<UserSessionRow[]>()
  const [revoking, setRevoking] = useState('')

  useEffect(() => {
    void loadSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [])

  const onRevoke = async (row: UserSessionRow) => {
    if (row.current) {
      const ok = window.confirm('Это текущая сессия: после отзыва вы выйдете из аккаунта. Продолжить?')
      if (!ok) return
    }
    setRevoking(row.revokeKey)
    setError('')
    try {
      const res = await revokeSession(row.revokeKey)
      setSessions((list = []) => list.filter((s) => s.revokeKey !== row.revokeKey))
      if (res.endedCurrent) await forgetDeletedAccount(false).catch(() => undefined)
      else toast('Сессия завершена')
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : 'Не удалось завершить сессию.')
    } finally {
      setRevoking('')
    }
  }

  const exportData = async () => {
    setBusy('export')
    setError('')
    try {
      const server = await callCommunity<object>({ action: 'account-export' })
      download(`animelife-moi-dannye-${new Date().toISOString().slice(0, 10)}.json`, { ...server, browser: localData() })
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : 'Не удалось собрать данные. Попробуйте ещё раз.')
    } finally {
      setBusy('')
    }
  }

  const remove = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('delete')
    setError('')
    try {
      const res = await callCommunity<{ accountDeleted: boolean }>({ action: 'account-delete', confirm: word })
      await forgetDeletedAccount(res.accountDeleted).catch(() => undefined)
      toast('Аккаунт и его данные удалены. Список в этом браузере остался, его можно очистить в «Моём списке»')
    } catch (err) {
      setError(err instanceof CommunityError ? err.message : 'Не удалось удалить аккаунт. Попробуйте ещё раз.')
      setBusy('')
    }
  }

  return (
    <section className="stack profile-settings" aria-labelledby="account-data-title">
      <h2 id="account-data-title">Мои данные</h2>
      <p className="muted">
        Скачайте одним файлом всё, что сайт о вас хранит: список, историю, отзывы, комментарии, подборки и настройки. Аккаунт можно удалить
        здесь же, вместе с этими данными.
      </p>
      {sessions && (
        <div className="stack">
          <h3>Активные входы</h3>
          <p className="muted">Браузеры и устройства, где выполнен вход. Можно завершить лишние сессии.</p>
          {!sessions.length ? (
            <p className="muted">Кроме текущей, других сессий нет.</p>
          ) : (
            <ul className="stack">
              {sessions.map((s) => (
                <li key={s.revokeKey} className="actions">
                  <span>
                    {s.userAgent}
                    {s.current ? ' · текущая' : ''}
                    <span className="muted"> · {sessionDate.format(new Date(s.createdAt))}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={!!revoking}
                    onClick={() => void onRevoke(s)}
                  >
                    {revoking === s.revokeKey ? '…' : 'Завершить'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn btn--ghost" disabled={!!busy} onClick={() => void exportData()}>
          {busy === 'export' ? 'Собираем…' : 'Скачать мои данные'}
        </button>
        {!asking && (
          <button type="button" className="btn btn--ghost btn--danger" onClick={() => setAsking(true)}>
            Удалить аккаунт
          </button>
        )}
      </div>
      {asking && (
        <form className="stack notice" onSubmit={remove}>
          <p>
            Удалятся аккаунт, синхронизация списка, отзывы, комментарии, подборки, клубы, подписки и уведомления. Вернуть их будет нельзя.
            Сначала можно скачать данные.
          </p>
          <label className="stack">
            <span>Чтобы подтвердить, введите слово УДАЛИТЬ</span>
            <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" aria-label="Подтверждение удаления" />
          </label>
          <div className="actions">
            <button type="submit" className="btn btn--danger" disabled={!!busy || word.trim().toUpperCase() !== 'УДАЛИТЬ'}>
              {busy === 'delete' ? 'Удаляем…' : 'Удалить навсегда'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
    </section>
  )
}

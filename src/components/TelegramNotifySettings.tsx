import { useEffect, useState } from 'react'
import { useAuth } from '../data/auth'
import {
  TELEGRAM_BOT,
  disableTelegramNotify,
  enableTelegramNotify,
  isTelegramAccount,
  refreshTelegramNotify,
  useTelegramNotify,
} from '../data/telegramNotify'

/** Уведомления о новых сериях в Telegram-боте: для аккаунтов, вошедших через Telegram. */
export default function TelegramNotifySettings() {
  const { user, checking } = useAuth()
  const state = useTelegramNotify()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const telegramUser = isTelegramAccount(user?.$id)

  useEffect(() => {
    if (!telegramUser) return
    refreshTelegramNotify().catch(() => undefined)
  }, [telegramUser])

  if (checking) return null

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      await (state === 'on' ? disableTelegramNotify() : enableTelegramNotify())
    } catch (e) {
      setError(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не получилось, попробуйте ещё раз.')
    }
    setBusy(false)
  }

  const hint = !telegramUser
    ? `Бот @${TELEGRAM_BOT} может присылать новые серии из «Смотрю». Для этого войдите на сайт через Telegram.`
    : {
        loading: 'Проверяем…',
        unavailable: 'Уведомления в Telegram скоро заработают.',
        off: `Бот @${TELEGRAM_BOT} напишет, когда выйдет новая серия тайтла из «Смотрю» или с колокольчиком.`,
        on: `Включены. Бот @${TELEGRAM_BOT} пришлёт сообщение, когда выйдет новая серия.`,
      }[state]

  return (
    <section className="push-card" data-testid="telegram-notify">
      <div className="push-card__text">
        <h3>Новые серии в Telegram</h3>
        <p className="muted">{hint}</p>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
      </div>
      {telegramUser && (state === 'on' || state === 'off') && (
        <button
          type="button"
          className={`btn ${state === 'on' ? 'btn--ghost' : 'btn--accent'}`}
          disabled={busy}
          onClick={toggle}
        >
          {busy ? 'Секунду…' : state === 'on' ? 'Выключить' : 'Включить'}
        </button>
      )}
    </section>
  )
}

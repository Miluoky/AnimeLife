import { useEffect, useState } from 'react'
import { useAuth } from '../data/auth'
import {
  TELEGRAM_BOT,
  disableTelegramNotify,
  enableTelegramNotify,
  isTelegramAccount,
  refreshTelegramNotify,
  setWeeklyDigest,
  useTelegramNotify,
  useWeeklyDigest,
} from '../data/telegramNotify'
import './push.css'

/** Уведомления о новых сериях в Telegram-боте: для аккаунтов, вошедших через Telegram. */
export default function TelegramNotifySettings() {
  const { user, checking } = useAuth()
  const state = useTelegramNotify()
  const weekly = useWeeklyDigest()
  const [busy, setBusy] = useState(false)
  const [weeklyBusy, setWeeklyBusy] = useState(false)
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

  async function toggleWeekly() {
    setWeeklyBusy(true)
    setError('')
    try {
      await setWeeklyDigest(!weekly)
    } catch (e) {
      setError(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не получилось, попробуйте ещё раз.')
    }
    setWeeklyBusy(false)
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
    <div className="tg-notify">
    <section className="push-card" data-testid="telegram-notify">
      <div className="push-card__text">
        <h3>Новые серии в Telegram</h3>
        <p className="muted">{hint}</p>
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
    {telegramUser && (state === 'on' || state === 'off') && (
      <section className="push-card" data-testid="telegram-weekly">
        <div className="push-card__text">
          <h3>Еженедельная сводка</h3>
          <p className="muted">
            {state === 'on'
              ? 'По воскресеньям около 10:00 по Москве бот напомнит открыть «За неделю» на вкладке «Смотрю»: новые серии и то, что ещё не досмотрели.'
              : 'Запомним выбор. Сводка придёт по воскресеньям, когда уведомления в боте будут включены.'}
          </p>
        </div>
        <button
          type="button"
          className={`btn ${weekly ? 'btn--ghost' : 'btn--accent'}`}
          disabled={weeklyBusy}
          onClick={toggleWeekly}
        >
          {weeklyBusy ? 'Секунду…' : weekly ? 'Выключить' : 'Включить'}
        </button>
      </section>
    )}
    {error && (
      <p className="notice notice--error" role="alert">
        {error}
      </p>
    )}
    </div>
  )
}

import { useState } from 'react'
import { disablePush, enablePush, usePushState } from '../data/push'
import { useMyList } from '../data/myList'
import './push.css'

/** Переключатель уведомлений о новых сериях для тайтлов из «Смотрю». */
export default function PushSettings() {
  const state = usePushState()
  const list = useMyList()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const watching = list.filter((e) => e.status === 'watching').length

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      await (state === 'on' ? disablePush() : enablePush())
    } catch (e) {
      setError(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не получилось включить уведомления.')
    }
    setBusy(false)
  }

  const hint = {
    unsupported: 'Этот браузер не умеет показывать уведомления от сайтов.',
    'ios-install':
      'На iPhone уведомления работают только в приложении: в Safari нажмите «Поделиться», затем «На экран Домой», и откройте Anime Life с главного экрана.',
    denied: 'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и обновите страницу.',
    off: 'Пришлём уведомление, когда выйдет новая серия тайтла из «Смотрю».',
    on: watching
      ? `Включены. Следим за новыми сериями ${watching} ${watching % 10 === 1 && watching % 100 !== 11 ? 'тайтла' : 'тайтлов'} из «Смотрю».`
      : 'Включены. Отметьте онгоинги как «Смотрю», и мы сообщим о новых сериях.',
  }[state]

  return (
    <section className="push-card">
      <div className="push-card__text">
        <h3>Уведомления о новых сериях</h3>
        <p className="muted">{hint}</p>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
      </div>
      {(state === 'on' || state === 'off') && (
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

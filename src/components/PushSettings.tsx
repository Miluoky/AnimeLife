import { useState } from 'react'
import { Link } from 'react-router-dom'
import { disablePush, enablePush, site, usePushState, watchingIds } from '../data/push'
import { useMyList } from '../data/myList'
import './push.css'

/** Переключатель уведомлений о новых сериях для тайтлов из «Смотрю». */
export default function PushSettings() {
  const state = usePushState()
  const list = useMyList()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demoNote, setDemoNote] = useState('')
  const watching = list.filter((e) => e.status === 'watching').length

  async function toggle() {
    setBusy(true)
    setError('')
    setDemoNote('')
    try {
      await (state === 'on' ? disablePush() : enablePush())
    } catch (e) {
      setError(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не получилось включить уведомления.')
    }
    setBusy(false)
  }

  /** Локальный пример пуша: тот же текст и ссылка на серию, что шлёт community по расписанию. */
  async function previewPush() {
    setDemoNote('')
    setError('')
    const id = watchingIds()[0] ?? '1'
    const title = list.find((e) => e.anime.id === id)?.anime.title ?? 'Ковбой Бибоп'
    const url = `${site()}watch/${id}/1`
    try {
      const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
      if (reg?.showNotification) {
        await reg.showNotification(`Новая серия: ${title}`, {
          body: `Вышла 1-я серия. Тайтл в вашем списке «Смотрю».`,
          tag: `anime-${id}-demo`,
          data: { url },
        })
      } else {
        new Notification(`Новая серия: ${title}`, { body: `Вышла 1-я серия. Тайтл в вашем списке «Смотрю».` })
      }
      setDemoNote('Пример показан. Нажмите уведомление — откроется серия.')
    } catch {
      setError('Не удалось показать пример уведомления.')
    }
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
        {state === 'on' && watching === 0 && (
          <p className="muted">
            <Link to="/library?tab=watching">Открыть «Смотрю»</Link> и добавьте онгоинг — пуш придёт о новой серии.
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {demoNote && (
          <p className="muted" role="status">
            {demoNote}
          </p>
        )}
      </div>
      {(state === 'on' || state === 'off') && (
        <div className="push-card__actions">
          <button
            type="button"
            className={`btn ${state === 'on' ? 'btn--ghost' : 'btn--accent'}`}
            disabled={busy}
            onClick={toggle}
          >
            {busy ? 'Секунду…' : state === 'on' ? 'Выключить' : 'Включить'}
          </button>
          {state === 'on' && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={previewPush}>
              Показать пример
            </button>
          )}
        </div>
      )}
    </section>
  )
}

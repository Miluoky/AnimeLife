import { useState } from 'react'
import { setFollowing, useFollowing, usePushState } from '../data/push'
import { toast } from '../data/toast'

/**
 * Колокольчик на странице онгоинга или анонса: уведомление о новых сериях именно этого тайтла,
 * даже если он не в «Смотрю». У тайтла из «Смотрю» колокольчик горит сам, и его можно выключить.
 */
export default function FollowButton({ animeId, title }: { animeId: string; title: string }) {
  const push = usePushState()
  const following = useFollowing(animeId)
  const [busy, setBusy] = useState(false)
  const on = following && push === 'on'

  if (push === 'unsupported') return null
  const blocked = push === 'denied' || push === 'ios-install'
  const hint = blocked
    ? push === 'denied'
      ? 'Уведомления запрещены в настройках браузера'
      : 'На iPhone уведомления работают, если добавить сайт на экран «Домой»'
    : on
      ? 'Не сообщать о новых сериях'
      : 'Сообщить о новой серии'

  const toggle = async () => {
    if (blocked) return toast(hint)
    setBusy(true)
    try {
      await setFollowing(animeId, !on)
      toast(on ? `Больше не сообщаем о «${title}»` : `Сообщим, когда выйдет новая серия «${title}»`)
    } catch {
      toast('Не получилось включить уведомления')
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      className={`btn btn--ghost follow-btn${on ? ' follow-btn--on' : ''}`}
      aria-pressed={on}
      aria-label={hint}
      title={hint}
      disabled={busy}
      onClick={() => void toggle()}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    </button>
  )
}

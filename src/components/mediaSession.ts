import { useEffect, useRef, type RefObject } from 'react'

interface MediaSessionInfo {
  title: string
  episode: number
  poster?: string
  onNext?: () => void
  onPrev?: () => void
}

/**
 * Экран блокировки, шторка уведомлений, наушники и часы: название серии с постером
 * и кнопки «пауза», «±10 секунд», «следующая/предыдущая серия». Работает только со своим <video>:
 * плееры в iframe (Kodik и другие) сами решают, что показать системе.
 */
export function useMediaSession(video: RefObject<HTMLVideoElement>, active: boolean, info: MediaSessionInfo) {
  const { title, episode, poster } = info
  // Обработчики новые на каждом рендере: держим их в ref, чтобы не переподключать сессию
  const actions = useRef(info)
  actions.current = info
  const hasNext = !!info.onNext
  const hasPrev = !!info.onPrev
  useEffect(() => {
    const el = video.current
    if (!active || !el || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({
      title: `${episode} серия`,
      artist: title,
      album: 'Anime Life',
      artwork: poster ? [{ src: poster, sizes: '512x512' }] : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    })
    const seek = (delta: number) => {
      el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta))
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => void el.play()],
      ['pause', () => el.pause()],
      ['seekbackward', (d) => seek(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => seek(d.seekOffset ?? 10)],
      ['seekto', (d) => d.seekTime != null && (el.currentTime = d.seekTime)],
      ['nexttrack', hasNext ? () => actions.current.onNext?.() : null],
      ['previoustrack', hasPrev ? () => actions.current.onPrev?.() : null],
    ]
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // браузер не знает это действие (старый Safari без seekto)
      }
    }
    for (const [action, handler] of handlers) set(action, handler)

    // Полоска прогресса на экране блокировки
    const position = () => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) return
      try {
        ms.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: el.playbackRate })
      } catch {
        // позиция вне длительности на миг смены источника
      }
    }
    const state = () => {
      ms.playbackState = el.paused ? 'paused' : 'playing'
      position()
    }
    const events = ['play', 'pause', 'loadedmetadata', 'seeked', 'ratechange'] as const
    for (const e of events) el.addEventListener(e, state)
    state()
    return () => {
      for (const e of events) el.removeEventListener(e, state)
      for (const [action] of handlers) set(action, null)
      ms.metadata = null
      ms.playbackState = 'none'
    }
  }, [video, active, title, episode, poster, hasNext, hasPrev])
}

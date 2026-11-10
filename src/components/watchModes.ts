import { useCallback, useEffect, useRef, useState } from 'react'
import { onPlayerTime } from '../data/playerTime'

/**
 * Мини-плеер: когда видео целиком ушло вверх (листаем к комментариям), оно перебирается в угол
 * экрана и играет дальше. Элемент не переносится в DOM, меняется только CSS, поэтому iframe
 * Kodik не перезагружается. Место под видео сохраняет высоту, чтобы страница не прыгала.
 */
export function useMiniPlayer(enabled: boolean) {
  const slot = useRef<HTMLDivElement>(null)
  const [mini, setMini] = useState(false)
  const [closed, setClosed] = useState(false)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = slot.current
    if (!enabled || !el) return
    const io = new IntersectionObserver(
      ([e]) => {
        // Мини-режим только когда видео ушло ВВЕРХ, а не когда страница ещё не долистана до него.
        const gone = !e.isIntersecting && e.boundingClientRect.top < 0
        if (gone) setHeight(e.boundingClientRect.height)
        else setClosed(false)
        setMini(gone)
      },
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])

  return { slot, mini: mini && !closed, height, close: () => setClosed(true) }
}

/** Шторка света: всё вокруг видео затемняется. Выключается кликом по шторке или Esc. */
export function useLightsOff() {
  const [off, setOff] = useState(false)
  useEffect(() => {
    if (!off) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOff(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [off])
  return [off, setOff] as const
}

/**
 * Тяжёлый UI под плеером (комменты, рейтинг, NextPart, «Смотреть вместе»).
 * Включаем после первого play, скролла к блоку или длинного idle — не во время старта серии.
 * Playwright (webdriver) — сразу, чтобы тесты не ждали.
 * sentinelRef — callback-ref: элемент появляется после загрузки тайтла.
 */
export function useEngageReady() {
  const [ready, setReady] = useState(() => typeof navigator !== 'undefined' && !!navigator.webdriver)
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null)
  const sentinelRef = useCallback((el: HTMLElement | null) => setSentinel(el), [])

  useEffect(() => {
    if (ready) return
    let done = false
    const go = () => {
      if (done) return
      done = true
      setReady(true)
    }

    // Play: время серии пошло вперёд (свой плеер и Kodik через emitPlayerTime).
    let last = -1
    const offTime = onPlayerTime((t) => {
      if (last >= 0 && t > last) go()
      last = t
    })

    // Idle-fallback подольше: пока зритель только смотрит — Appwrite/franchise чанки не тянем.
    const idleId = globalThis.requestIdleCallback?.(go, { timeout: 12_000 })
    const timer = idleId === undefined ? window.setTimeout(go, 8_000) : undefined

    return () => {
      done = true
      offTime()
      if (idleId !== undefined) globalThis.cancelIdleCallback?.(idleId)
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [ready])

  // Отдельно от idle: появление sentinel после loadAnime не должно сбрасывать таймер.
  useEffect(() => {
    if (ready || !sentinel) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setReady(true)
      },
      { rootMargin: '240px 0px' },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [ready, sentinel])

  return { engageReady: ready, engageSentinel: sentinelRef }
}

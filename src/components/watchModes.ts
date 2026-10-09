import { useEffect, useRef, useState } from 'react'

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

import { useEffect, useSyncExternalStore } from 'react'

/**
 * «Свет постера»: страница (баннер на главной, страница тайтла) просит подсветить фон постером.
 * Слой рисует <Ambient /> в Layout; уходя со страницы, подсветка гаснет.
 *
 * На data-lite и prefers-reduced-motion src не публикуем — нет лишней картинки и GPU-blur.
 * На /watch Ambient выключают явно (useAmbient(undefined)).
 */
let current: string | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const ambientAllowed = () =>
  typeof document !== 'undefined' &&
  document.documentElement.dataset.lite !== '1' &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches

export function useAmbient(src: string | undefined) {
  useEffect(() => {
    if (!src || !ambientAllowed()) return
    current = src
    emit()
    return () => {
      if (current !== src) return
      current = undefined
      emit()
    }
  }, [src])
}

export function useAmbientSrc() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

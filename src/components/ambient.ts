import { useEffect, useSyncExternalStore } from 'react'

/**
 * «Свет постера»: страница, где открыт тайтл (баннер на главной, страница тайтла, плеер), просит
 * подсветить фон его постером. Слой рисует <Ambient /> в Layout; уходя со страницы, подсветка гаснет.
 */
let current: string | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function useAmbient(src: string | undefined) {
  useEffect(() => {
    if (!src) return
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

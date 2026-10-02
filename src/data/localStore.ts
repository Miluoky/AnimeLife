import { useSyncExternalStore } from 'react'

/** Значение в localStorage, на изменения которого подписываются компоненты. */
export function createLocalStore<T>(key: string, fallback: T) {
  let cache: T | undefined
  const listeners = new Set<() => void>()

  function get(): T {
    if (cache !== undefined) return cache
    try {
      const raw = localStorage.getItem(key)
      cache = raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      cache = fallback
    }
    return cache
  }

  function set(value: T) {
    cache = value
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Приватный режим или переполненное хранилище: данные живут до перезагрузки.
    }
    listeners.forEach((l) => l())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // Изменения из другой вкладки.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return
      cache = undefined
      listeners.forEach((l) => l())
    })
  }

  function use(): T {
    return useSyncExternalStore(subscribe, get, get)
  }

  return { get, set, use, subscribe }
}

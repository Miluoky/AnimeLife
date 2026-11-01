import { useSyncExternalStore } from 'react'
import { listStore, type ListEntry } from './myList'

/** «Мой список» и «Смотрю»: полка уже в браузере, её можно показать без сети. */
export const isShelfPath = (path: string) => /^\/(my-list|watching)\/?$/.test(path)

export function shelfPosterUrls(entries: ListEntry[] = listStore.get()) {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const e of entries) {
    for (const u of [e.anime.posterSmall || e.anime.posterUrl, e.anime.posterSmall2x]) {
      if (!u || seen.has(u)) continue
      seen.add(u)
      urls.push(u)
    }
  }
  return urls
}

/** Пока сеть есть, просим service worker сохранить постеры полки. Сами записи живут в localStorage. */
export function warmOfflineShelf() {
  if (typeof navigator === 'undefined' || !navigator.onLine || !('serviceWorker' in navigator)) return
  const urls = shelfPosterUrls().slice(0, 160)
  if (!urls.length) return
  void navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'shelf', urls }))
    .catch(() => undefined)
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

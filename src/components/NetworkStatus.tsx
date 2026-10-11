import { Suspense, lazy, useEffect, useState } from 'react'

const loadNotice = () => import('./OfflineNotice')
const OfflineNotice = lazy(loadNotice)

/**
 * Следит за сетью. Пока всё хорошо, ничего не грузит и не рисует; плашка «Нет сети» и «Сеть вернулась»
 * лежит отдельной частью (она уже в кэше service worker, если код страниц успел докачаться).
 */
export default function NetworkStatus() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>(() => (navigator.onLine ? 'online' : 'offline'))

  useEffect(() => {
    // Плашку надо скачать, пока сеть есть: без сети её уже не загрузить. Она весит меньше килобайта.
    const preload = setTimeout(() => void loadNotice().catch(() => undefined), 3000)
    let timer: ReturnType<typeof setTimeout> | undefined
    const offline = () => {
      clearTimeout(timer)
      setState('offline')
    }
    const online = () => {
      setState((s) => (s === 'offline' ? 'back' : s))
      timer = setTimeout(() => setState('online'), 4000)
    }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      clearTimeout(preload)
      clearTimeout(timer)
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])

  if (state === 'online') return null
  return (
    <Suspense fallback={null}>
      <OfflineNotice back={state === 'back'} />
    </Suspense>
  )
}

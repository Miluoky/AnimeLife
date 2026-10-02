import { useSyncExternalStore } from 'react'
import { VAPID_PUBLIC_KEY } from '../api/appwrite'
import { CommunityError, callCommunity } from './community'
import { listStore } from './myList'

/**
 * Пуш-уведомления о новых сериях тайтлов из «Смотрю». Браузер выдаёт подписку, мы отправляем её
 * в функцию вместе со списком тайтлов, а функция по расписанию проверяет календарь Shikimori.
 * Когда меняется «Смотрю», список тайтлов в подписке обновляется сам.
 */

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

const site = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

let state: PushState = 'off'
const listeners = new Set<() => void>()

function setState(next: PushState) {
  state = next
  listeners.forEach((l) => l())
}

export function usePushState(): PushState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const watchingIds = () =>
  listStore
    .get()
    .filter((e) => e.status === 'watching')
    .map((e) => e.anime.id)

function keyBytes(base64: string) {
  const b64 = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
}

async function currentSubscription() {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

async function send(sub: PushSubscription) {
  await callCommunity({ action: 'push-subscribe', subscription: sub.toJSON(), animeIds: watchingIds(), site: site() })
}

/** Узнаём состояние при запуске и следим за «Смотрю». */
export async function initPush() {
  if (!supported()) {
    setState(isIos() && !standalone() ? 'ios-install' : 'unsupported')
    return
  }
  if (Notification.permission === 'denied') {
    setState('denied')
    return
  }
  const sub = await currentSubscription().catch(() => null)
  setState(sub ? 'on' : 'off')

  let timer: ReturnType<typeof setTimeout> | undefined
  let last = watchingIds().join(',')
  listStore.subscribe(() => {
    const ids = watchingIds().join(',')
    if (ids === last || state !== 'on') return
    last = ids
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const current = await currentSubscription().catch(() => null)
      if (current) await send(current).catch(() => undefined)
    }, 2000)
  })
}

export async function enablePush() {
  const reg = await registration()
  if (!reg) throw new CommunityError('Обновите страницу и попробуйте ещё раз.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    setState(permission === 'denied' ? 'denied' : 'off')
    return
  }
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  await send(sub)
  setState('on')
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (sub) {
    await callCommunity({ action: 'push-unsubscribe', endpoint: sub.endpoint }).catch(() => undefined)
    await sub.unsubscribe()
  }
  setState('off')
}

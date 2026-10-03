import { useSyncExternalStore } from 'react'
import { VAPID_PUBLIC_KEY } from '../api/config'
import { CommunityError, callCommunity } from './community'
import { createLocalStore } from './localStore'
import { listStore } from './myList'

/**
 * Пуш-уведомления о новых сериях тайтлов из «Смотрю» и тех, на которые нажали колокольчик. Браузер выдаёт подписку, мы отправляем её
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

/** Тайтлы, на которые нажали колокольчик, и тайтлы из «Смотрю», о которых колокольчиком попросили молчать. */
const followStore = createLocalStore<string[]>('anime.follow.v1', [])
const muteStore = createLocalStore<string[]>('anime.mute.v1', [])

const watching = () =>
  listStore
    .get()
    .filter((e) => e.status === 'watching')
    .map((e) => e.anime.id)

/** О каких тайтлах сообщать: «Смотрю» и колокольчики, кроме выключенных. */
const watchingIds = () => {
  const muted = new Set(muteStore.get())
  return [...new Set([...watching(), ...followStore.get()])].filter((id) => !muted.has(id))
}

/** Включён ли колокольчик у тайтла. Перерисовывается при смене «Моего списка» и колокольчиков. */
export function useFollowing(animeId: string): boolean {
  listStore.use()
  followStore.use()
  muteStore.use()
  return watchingIds().includes(animeId)
}

/** Колокольчик на странице тайтла: включает уведомления о его сериях или выключает их. */
export async function setFollowing(animeId: string, on: boolean) {
  const without = (list: string[]) => list.filter((id) => id !== animeId)
  if (on) {
    followStore.set([...without(followStore.get()), animeId])
    muteStore.set(without(muteStore.get()))
    // Уведомления ещё не включены: колокольчик заодно спрашивает разрешение браузера.
    if (state !== 'on') await enablePush()
  } else {
    followStore.set(without(followStore.get()))
    if (watching().includes(animeId)) muteStore.set([...without(muteStore.get()), animeId])
  }
}

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
  const resync = () => {
    const ids = watchingIds().join(',')
    if (ids === last || state !== 'on') return
    last = ids
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const current = await currentSubscription().catch(() => null)
      if (current) await send(current).catch(() => undefined)
    }, 2000)
  }
  listStore.subscribe(resync)
  followStore.subscribe(resync)
  muteStore.subscribe(resync)
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

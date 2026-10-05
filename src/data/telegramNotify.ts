import { useSyncExternalStore } from 'react'
import { listStore } from './myList'
import { followStore, muteStore, site, watchingIds } from './push'
import { telegramOnStore } from './telegramFlag'

/**
 * Уведомления о новых сериях в Telegram, от бота, которым входят на сайт. Работают у аккаунтов, вошедших
 * через Telegram: функция community хранит подписку со списком тайтлов («Смотрю» и колокольчики) и по расписанию
 * пишет в бота, когда выходит серия. Как и с пушами, при смене «Смотрю» список в подписке обновляется сам.
 */

export const TELEGRAM_BOT = 'AnimeLifeAuth_bot'

/** loading — спрашиваем функцию; unavailable — бот для уведомлений ещё не настроен на сервере. */
export type TelegramNotifyState = 'loading' | 'unavailable' | 'off' | 'on'

const community = () => import('./community')

let state: TelegramNotifyState = 'loading'
const listeners = new Set<() => void>()

function setState(next: TelegramNotifyState) {
  state = next
  telegramOnStore.set(next === 'on')
  listeners.forEach((l) => l())
}

export function useTelegramNotify(): TelegramNotifyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Аккаунт вошёл через Telegram: только таким пользователям бот может писать. */
export const isTelegramAccount = (userId: string | undefined) => /^tg_\d+$/.test(userId ?? '')

const send = async () => {
  const { callCommunity } = await community()
  await callCommunity({ action: 'tg-subscribe', animeIds: watchingIds(), site: site() })
}

/** Спрашиваем функцию, включены ли уведомления, когда открывают профиль. */
export async function refreshTelegramNotify() {
  const { callCommunity } = await community()
  const reply = await callCommunity<{ configured: boolean; on: boolean }>({ action: 'tg-status' })
  setState(reply.on ? 'on' : reply.configured ? 'off' : 'unavailable')
}

export async function enableTelegramNotify() {
  await send()
  setState('on')
}

export async function disableTelegramNotify() {
  const { callCommunity } = await community()
  await callCommunity({ action: 'tg-unsubscribe' })
  setState('off')
}

/** При запуске: если уведомления в Telegram включены, держим список тайтлов в подписке свежим. */
export function initTelegramNotify() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = watchingIds().join(',')
  const resync = () => {
    const ids = watchingIds().join(',')
    if (ids === last || !telegramOnStore.get()) return
    last = ids
    clearTimeout(timer)
    timer = setTimeout(() => void send().catch(() => undefined), 2000)
  }
  listStore.subscribe(resync)
  followStore.subscribe(resync)
  muteStore.subscribe(resync)
}

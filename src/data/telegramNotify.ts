import { useSyncExternalStore } from 'react'
import { createLocalStore } from './localStore'
import { listStore } from './myList'
import { followStore, muteStore, site, watchingIds } from './push'
import { telegramOnStore } from './telegramFlag'

/**
 * Уведомления о новых сериях в Telegram, от бота, которым входят на сайт. Работают у аккаунтов, вошедших
 * через Telegram: функция community хранит подписку со списком тайтлов («Смотрю» и колокольчики) и по расписанию
 * пишет в бота, когда выходит серия. Как и с пушами, при смене «Смотрю» список в подписке обновляется сам.
 */

export const TELEGRAM_BOT = 'AnimeLifeAuth_bot'

/**
 * «Еженедельная сводка»: локальный переключатель. Пока уведомления в боте включены, то же значение
 * уходит в подписку (поле auth строки Telegram = weekly). Воскресное расписание читает его и шлёт
 * одно напоминание за неделю. Ключ: anime.telegram.weekly.v1.
 */
export const weeklyDigestStore = createLocalStore<boolean>('anime.telegram.weekly.v1', false)

export function useWeeklyDigest() {
  return weeklyDigestStore.use()
}

/** loading — спрашиваем функцию; unavailable — бот для уведомлений ещё не настроен на сервере. */
export type TelegramNotifyState = 'loading' | 'unavailable' | 'off' | 'on'

async function tgAction<T>(body: object): Promise<T> {
  const { coreAction } = await import('../api/core')
  return coreAction<T>((body as { action: string }).action, body as Record<string, unknown>)
}

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
  await tgAction({
    action: 'tg-subscribe',
    animeIds: watchingIds(),
    site: site(),
    weekly: weeklyDigestStore.get(),
  })
}

/** Спрашиваем функцию, включены ли уведомления, когда открывают профиль. */
export async function refreshTelegramNotify() {
  const reply = await tgAction<{ configured: boolean; on: boolean; weekly?: boolean }>({ action: 'tg-status' })
  setState(reply.on ? 'on' : reply.configured ? 'off' : 'unavailable')
  // Подписка есть: сервер знает, включена ли сводка. Пока бот выключен, не затираем местный выбор.
  if (reply.on && typeof reply.weekly === 'boolean') weeklyDigestStore.set(reply.weekly)
}

/** Включить или выключить воскресную сводку. Если бот уже пишет, подписка обновляется сразу. */
export async function setWeeklyDigest(on: boolean) {
  const prev = weeklyDigestStore.get()
  weeklyDigestStore.set(on)
  if (!telegramOnStore.get()) return
  try {
    await send()
  } catch (e) {
    weeklyDigestStore.set(prev)
    throw e
  }
}

export async function enableTelegramNotify() {
  await send()
  setState('on')
}

export async function disableTelegramNotify() {
  await tgAction({ action: 'tg-unsubscribe' })
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

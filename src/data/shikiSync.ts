import { callCommunity } from './community'
import { createLocalStore } from './localStore'
import { listStore, type ListEntry } from './myList'

/**
 * Синхронизация списка с Shikimori в обе стороны.
 * Туда: изменения статуса, серий и оценки уходят через функцию community (она хранит ключ OAuth).
 * Обратно: список с Shikimori подтягивается по нику, как обычный импорт (listImport.ts).
 */
export const SHIKI_CLIENT_ID = import.meta.env.VITE_SHIKIMORI_CLIENT_ID as string | undefined
const SHIKI = 'https://shikimori.io'

export const shikiLinkStore = createLocalStore<{ nickname: string; at: number } | null>('anime.shiki.v1', null)

export const shikiRedirect = () => `${location.origin}/auth/shikimori`

export function shikiAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: SHIKI_CLIENT_ID ?? '',
    redirect_uri: shikiRedirect(),
    response_type: 'code',
    scope: 'user_rates',
  })
  return `${SHIKI}/oauth/authorize?${params}`
}

export async function connectShikimori(code: string) {
  const r = await callCommunity<{ nickname: string }>({ action: 'shiki-connect', code, redirectUri: shikiRedirect() })
  shikiLinkStore.set({ nickname: r.nickname, at: Date.now() })
  return r.nickname
}

export async function disconnectShikimori() {
  await callCommunity({ action: 'shiki-disconnect' })
  shikiLinkStore.set(null)
}

const toItem = (e: ListEntry) => ({ id: e.anime.id, status: e.status, episodes: e.watched ?? 0, score: e.rating ?? 0 })

/** Отправить весь список. Возвращает, сколько тайтлов ушло. */
export async function pushAll(onProgress?: (done: number, total: number) => void) {
  const items = listStore.get().map(toItem)
  let done = 0
  for (let i = 0; i < items.length; i += 10) {
    await callCommunity({ action: 'shiki-push', items: items.slice(i, i + 10) })
    done = Math.min(items.length, i + 10)
    onProgress?.(done, items.length)
  }
  return done
}

let started = false

/** Подключено: каждое изменение в списке через несколько секунд уходит на Shikimori. */
export function autoSync() {
  if (started || !shikiLinkStore.get()) return
  started = true
  const key = (e: ListEntry) => `${e.status}:${e.watched ?? 0}:${e.rating ?? 0}`
  let prev = new Map(listStore.get().map((e) => [e.anime.id, key(e)]))
  const pending = new Map<string, ReturnType<typeof toItem>>()
  let timer: ReturnType<typeof setTimeout> | undefined
  listStore.subscribe(() => {
    if (!shikiLinkStore.get()) return
    const now = listStore.get()
    for (const e of now) if (prev.get(e.anime.id) !== key(e)) pending.set(e.anime.id, toItem(e))
    prev = new Map(now.map((e) => [e.anime.id, key(e)]))
    if (!pending.size) return
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const items = [...pending.values()].slice(0, 10)
      items.forEach((it) => pending.delete(it.id))
      await callCommunity({ action: 'shiki-push', items }).catch(() => undefined)
    }, 5000)
  })
}

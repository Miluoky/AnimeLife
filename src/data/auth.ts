import { useSyncExternalStore } from 'react'
import type { Models } from 'appwrite'
import { historyStore, type HistoryEntry } from './history'
import { listStore, removedStore, type ListEntry } from './myList'
import { flagsStore, mergeFlags, type Flag } from './flags'

/**
 * Аккаунт и синхронизация. «Мой список» и история просмотра лежат в настройках пользователя
 * Appwrite (prefs, до 64 КБ): отдельная база для этого не нужна. В браузере остаётся копия,
 * поэтому сайт работает и без входа, и без сети.
 */
interface SyncedPrefs {
  /** старое место списка: настройки аккаунта вмещают только 64 КБ, теперь список в таблице lists */
  list?: ListEntry[] | null
  removed?: Record<string, number>
  history?: HistoryEntry[]
  /** события для достижений */
  flags?: Partial<Record<Flag, number>>
  /** открытый профиль /u/:id */
  publicProfile?: boolean
}

const REMOVED_TTL = 90 * 24 * 3600 * 1000

// SDK Appwrite весит заметно, поэтому едет отдельной частью и подключается при первом обращении к аккаунту.
const sdk = () => import('../api/appwrite')

export type User = Models.User<Models.Preferences>
export type { SyncedPrefs }

interface AuthState {
  /** true, пока не выяснили, вошёл ли пользователь */
  checking: boolean
  user: User | null
  /** ошибка последней синхронизации, если была */
  syncError?: string
}

let state: AuthState = { checking: true, user: null }
const listeners = new Set<() => void>()

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const changedAt = (e: ListEntry) => e.updatedAt ?? e.addedAt

function mergeRemoved(a: Record<string, number>, b: Record<string, number>) {
  const oldest = Date.now() - REMOVED_TTL
  const out: Record<string, number> = {}
  for (const [id, at] of [...Object.entries(a), ...Object.entries(b)]) {
    if (at > oldest && at > (out[id] ?? 0)) out[id] = at
  }
  return out
}

// Объединяем по тайтлу: остаётся более свежая запись, а удалённые позже последнего изменения выпадают.
function mergeList(a: ListEntry[], b: ListEntry[], removed: Record<string, number>): ListEntry[] {
  const byId = new Map<string, ListEntry>()
  for (const e of [...a, ...b]) {
    const prev = byId.get(e.anime.id)
    if (!prev || changedAt(e) > changedAt(prev)) byId.set(e.anime.id, e)
  }
  return [...byId.values()]
    .filter((e) => !(removed[e.anime.id] > changedAt(e)))
    .sort((x, y) => changedAt(y) - changedAt(x))
}

function mergeHistory(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>()
  for (const e of [...a, ...b]) {
    const prev = byId.get(e.animeId)
    if (!prev || e.updatedAt > prev.updatedAt) byId.set(e.animeId, e)
  }
  return [...byId.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 12)
}

/**
 * Список хранится в таблице lists (строка = ID пользователя, читать и править может только он):
 * в настройках аккаунта места хватало примерно на 150 тайтлов, а после импорта их бывает тысячи.
 */
async function loadRemoteList(userId: string): Promise<ListEntry[] | null> {
  const { tablesDB, COMMUNITY_DB } = await sdk()
  try {
    const row = await tablesDB.getRow({ databaseId: COMMUNITY_DB, tableId: 'lists', rowId: userId })
    return JSON.parse(String((row as unknown as { data: string }).data || '[]')) as ListEntry[]
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 404) return null
    throw e
  }
}

async function saveRemoteList(userId: string, list: ListEntry[]) {
  const { tablesDB, COMMUNITY_DB } = await sdk()
  const write = () =>
    tablesDB.updateRow({
      databaseId: COMMUNITY_DB,
      tableId: 'lists',
      rowId: userId,
      data: { data: JSON.stringify(list), updatedAt: Date.now() },
    })
  try {
    await write()
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 404)) throw e
    // Первая запись: строку с правами владельца создаёт функция, потом пишем как обычно.
    const { callCommunity } = await import('./community')
    await callCommunity({ action: 'list-init' })
    await write()
  }
}

/** Список из аккаунта прочитан: только после этого можно записывать свой, иначе затрём чужие изменения. */
let remoteListLoaded = false

let pushTimer: ReturnType<typeof setTimeout> | undefined
let applyingRemote = false

async function push() {
  if (!state.user) return
  try {
    if (remoteListLoaded) await saveRemoteList(state.user.$id, listStore.get())
    // Старую копию списка в настройках убираем только когда он уже лежит в таблице.
    const prefs: SyncedPrefs = {
      ...(remoteListLoaded ? { list: null } : {}),
      removed: removedStore.get(),
      history: historyStore.get(),
      flags: flagsStore.get(),
    }
    const { account } = await sdk()
    const user = await account.updatePrefs({ ...state.user.prefs, ...prefs })
    setState({ user, syncError: undefined })
  } catch (e) {
    setState({ syncError: e instanceof Error ? e.message : String(e) })
  }
}

// Каждое изменение списка или истории уходит в аккаунт, пачкой раз в секунду.
function schedulePush() {
  if (!state.user || applyingRemote) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, 1000)
}
listStore.subscribe(schedulePush)
historyStore.subscribe(schedulePush)
flagsStore.subscribe(schedulePush)

/** После входа: объединить то, что было в браузере, с тем, что уже лежит в аккаунте. */
async function adopt(user: User) {
  const remote = user.prefs as SyncedPrefs
  // Пока список не переехал в таблицу, берём его из настроек аккаунта.
  let remoteList: ListEntry[]
  try {
    remoteList = (await loadRemoteList(user.$id)) ?? remote.list ?? []
    remoteListLoaded = true
  } catch {
    // Таблица не ответила: работаем со своим списком, но в аккаунт его не пишем, пока не прочитаем.
    remoteList = remote.list ?? []
  }
  applyingRemote = true
  const removed = mergeRemoved(remote.removed ?? {}, removedStore.get())
  removedStore.set(removed)
  listStore.set(mergeList(remoteList, listStore.get(), removed))
  historyStore.set(mergeHistory(remote.history ?? [], historyStore.get()))
  flagsStore.set(mergeFlags(remote.flags, flagsStore.get()))
  applyingRemote = false
  setState({ checking: false, user })
  await push()
}

async function refresh() {
  try {
    const { account } = await sdk()
    await adopt(await account.get())
  } catch {
    setState({ checking: false, user: null })
  }
}

if (typeof window !== 'undefined') {
  void refresh()
  // Вернулись на вкладку: подтягиваем то, что могли поменять на другом устройстве.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user) void refresh()
  })
}

const messages: Record<string, string> = {
  user_invalid_credentials: 'Неверная почта или пароль.',
  user_already_exists: 'Аккаунт с этой почтой уже есть. Войдите в него.',
  user_password_mismatch: 'Пароли не совпадают.',
  password_recently_used: 'Этот пароль уже использовался, придумайте другой.',
  password_personal_data: 'Пароль не должен содержать имя или почту.',
  general_rate_limit_exceeded: 'Слишком много попыток. Подождите немного и попробуйте снова.',
  general_argument_invalid: 'Проверьте поля: пароль должен быть не короче 8 символов.',
  user_invalid_token: 'Ссылка входа устарела. Попробуйте войти ещё раз.',
  general_unknown_origin: 'Сайт ещё не добавлен в настройки Appwrite, вход пока не работает.',
}

/** Понятное сообщение для формы входа. */
export function authErrorMessage(e: unknown): string {
  // AppwriteException несёт код ошибки в поле type; проверяем по форме, чтобы не тянуть сюда SDK.
  if (e instanceof Error && 'type' in e && typeof e.type === 'string') return messages[e.type] ?? e.message
  if (e instanceof Error && e.name === 'SocialLoginError') return e.message
  return 'Не получилось связаться с сервером. Проверьте интернет и попробуйте ещё раз.'
}

export async function signIn(email: string, password: string) {
  const { account } = await sdk()
  await account.createEmailPasswordSession({ email, password })
  await refresh()
}

export async function signUp(name: string, email: string, password: string) {
  const { account, ID } = await sdk()
  await account.create({ userId: ID.unique(), email, password, name: name || undefined })
  await signIn(email, password)
}

/** Обмен одноразового токена (Google, Яндекс, VK, Telegram) на обычную сессию. */
export async function finishSession(userId: string, secret: string) {
  const { account } = await sdk()
  await account.createSession({ userId, secret })
  await refresh()
}

export async function signOut() {
  clearTimeout(pushTimer)
  await push()
  try {
    const { account } = await sdk()
    await account.deleteSession({ sessionId: 'current' })
  } finally {
    // Список остаётся в браузере: выход не должен ничего стирать.
    remoteListLoaded = false
    setState({ user: null, syncError: undefined })
  }
}

/** Включить или выключить открытый профиль: флаг хранится в настройках аккаунта. */
export async function setPublicProfile(on: boolean) {
  if (!state.user) return
  const { account } = await sdk()
  const user = await account.updatePrefs({ ...state.user.prefs, publicProfile: on })
  setState({ user })
}

import { useSyncExternalStore } from 'react'
import type { CoreUser } from '../api/core'
import { historyStore, type HistoryEntry } from './history'
import { listStore, removedStore, type ListEntry } from './myList'
import { flagsStore, mergeFlags, type Flag } from './flags'
import { telegramOnStore } from './telegramFlag'
import { inviteStore, pendingInvite } from './inviteStore'
import { mangaProgressStore, mergeMangaProgress, type ReadProgress } from './mangaProgress'
import { getRecentPositionsForSync, reconcilePositions, subscribePositions, type SyncedPlaybackPosition } from './positions'
import { episodeReactionsStore, mergeEpisodeReactions, type EpisodeReactionsMap } from './episodeReactions'
import { mergeSeasonPlans, seasonPlanStore, type SeasonPlanMap } from './seasonPlan'

const core = () => import('../api/core')

/**
 * Аккаунт и синхронизация. Prefs и список живут на Core;
 * в браузере остаётся копия — сайт работает и без входа, и без сети.
 */
interface SyncedPrefs {
  list?: ListEntry[] | null
  removed?: Record<string, number>
  history?: HistoryEntry[]
  flags?: Partial<Record<Flag, number>>
  manga?: Record<string, ReadProgress>
  publicProfile?: boolean
  positions?: Record<string, SyncedPlaybackPosition>
  seasonPlan?: SeasonPlanMap
  episodeReactions?: EpisodeReactionsMap
}

const REMOVED_TTL = 90 * 24 * 3600 * 1000

export type User = CoreUser & { prefs: SyncedPrefs & Record<string, unknown> }
export type { SyncedPrefs, SyncedPlaybackPosition }

interface AuthState {
  checking: boolean
  user: User | null
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

async function loadRemoteList(_userId: string): Promise<ListEntry[] | null> {
  const { coreGetList } = await core()
  try {
    const row = await coreGetList()
    return (row.data ?? []) as ListEntry[]
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 404) return null
    throw e
  }
}

async function saveRemoteList(_userId: string, list: ListEntry[]) {
  const { coreSaveList, coreAction } = await core()
  try {
    await coreSaveList(list)
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 404)) throw e
    await coreAction('list-init')
    await coreSaveList(list)
  }
}

let remoteListLoaded = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
let applyingRemote = false

async function push() {
  pushTimer = undefined
  if (!state.user) return
  try {
    if (remoteListLoaded) await saveRemoteList(state.user.$id, listStore.get())
    const prefs: SyncedPrefs = {
      ...(remoteListLoaded ? { list: null } : {}),
      removed: removedStore.get(),
      history: historyStore.get(),
      flags: flagsStore.get(),
      manga: mangaProgressStore.get(),
      positions: getRecentPositionsForSync(),
      seasonPlan: seasonPlanStore.get(),
      episodeReactions: mergeEpisodeReactions({}, episodeReactionsStore.get()),
    }
    const { coreUpdatePrefs } = await core()
    const next = await coreUpdatePrefs({ ...state.user.prefs, ...prefs })
    setState({ user: next.user as User, syncError: undefined })
  } catch (e) {
    setState({ syncError: e instanceof Error ? e.message : String(e) })
  }
}

function schedulePush(delay = 1000) {
  if (!state.user || applyingRemote) return
  if (pushTimer && delay > 1000) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, delay)
}
listStore.subscribe(schedulePush)
historyStore.subscribe(schedulePush)
flagsStore.subscribe(schedulePush)
mangaProgressStore.subscribe(() => schedulePush(10_000))
subscribePositions(() => schedulePush(5_000))
seasonPlanStore.subscribe(schedulePush)
episodeReactionsStore.subscribe(schedulePush)

async function adopt(user: User) {
  const remote = user.prefs as SyncedPrefs
  let remoteList: ListEntry[]
  try {
    remoteList = (await loadRemoteList(user.$id)) ?? remote.list ?? []
    remoteListLoaded = true
  } catch {
    remoteList = remote.list ?? []
  }
  applyingRemote = true
  const removed = mergeRemoved(remote.removed ?? {}, removedStore.get())
  removedStore.set(removed)
  listStore.set(mergeList(remoteList, listStore.get(), removed))
  historyStore.set(mergeHistory(remote.history ?? [], historyStore.get()))
  flagsStore.set(mergeFlags(remote.flags, flagsStore.get()))
  mangaProgressStore.set(mergeMangaProgress(remote.manga, mangaProgressStore.get()))
  if (remote.positions) reconcilePositions(remote.positions)
  seasonPlanStore.set(mergeSeasonPlans(remote.seasonPlan, seasonPlanStore.get()))
  episodeReactionsStore.set(mergeEpisodeReactions(remote.episodeReactions, episodeReactionsStore.get()))
  applyingRemote = false
  setState({ checking: false, user })
  await push()
  if (pendingInvite()) void import('./invites').then((m) => m.claimInvite())
}

const GUEST_KEY = 'anime.guest.v1'
function rememberGuest(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1')
    else localStorage.removeItem(GUEST_KEY)
  } catch {
    /* */
  }
}
function knownGuest() {
  try {
    return localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

function maybeSignedIn() {
  return !knownGuest()
}

export async function refresh() {
  try {
    const { coreMe } = await core()
    const { user } = await coreMe()
    rememberGuest(false)
    await adopt(user as User)
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 401) rememberGuest(true)
    setState({ checking: false, user: null })
  }
}

if (typeof window !== 'undefined') {
  const authReturn = /^\/auth(\/|$)/.test(window.location.pathname)
  if (!authReturn && (knownGuest() || !maybeSignedIn())) setState({ checking: false, user: null })
  else if (/^\/(account|my-list|moderation|chat|together|auth)(\/|$)/.test(window.location.pathname)) void refresh()
  else {
    window.addEventListener(
      'load',
      () => {
        const check = () => void refresh()
        if ('requestIdleCallback' in window) window.requestIdleCallback(check, { timeout: 1200 })
        else setTimeout(check, 300)
      },
      { once: true },
    )
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user) void refresh()
  })
}

const messages: Record<string, string> = {
  user_invalid_credentials: 'Неверная почта или пароль.',
  project_paused: 'Сервер аккаунтов временно выключен. Мы уже чиним, попробуйте позже.',
  user_already_exists: 'Аккаунт с этой почтой уже есть. Войдите в него.',
  user_password_mismatch: 'Пароли не совпадают.',
  password_recently_used: 'Этот пароль уже использовался, придумайте другой.',
  password_personal_data: 'Пароль не должен содержать имя или почту.',
  general_rate_limit_exceeded: 'Слишком много попыток. Подождите немного и попробуйте снова.',
  general_argument_invalid: 'Проверьте поля: пароль должен быть не короче 8 символов.',
  user_invalid_token: 'Ссылка входа устарела. Попробуйте войти ещё раз.',
  user_not_found: 'Аккаунта с этой почтой нет. Проверьте адрес или зарегистрируйтесь.',
}

export function authErrorMessage(e: unknown): string {
  if (e instanceof Error && 'type' in e && typeof e.type === 'string') return messages[e.type] ?? e.message
  if (e instanceof Error && (e.name === 'SocialLoginError' || e.name === 'CommunityError')) return e.message
  return 'Не получилось связаться с сервером. Проверьте интернет и попробуйте ещё раз.'
}

export async function signIn(email: string, password: string) {
  const { coreLogin } = await core()
  await coreLogin(email, password)
  await refresh()
}

export async function signUp(name: string, email: string, password: string) {
  const { coreRegister } = await core()
  await coreRegister(email, password, name || undefined)
  await refresh()
}

/** Legacy callback с userId/secret (Google/Яндекс на старом бэкенде): на Core достаточно refresh. */
export async function finishSession(_userId: string, _secret: string) {
  void _userId
  void _secret
  await refresh()
}

export const corePasswordRecoveryEnabled = () => false

/** Пока нет SMTP и ключей Google/Яндекс: не обещать эти входы в UI. */
export const AUTH_THIS_YEAR_COPY =
  'Google, Яндекс и сброс пароля по письму в этом году не делаем. Вход: почта, VK, Telegram.'

export async function requestRecovery(_email: string) {
  void _email
  throw new Error(AUTH_THIS_YEAR_COPY)
}

export async function finishRecovery(_userId: string, _secret: string, _password: string) {
  void _userId
  void _secret
  void _password
  throw new Error(AUTH_THIS_YEAR_COPY)
}

export async function signOut() {
  clearTimeout(pushTimer)
  await push()
  try {
    const { coreLogout } = await core()
    await coreLogout()
  } finally {
    remoteListLoaded = false
    rememberGuest(true)
    telegramOnStore.set(false)
    inviteStore.set({ invited: 0, invitedBy: false })
    setState({ user: null, syncError: undefined })
  }
}

export async function forgetDeletedAccount(_accountDeleted: boolean) {
  void _accountDeleted
  clearTimeout(pushTimer)
  pushTimer = undefined
  try {
    const { coreLogout } = await core()
    await coreLogout().catch(() => undefined)
  } finally {
    remoteListLoaded = false
    rememberGuest(true)
    telegramOnStore.set(false)
    inviteStore.set({ invited: 0, invitedBy: false })
    setState({ user: null, syncError: undefined })
  }
}

export async function setPublicProfile(on: boolean) {
  if (!state.user) return
  const { coreUpdatePrefs } = await core()
  const next = await coreUpdatePrefs({ ...state.user.prefs, publicProfile: on })
  setState({ user: next.user as User })
}

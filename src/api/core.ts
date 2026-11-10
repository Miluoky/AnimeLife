/** Клиент AnimeLife Core (`/api/core`). */

import { BACKEND } from './config'

export type CoreUser = {
  $id: string
  email: string
  name: string
  prefs: Record<string, unknown>
  labels: string[]
  status: boolean
  emailVerification?: boolean
  registration?: string
}

const base = () => {
  if (typeof location !== 'undefined' && location.origin) return `${location.origin}/api/core`
  return '/api/core'
}

/** Short-lived memo for idempotent GETs (health, me, lists). */
const GET_MEMO_TTL_MS = 10_000
const getMemo = new Map<string, { expiresAt: number; promise: Promise<unknown> }>()

/** Coalesce identical in-flight mutating requests (same method, path, body). */
const inFlight = new Map<string, Promise<unknown>>()

function requestKey(path: string, init: RequestInit): { method: string; dedupeKey: string; getKey: string } {
  const method = (init.method || 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? init.body : ''
  return {
    method,
    dedupeKey: `${method}:${path}:${body}`,
    getKey: `GET:${path}`,
  }
}

async function executeReq<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    // Auth/lists не должны залипать в HTTP-кэше браузера; memo выше — только для /health.
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number }
  if (!res.ok) {
    const err = new Error(data.message || `Core ${res.status}`) as Error & { code?: number }
    err.code = data.code ?? res.status
    throw err
  }
  return data
}

function bustGetMemo(...paths: string[]) {
  for (const p of paths) getMemo.delete(`GET:${p}`)
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { method, dedupeKey, getKey } = requestKey(path, init)

  if (method === 'GET') {
    // /auth/me и /lists/me не кэшируем надолго без bust — иначе устареют после login/prefs.
    const memoable = path === '/health'
    if (memoable) {
      const hit = getMemo.get(getKey)
      if (hit && hit.expiresAt > Date.now()) {
        return hit.promise as Promise<T>
      }
      const promise = executeReq<T>(path, init)
      getMemo.set(getKey, { expiresAt: Date.now() + GET_MEMO_TTL_MS, promise })
      promise.catch(() => getMemo.delete(getKey))
      return promise
    }
    return executeReq<T>(path, init)
  }

  const existing = inFlight.get(dedupeKey)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = executeReq<T>(path, init)
    .then((data) => {
      if (path.startsWith('/auth/') || path.startsWith('/lists/')) {
        bustGetMemo('/auth/me', '/lists/me', '/health')
      }
      return data
    })
    .finally(() => {
      inFlight.delete(dedupeKey)
    })
  inFlight.set(dedupeKey, promise)
  return promise
}

export const isCoreBackend = () => BACKEND === 'core'

export const coreHealth = () => req<{ ok: boolean; backend: string; d1?: boolean; kv?: boolean; time?: number }>('/health')

export const coreRegister = (email: string, password: string, name?: string) =>
  req<{ user: CoreUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) })

export const coreLogin = (email: string, password: string) =>
  req<{ user: CoreUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

export const coreLogout = () => req<{ ok: boolean }>('/auth/logout', { method: 'POST', body: '{}' })

export const coreMe = () => req<{ user: CoreUser }>('/auth/me')

export const coreUpdatePrefs = (prefs: Record<string, unknown>) =>
  req<{ user: CoreUser }>('/auth/prefs', { method: 'PUT', body: JSON.stringify({ prefs }) })

export const coreGetList = () => req<{ data: unknown[]; updatedAt: number | null }>('/lists/me')

export const coreSaveList = (data: unknown[]) =>
  req<{ ok: boolean }>('/lists/me', { method: 'PUT', body: JSON.stringify({ data }) })

export const coreAction = <T = unknown>(action: string, payload: Record<string, unknown> = {}) =>
  req<T>('/action', { method: 'POST', body: JSON.stringify({ action, ...payload }) })

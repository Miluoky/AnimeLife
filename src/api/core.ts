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

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number }
  if (!res.ok) {
    const err = new Error(data.message || `Core ${res.status}`) as Error & { code?: number }
    err.code = data.code ?? res.status
    throw err
  }
  return data
}

export const isCoreBackend = () => BACKEND === 'core'

export const coreHealth = () => req<{ ok: boolean; backend: string }>('/health')

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

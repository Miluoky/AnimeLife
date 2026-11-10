import { SOCIAL_LOGIN } from '../api/config'
import { AUTH_THIS_YEAR_COPY, refresh } from './auth'
import type { CoreUser } from '../api/core'

/** Ошибка входа, которую можно показать как есть. */
export class SocialLoginError extends Error {
  name = 'SocialLoginError'
}

const appUrl = (path: string) => `${window.location.origin}${import.meta.env.BASE_URL}${path}`

export const CALLBACK_PATH = 'auth/callback'
export const VK_CALLBACK_PATH = 'auth/vk'

/** Google и Яндекс: флаги выкл., клиент не ходит на сервер. */
export async function signInWithOAuth(_provider: 'google' | 'yandex') {
  void _provider
  throw new SocialLoginError(AUTH_THIS_YEAR_COPY)
}

interface FunctionReply {
  user?: CoreUser
  userId?: string
  secret?: string
  error?: string
  message?: string
  pending?: boolean
  code?: string
  pollKey?: string
  bot?: string
  expiresIn?: number
}

async function runFunction(body: object): Promise<FunctionReply> {
  const res = await fetch(`${window.location.origin}/api/core/auth/oauth`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let reply: FunctionReply = {}
  try {
    reply = (await res.json()) as FunctionReply
  } catch {
    // ответ не JSON
  }
  const msg = reply.message ?? reply.error
  if (msg || res.status >= 300) {
    throw new SocialLoginError(msg ?? 'Сервер входа не ответил. Попробуйте ещё раз.')
  }
  return reply
}

async function finishWith(reply: FunctionReply) {
  if (reply.pending) return
  if (reply.user) {
    await refresh()
    return
  }
  throw new SocialLoginError('Сервер входа не ответил. Попробуйте ещё раз.')
}

// --- VK ID: OAuth 2.1 с PKCE, код обменивает бэкенд ---

const VK_STATE = 'anime.vkid.pkce'

function randomString(bytes: number) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signInWithVk() {
  const verifier = randomString(48)
  const state = randomString(16)
  sessionStorage.setItem(VK_STATE, JSON.stringify({ verifier, state }))
  const url = new URL('https://id.vk.com/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: SOCIAL_LOGIN.vkAppId,
    redirect_uri: appUrl(VK_CALLBACK_PATH),
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
    scope: 'vkid.personal_info',
    lang_id: '0',
  }).toString()
  window.location.href = url.toString()
}

export async function finishVk(params: URLSearchParams) {
  const saved = JSON.parse(sessionStorage.getItem(VK_STATE) ?? 'null') as { verifier: string; state: string } | null
  sessionStorage.removeItem(VK_STATE)
  if (params.get('error')) throw new SocialLoginError('Вход через VK отменён.')
  if (!saved || saved.state !== params.get('state') || !params.get('code')) {
    throw new SocialLoginError('Ссылка входа через VK устарела. Попробуйте ещё раз.')
  }
  await finishWith(
    await runFunction({
      provider: 'vk',
      code: params.get('code'),
      deviceId: params.get('device_id'),
      state: params.get('state'),
      codeVerifier: saved.verifier,
      redirectUri: appUrl(VK_CALLBACK_PATH),
    }),
  )
}

// --- Telegram: вход через бота ---

export interface TelegramLogin {
  code: string
  pollKey: string
  /** ссылка, которая открывает бота в Telegram */
  link: string
  /** когда код перестанет действовать, с небольшим запасом */
  expiresAt: number
}

export async function startTelegram(): Promise<TelegramLogin> {
  const reply = await runFunction({ provider: 'telegram-start' })
  if (!reply.code || !reply.pollKey || !reply.bot) throw new SocialLoginError('Вход через Telegram сейчас недоступен.')
  return {
    code: reply.code,
    pollKey: reply.pollKey,
    link: `https://t.me/${reply.bot}?start=${reply.code}`,
    expiresAt: Date.now() + ((reply.expiresIn ?? 300) - 15) * 1000,
  }
}

const POLL_EVERY = 2000

/** Ждёт, пока вход подтвердят в боте, и входит. Прерывается через signal. */
export async function waitForTelegram(login: TelegramLogin, signal: AbortSignal) {
  while (!signal.aborted) {
    if (Date.now() > login.expiresAt) throw new SocialLoginError('Время на вход вышло. Нажмите кнопку Telegram ещё раз.')
    const reply = await runFunction({ provider: 'telegram-poll', code: login.code, pollKey: login.pollKey })
    if (signal.aborted) return
    if (!reply.pending) return finishWith(reply)
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisible)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const onVisible = () => document.visibilityState === 'visible' && done()
      const timer = setTimeout(done, POLL_EVERY)
      document.addEventListener('visibilitychange', onVisible)
      signal.addEventListener('abort', done)
    })
  }
}

export async function signInWithTelegramApp(initData: string) {
  await finishWith(await runFunction({ provider: 'telegram-webapp', initData }))
}

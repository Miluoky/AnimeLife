import { ExecutionMethod, OAuthProvider } from 'appwrite'
import { SOCIAL_FUNCTION, SOCIAL_LOGIN, account, functions } from '../api/appwrite'
import { finishSession } from './auth'

/** Ошибка входа, которую можно показать как есть. */
export class SocialLoginError extends Error {
  name = 'SocialLoginError'
}

const appUrl = (path: string) => `${window.location.origin}${import.meta.env.BASE_URL}${path}`

export const CALLBACK_PATH = 'auth/callback'
export const VK_CALLBACK_PATH = 'auth/vk'

/** Google и Яндекс встроены в Appwrite: он сам ведёт на страницу сервиса и возвращает одноразовый токен. */
export function signInWithOAuth(provider: 'google' | 'yandex') {
  void account.createOAuth2Token({
    provider: provider === 'google' ? OAuthProvider.Google : OAuthProvider.Yandex,
    success: appUrl(CALLBACK_PATH),
    failure: appUrl(`${CALLBACK_PATH}?failed=${provider}`),
  })
}

interface FunctionReply {
  userId?: string
  secret?: string
  error?: string
  pending?: boolean
  code?: string
  pollKey?: string
  bot?: string
  expiresIn?: number
}

async function runFunction(body: object): Promise<FunctionReply> {
  const run = await functions.createExecution({
    functionId: SOCIAL_FUNCTION,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
  })
  let reply: FunctionReply = {}
  try {
    reply = JSON.parse(run.responseBody || '{}')
  } catch {
    // ответ не JSON: ниже покажем общую ошибку
  }
  if (reply.error || run.responseStatusCode >= 300) {
    throw new SocialLoginError(reply.error ?? 'Сервер входа не ответил. Попробуйте ещё раз.')
  }
  return reply
}

async function finishWith(reply: FunctionReply) {
  if (!reply.userId || !reply.secret) throw new SocialLoginError('Сервер входа не ответил. Попробуйте ещё раз.')
  await finishSession(reply.userId, reply.secret)
}

// --- VK ID: OAuth 2.1 с PKCE, код обменивает функция ---

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
// Сайт получает код, пользователь открывает бота по ссылке t.me/<бот>?start=<код> и нажимает
// «Подтвердить», а сайт тем временем спрашивает функцию, подтверждён ли вход.

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
    // Ждём следующей проверки; когда пользователь возвращается из Telegram, проверяем сразу.
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

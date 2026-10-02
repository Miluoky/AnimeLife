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

async function callFunction(body: object) {
  const run = await functions.createExecution({
    functionId: SOCIAL_FUNCTION,
    body: JSON.stringify(body),
    async: false,
    method: ExecutionMethod.POST,
  })
  let reply: { userId?: string; secret?: string; error?: string } = {}
  try {
    reply = JSON.parse(run.responseBody || '{}')
  } catch {
    // ответ не JSON: ниже покажем общую ошибку
  }
  if (!reply.userId || !reply.secret) {
    throw new SocialLoginError(reply.error ?? 'Сервер входа не ответил. Попробуйте ещё раз.')
  }
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
  await callFunction({
    provider: 'vk',
    code: params.get('code'),
    deviceId: params.get('device_id'),
    state: params.get('state'),
    codeVerifier: saved.verifier,
    redirectUri: appUrl(VK_CALLBACK_PATH),
  })
}

// --- Telegram Login: всплывающее окно Telegram, подпись проверяет функция ---

interface TelegramLogin {
  auth(options: { bot_id: string; request_access?: string; lang?: string }, callback: (data: object | false) => void): void
}

let telegramScript: Promise<TelegramLogin> | undefined

function loadTelegram() {
  telegramScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.onload = () => {
      const login = (window as unknown as { Telegram?: { Login?: TelegramLogin } }).Telegram?.Login
      if (login) resolve(login)
      else reject(new SocialLoginError('Не удалось загрузить вход Telegram.'))
    }
    script.onerror = () => {
      telegramScript = undefined
      reject(new SocialLoginError('Не удалось загрузить вход Telegram. Проверьте интернет.'))
    }
    document.head.append(script)
  })
  return telegramScript
}

/** Возвращает false, если пользователь закрыл окно Telegram. */
export async function signInWithTelegram(): Promise<boolean> {
  const login = await loadTelegram()
  const data = await new Promise<object | false>((resolve) =>
    login.auth({ bot_id: SOCIAL_LOGIN.telegramBotId, request_access: 'write', lang: 'ru' }, resolve),
  )
  if (!data) return false
  await callFunction({ provider: 'telegram', data })
  return true
}

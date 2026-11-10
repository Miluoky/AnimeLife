/**
 * OAuth Core: VK ID, Telegram (бот + Mini App). Google/Яндекс — заглушки до env-ключей.
 * Сессия как в auth.js: cookie al_session + KV + D1.
 */

import { randomId, randomToken, sha256Hex } from './crypto.js'
import {
  SESSION_TTL_S,
  cookieOpts,
  err,
  json,
  publicUser,
  putSession,
} from './auth.js'

const LOGIN_TTL_MS = 5 * 60 * 1000
const LOGIN_TTL_S = Math.floor(LOGIN_TTL_MS / 1000)
const WEBAPP_TTL = 24 * 3600
const PENDING_PREFIX = 'oauth:tgl:'

class LoginError extends Error {}

function sameText(a, b) {
  const x = String(a)
  const y = String(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

async function bodyJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function formPost(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    throw new LoginError(`VK ID: ${data.error_description || data.error || res.status}`)
  }
  return data
}

async function verifyVk(body, appId) {
  if (!appId) throw new LoginError('Вход через VK ещё не настроен.')
  const { code, codeVerifier, deviceId, redirectUri, state } = body
  if (!code || !codeVerifier || !deviceId || !redirectUri) {
    throw new LoginError('VK прислал неполные данные.')
  }
  const tokens = await formPost('https://id.vk.com/oauth2/auth', {
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    device_id: deviceId,
    redirect_uri: redirectUri,
    client_id: appId,
    state: state ?? '',
  })
  const info = await formPost('https://id.vk.com/oauth2/user_info', {
    client_id: appId,
    access_token: tokens.access_token,
  })
  const user = info.user ?? {}
  const id = user.user_id ?? tokens.user_id
  if (!id) throw new LoginError('VK не вернул пользователя.')
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return { provider: 'vk', providerId: String(id), legacyUserId: `vk_${id}`, name }
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export async function verifyWebAppData(initData, botToken, now = Date.now()) {
  if (!botToken) throw new LoginError('Вход через Telegram ещё не настроен.')
  const params = new URLSearchParams(String(initData ?? ''))
  const hash = params.get('hash')
  if (!hash) throw new LoginError('Telegram прислал неполные данные.')
  params.delete('hash')
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken)
  const expected = bytesToHex(await hmacSha256(secret, check))
  if (!sameText(expected, hash)) throw new LoginError('Подпись Telegram не сошлась.')
  const authDate = Number(params.get('auth_date'))
  if (!authDate || now / 1000 - authDate > WEBAPP_TTL) {
    throw new LoginError('Данные Telegram устарели. Откройте приложение заново.')
  }
  let user
  try {
    user = JSON.parse(params.get('user') ?? '')
  } catch {
    user = null
  }
  if (!user?.id) throw new LoginError('Telegram не передал пользователя.')
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || ''
  return {
    provider: 'telegram',
    providerId: String(user.id),
    legacyUserId: `tg_${user.id}`,
    name,
  }
}

async function findOrCreateOAuthUser(env, { provider, providerId, legacyUserId, name }) {
  const userId = legacyUserId || `${provider}_${providerId}`
  const link = await env.DB.prepare('SELECT user_id FROM oauth_links WHERE provider = ? AND provider_id = ?')
    .bind(provider, String(providerId))
    .first()
  if (link) {
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first()
    if (!row || !row.status) throw new LoginError('Этот аккаунт заблокирован.')
    return row
  }
  let row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()
  if (row) {
    if (!row.status) throw new LoginError('Этот аккаунт заблокирован.')
    const now = Date.now()
    await env.DB.prepare(
      'INSERT OR IGNORE INTO oauth_links (provider, provider_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(provider, String(providerId), userId, now)
      .run()
    return row
  }
  const now = Date.now()
  const email = `${userId}@oauth.local`
  const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (taken) throw new LoginError('Не удалось создать аккаунт.')
  const displayName = String(name || '').slice(0, 64) || userId
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, labels, prefs, status, email_verified, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, 1, 1, ?, ?)',
  )
    .bind(userId, email, displayName, '[]', '{}', now, now)
    .run()
  await env.DB.prepare('INSERT INTO lists (user_id, data, updated_at) VALUES (?, ?, ?)').bind(userId, '[]', now).run()
  await env.DB.prepare('INSERT INTO oauth_links (provider, provider_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(provider, String(providerId), userId, now)
    .run()
  row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()
  return row
}

async function loginResponse(env, request, row) {
  const token = randomToken()
  const ip = request.headers.get('CF-Connecting-IP') || ''
  await putSession(env, token, row.id, {
    ua: request.headers.get('User-Agent') || '',
    ipHash: ip ? await sha256Hex(ip + (env.IP_HASH_SALT || '')) : null,
  })
  return json({ user: publicUser(row) }, 200, { 'Set-Cookie': cookieOpts(token, SESSION_TTL_S) })
}

const siteUrl = (env) => env.SITE_URL || 'https://animelife.top'
const siteName = (env) => {
  try {
    return new URL(siteUrl(env)).host
  } catch {
    return 'animelife.top'
  }
}

async function bot(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json().catch(() => ({}))
}

const TG_OFFSET_KEY = 'oauth:tg:offset'

/**
 * Cloudflare WAF/Bot Fight режет входящие webhook-запросы Telegram (Go-http-client → 403).
 * Поэтому бот работает через getUpdates: сайт при start/poll забирает апдейты сам.
 */
async function drainTelegramUpdates(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.SESSIONS) return
  const rawOffset = await env.SESSIONS.get(TG_OFFSET_KEY)
  const offset = rawOffset ? Number(rawOffset) : 0
  const data = await bot(env, 'getUpdates', {
    offset: Number.isFinite(offset) && offset > 0 ? offset : undefined,
    timeout: 0,
    allowed_updates: ['message', 'callback_query'],
    limit: 50,
  })
  if (!data?.ok || !Array.isArray(data.result)) return
  let next = offset
  for (const update of data.result) {
    try {
      await telegramUpdate(env, update)
    } catch (e) {
      console.error('telegram update', e)
    }
    if (typeof update.update_id === 'number') next = update.update_id + 1
  }
  if (next > offset) {
    await env.SESSIONS.put(TG_OFFSET_KEY, String(next), { expirationTtl: 60 * 60 * 24 * 30 })
  }
}

async function pendingLogin(env, code) {
  if (!/^[a-f0-9]{24}$/.test(code ?? '')) return null
  const raw = await env.SESSIONS.get(`${PENDING_PREFIX}${code}`)
  if (!raw) return null
  let login
  try {
    login = JSON.parse(raw)
  } catch {
    return null
  }
  if (Date.now() > login.expiresAt) return null
  return login
}

async function telegramStart(env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new LoginError('Вход через Telegram ещё не настроен.')
  // Снимаем webhook, если остался от старого деплоя — иначе getUpdates не работает.
  await bot(env, 'deleteWebhook', { drop_pending_updates: false }).catch(() => undefined)
  await drainTelegramUpdates(env).catch((e) => console.error('telegram drain', e))
  const code = randomId(12)
  const pollKey = randomId(16)
  const expiresAt = Date.now() + LOGIN_TTL_MS
  await env.SESSIONS.put(
    `${PENDING_PREFIX}${code}`,
    JSON.stringify({ status: 'pending', pollHash: await sha256Hex(pollKey), expiresAt }),
    { expirationTtl: LOGIN_TTL_S },
  )
  return {
    code,
    pollKey,
    bot: env.TELEGRAM_BOT_USERNAME || 'AnimeLifeAuth_bot',
    expiresIn: LOGIN_TTL_MS / 1000,
  }
}

async function telegramPoll(env, request, { code, pollKey }) {
  await drainTelegramUpdates(env).catch((e) => console.error('telegram drain', e))
  const login = await pendingLogin(env, code)
  if (!login || !sameText(login.pollHash, await sha256Hex(pollKey ?? ''))) {
    throw new LoginError('Время на вход вышло. Нажмите кнопку Telegram ещё раз.')
  }
  if (login.status === 'pending') return json({ pending: true })
  await env.SESSIONS.delete(`${PENDING_PREFIX}${code}`)
  if (login.status !== 'approved') throw new LoginError('Вход отменён в Telegram.')
  const row = await findOrCreateOAuthUser(env, {
    provider: 'telegram',
    providerId: String(login.tgId),
    legacyUserId: `tg_${login.tgId}`,
    name: login.name ?? '',
  })
  return loginResponse(env, request, row)
}

const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ''

const watchButton = (env, path = '') => ({
  text: '▶️ Смотреть в Telegram',
  web_app: { url: `${siteUrl(env)}${path}` },
})

async function telegramUpdate(env, update) {
  const message = update.message
  if (message?.text?.startsWith('/start')) {
    const code = message.text.split(' ')[1]
    const login = code ? await pendingLogin(env, code) : null
    if (!login || login.status !== 'pending') {
      await bot(env, 'sendMessage', {
        chat_id: message.chat.id,
        text: code
          ? 'Ссылка для входа устарела. Нажмите кнопку Telegram на сайте ещё раз.'
          : `Привет! Здесь можно смотреть аниме с ${siteName(env)} прямо в Telegram: нажмите кнопку ниже. Аккаунт Telegram подключится сам, список и история будут те же, что на сайте.`,
        reply_markup: {
          inline_keyboard: code
            ? [[{ text: `Открыть ${siteName(env)}`, url: `${siteUrl(env)}/account` }]]
            : [[watchButton(env)], [{ text: `Открыть ${siteName(env)} в браузере`, url: siteUrl(env) }]],
        },
      })
      return
    }
    await bot(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: `Войти на ${siteName(env)} как ${fullName(message.from)}?\n\nПодтверждайте, только если вы сами нажали кнопку входа на сайте.`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Подтвердить', callback_data: `ok:${code}` },
            { text: 'Отмена', callback_data: `no:${code}` },
          ],
        ],
      },
    })
    return
  }

  const query = update.callback_query
  if (!query?.data) return
  const [action, code] = query.data.split(':')
  const login = await pendingLogin(env, code)
  let text
  if (!login || login.status !== 'pending') {
    text = 'Ссылка для входа устарела. Нажмите кнопку Telegram на сайте ещё раз.'
  } else if (action === 'ok') {
    const next = {
      ...login,
      status: 'approved',
      tgId: String(query.from.id),
      name: fullName(query.from),
    }
    const ttl = Math.max(60, Math.ceil((next.expiresAt - Date.now()) / 1000))
    await env.SESSIONS.put(`${PENDING_PREFIX}${code}`, JSON.stringify(next), { expirationTtl: ttl })
    text = `✅ Вход подтверждён. Вернитесь на ${siteName(env)}.`
  } else {
    const next = { ...login, status: 'denied' }
    const ttl = Math.max(60, Math.ceil((next.expiresAt - Date.now()) / 1000))
    await env.SESSIONS.put(`${PENDING_PREFIX}${code}`, JSON.stringify(next), { expirationTtl: ttl })
    text = 'Вход отменён.'
  }
  await bot(env, 'answerCallbackQuery', { callback_query_id: query.id })
  if (query.message) {
    await bot(env, 'editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text,
      reply_markup:
        action === 'ok' && login
          ? { inline_keyboard: [[{ text: `Открыть ${siteName(env)}`, url: `${siteUrl(env)}/account` }]] }
          : undefined,
    })
  }
}

function stubProvider(provider, env) {
  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return err(
        'Вход через Google на Core ещё не настроен (нужны GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на Worker).',
        501,
        501,
      )
    }
    return err('Вход через Google на Core в разработке.', 501, 501)
  }
  if (provider === 'yandex') {
    if (!env.YANDEX_CLIENT_ID || !env.YANDEX_CLIENT_SECRET) {
      return err(
        'Вход через Яндекс на Core ещё не настроен (нужны YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET на Worker).',
        501,
        501,
      )
    }
    return err('Вход через Яндекс на Core в разработке.', 501, 501)
  }
  return null
}

export async function handleOAuth(request, env, path) {
  const method = request.method.toUpperCase()

  if (path === '/auth/oauth/telegram/webhook' && method === 'POST') {
    const expected = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim()
    const got = String(request.headers.get('x-telegram-bot-api-secret-token') || '').trim()
    // Если секрет задан — Telegram обязан прислать тот же X-Telegram-Bot-Api-Secret-Token.
    // Без секрета на Worker принимаем апдейты (удобно при переносе вебхука), иначе 403 и бот молчит.
    if (expected && !sameText(got, expected)) {
      return err('forbidden', 403)
    }
    const body = await bodyJson(request)
    try {
      await telegramUpdate(env, body || {})
    } catch (e) {
      console.error('telegram webhook', e)
    }
    return json({ ok: true })
  }

  if (path !== '/auth/oauth' || method !== 'POST') {
    return err('Not found', 404)
  }

  const body = await bodyJson(request)
  if (!body || typeof body !== 'object') return err('Неверный запрос.', 400)

  try {
    if (body.provider === 'google' || body.provider === 'yandex') {
      const stub = stubProvider(body.provider, env)
      if (stub) return stub
    }

    if (body.provider === 'vk') {
      const identity = await verifyVk(body, env.VK_APP_ID || env.VITE_VK_APP_ID)
      const row = await findOrCreateOAuthUser(env, identity)
      return loginResponse(env, request, row)
    }

    if (body.provider === 'telegram-start') {
      return json(await telegramStart(env))
    }

    if (body.provider === 'telegram-poll') {
      return telegramPoll(env, request, body)
    }

    if (body.provider === 'telegram-webapp') {
      const identity = await verifyWebAppData(body.initData, env.TELEGRAM_BOT_TOKEN)
      const row = await findOrCreateOAuthUser(env, identity)
      return loginResponse(env, request, row)
    }

    return err('Неизвестный способ входа.', 400)
  } catch (e) {
    if (e instanceof LoginError) return err(e.message, 400)
    console.error('handleOAuth', e)
    return err('Сервер входа не справился, попробуйте ещё раз.', 500)
  }
}

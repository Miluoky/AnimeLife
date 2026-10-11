import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Вход через VK ID и бота Telegram. У Appwrite нет готовых провайдеров для них, поэтому функция
 * сама проверяет вход, находит или создаёт пользователя и выдаёт одноразовый токен.
 * Браузер обменивает токен на обычную сессию: account.createSession({ userId, secret }).
 *
 * Вход через Telegram устроен как у других ботов:
 *   1. сайт просит код (telegram-start) и показывает ссылку t.me/<бот>?start=<код>;
 *   2. бот получает /start <код> через вебхук и спрашивает «Подтвердить вход?»;
 *   3. после нажатия «Подтвердить» сайт, который опрашивает функцию (telegram-poll), получает токен.
 * Пока вход не завершён, его состояние лежит во временном заблокированном пользователе tgl_<код>.
 *
 * Внутри Telegram Mini App (кнопка «Смотреть» у бота) вход без кнопок: сайт присылает данные запуска
 * (telegram-webapp, initData), функция проверяет их подпись токеном бота и выдаёт токен для того же tg_<id>.
 *
 * Переменные функции: VK_APP_ID, TELEGRAM_BOT_TOKEN (секрет), TELEGRAM_WEBHOOK_SECRET (секрет),
 * TELEGRAM_BOT_USERNAME, SITE_URL. Ключ Appwrite не хранится: функция получает временный ключ
 * в заголовке x-appwrite-key.
 */

const LOGIN_TTL = 5 * 60 * 1000
const PENDING_PREFIX = 'tgl_'

class LoginError extends Error {}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

function sameText(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

async function form(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new LoginError(`VK ID: ${json.error_description || json.error || res.status}`)
  return json
}

/** Обмен кода VK ID на данные пользователя: https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-integration/api-description */
async function verifyVk(body, appId) {
  if (!appId) throw new LoginError('Вход через VK ещё не настроен.')
  const { code, codeVerifier, deviceId, redirectUri, state } = body
  if (!code || !codeVerifier || !deviceId || !redirectUri) throw new LoginError('VK прислал неполные данные.')
  const tokens = await form('https://id.vk.com/oauth2/auth', {
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    device_id: deviceId,
    redirect_uri: redirectUri,
    client_id: appId,
    state: state ?? '',
  })
  const info = await form('https://id.vk.com/oauth2/user_info', { client_id: appId, access_token: tokens.access_token })
  const user = info.user ?? {}
  const id = user.user_id ?? tokens.user_id
  if (!id) throw new LoginError('VK не вернул пользователя.')
  return { userId: `vk_${id}`, name: [user.first_name, user.last_name].filter(Boolean).join(' ') }
}

function appwrite(req) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
    'X-Appwrite-Key': req.headers['x-appwrite-key'],
  }
  return async (method, path, body) => {
    const res = await fetch(endpoint + path, { method, headers, body: body && JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (res.status >= 300 && res.status !== 404) throw new Error(`${method} ${path}: ${json.message ?? res.status}`)
    return { status: res.status, json }
  }
}

/** Находит пользователя по ID сервиса или создаёт нового и выдаёт токен на минуту. */
async function issueToken(api, { userId, name }) {
  const found = await api('GET', `/users/${userId}`)
  if (found.status === 404) {
    await api('POST', '/users', { userId, name: name.slice(0, 128) || undefined })
  } else if (found.json.status === false) {
    throw new LoginError('Этот аккаунт заблокирован.')
  }
  const token = await api('POST', `/users/${userId}/tokens`, { expire: 60 })
  return { userId, secret: token.json.secret }
}

// --- Telegram: бот ---

async function bot(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json().catch(() => ({}))
}

const siteUrl = () => process.env.SITE_URL || 'https://animelife.top'
const siteName = () => new URL(siteUrl()).host

async function pendingLogin(api, code) {
  if (!/^[a-f0-9]{24}$/.test(code ?? '')) return null
  const found = await api('GET', `/users/${PENDING_PREFIX}${code}`)
  if (found.status === 404) return null
  const prefs = found.json.prefs ?? {}
  if (Date.now() > prefs.expiresAt) return null
  return prefs
}

/** Убираем незавершённые входы старше срока жизни. */
async function cleanupPending(api) {
  const queries = [
    JSON.stringify({ method: 'startsWith', attribute: '$id', values: [PENDING_PREFIX] }),
    JSON.stringify({ method: 'lessThan', attribute: '$createdAt', values: [new Date(Date.now() - LOGIN_TTL).toISOString()] }),
    JSON.stringify({ method: 'limit', values: [25] }),
  ]
  const list = await api('GET', `/users?${queries.map((q) => `queries[]=${encodeURIComponent(q)}`).join('&')}`)
  await Promise.all((list.json.users ?? []).map((u) => api('DELETE', `/users/${u.$id}`)))
}

async function telegramStart(api) {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new LoginError('Вход через Telegram ещё не настроен.')
  await cleanupPending(api).catch(() => undefined)
  const code = randomBytes(12).toString('hex')
  const pollKey = randomBytes(16).toString('hex')
  const userId = PENDING_PREFIX + code
  await api('POST', '/users', { userId, name: 'Вход через Telegram' })
  await api('PATCH', `/users/${userId}/status`, { status: false })
  await api('PATCH', `/users/${userId}/prefs`, {
    prefs: { status: 'pending', pollHash: sha256(pollKey), expiresAt: Date.now() + LOGIN_TTL },
  })
  return { code, pollKey, bot: process.env.TELEGRAM_BOT_USERNAME, expiresIn: LOGIN_TTL / 1000 }
}

async function telegramPoll(api, { code, pollKey }) {
  const login = await pendingLogin(api, code)
  if (!login || !sameText(login.pollHash, sha256(pollKey ?? ''))) {
    throw new LoginError('Время на вход вышло. Нажмите кнопку Telegram ещё раз.')
  }
  if (login.status === 'pending') return { pending: true }
  await api('DELETE', `/users/${PENDING_PREFIX}${code}`)
  if (login.status !== 'approved') throw new LoginError('Вход отменён в Telegram.')
  return issueToken(api, { userId: `tg_${login.tgId}`, name: login.name ?? '' })
}

// --- Telegram Mini App ---

const WEBAPP_TTL = 24 * 3600

/** Проверка данных запуска Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export function verifyWebAppData(initData, botToken, now = Date.now()) {
  if (!botToken) throw new LoginError('Вход через Telegram ещё не настроен.')
  const params = new URLSearchParams(String(initData ?? ''))
  const hash = params.get('hash')
  if (!hash) throw new LoginError('Telegram прислал неполные данные.')
  params.delete('hash')
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest('hex')
  if (!sameText(expected, hash)) throw new LoginError('Подпись Telegram не сошлась.')
  const authDate = Number(params.get('auth_date'))
  if (!authDate || now / 1000 - authDate > WEBAPP_TTL) throw new LoginError('Данные Telegram устарели. Откройте приложение заново.')
  let user
  try {
    user = JSON.parse(params.get('user') ?? '')
  } catch {
    user = null
  }
  if (!user?.id) throw new LoginError('Telegram не передал пользователя.')
  return { userId: `tg_${user.id}`, name: fullName(user) }
}

/** Кнопка, которая открывает сайт внутри Telegram (работает в личном чате с ботом). */
const watchButton = (path = '') => ({ text: '▶️ Смотреть в Telegram', web_app: { url: `${siteUrl()}${path}` } })

const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ''

async function telegramUpdate(api, update) {
  const message = update.message
  if (message?.text?.startsWith('/start')) {
    const code = message.text.split(' ')[1]
    const login = code ? await pendingLogin(api, code) : null
    if (!login || login.status !== 'pending') {
      await bot('sendMessage', {
        chat_id: message.chat.id,
        text: code
          ? 'Ссылка для входа устарела. Нажмите кнопку Telegram на сайте ещё раз.'
          : `Привет! Здесь можно смотреть аниме с ${siteName()} прямо в Telegram: нажмите кнопку ниже. Аккаунт Telegram подключится сам, список и история будут те же, что на сайте.`,
        reply_markup: {
          inline_keyboard: code
            ? [[{ text: `Открыть ${siteName()}`, url: `${siteUrl()}/account` }]]
            : [[watchButton()], [{ text: `Открыть ${siteName()} в браузере`, url: siteUrl() }]],
        },
      })
      return
    }
    await bot('sendMessage', {
      chat_id: message.chat.id,
      text: `Войти на ${siteName()} как ${fullName(message.from)}?\n\nПодтверждайте, только если вы сами нажали кнопку входа на сайте.`,
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
  const login = await pendingLogin(api, code)
  let text
  if (!login || login.status !== 'pending') {
    text = 'Ссылка для входа устарела. Нажмите кнопку Telegram на сайте ещё раз.'
  } else if (action === 'ok') {
    await api('PATCH', `/users/${PENDING_PREFIX}${code}/prefs`, {
      prefs: { ...login, status: 'approved', tgId: String(query.from.id), name: fullName(query.from) },
    })
    text = `✅ Вход подтверждён. Вернитесь на ${siteName()}.`
  } else {
    await api('PATCH', `/users/${PENDING_PREFIX}${code}/prefs`, { prefs: { ...login, status: 'denied' } })
    text = 'Вход отменён.'
  }
  await bot('answerCallbackQuery', { callback_query_id: query.id })
  if (query.message) {
    await bot('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text,
      reply_markup: action === 'ok' && login ? { inline_keyboard: [[{ text: `Открыть ${siteName()}`, url: `${siteUrl()}/account` }]] } : undefined,
    })
  }
}

export default async ({ req, res, error }) => {
  if (req.method !== 'POST') return res.json({ error: 'Нужен POST.' }, 405)
  let body = req.bodyJson
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.bodyText || '{}')
    } catch {
      return res.json({ error: 'Неверный запрос.' }, 400)
    }
  }
  const api = appwrite(req)

  // Вебхук Telegram: проверяем секрет, который задали в setWebhook.
  const hookSecret = req.headers['x-telegram-bot-api-secret-token']
  if (hookSecret !== undefined) {
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || !sameText(hookSecret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
      return res.json({ error: 'forbidden' }, 403)
    }
    try {
      await telegramUpdate(api, body)
    } catch (e) {
      error(String(e))
    }
    return res.json({ ok: true })
  }

  try {
    if (body.provider === 'vk') return res.json(await issueToken(api, await verifyVk(body, process.env.VK_APP_ID)))
    if (body.provider === 'telegram-start') return res.json(await telegramStart(api))
    if (body.provider === 'telegram-poll') return res.json(await telegramPoll(api, body))
    if (body.provider === 'telegram-webapp') {
      return res.json(await issueToken(api, verifyWebAppData(body.initData, process.env.TELEGRAM_BOT_TOKEN)))
    }
    return res.json({ error: 'Неизвестный способ входа.' }, 400)
  } catch (e) {
    if (e instanceof LoginError) return res.json({ error: e.message }, 400)
    error(String(e))
    return res.json({ error: 'Сервер входа не справился, попробуйте ещё раз.' }, 500)
  }
}

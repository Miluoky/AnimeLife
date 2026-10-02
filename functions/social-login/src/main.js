import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Вход через VK ID и Telegram. У Appwrite нет готовых провайдеров для них, поэтому функция
 * сама проверяет ответ сервиса, находит или создаёт пользователя и выдаёт одноразовый токен.
 * Браузер обменивает токен на обычную сессию: account.createSession({ userId, secret }).
 *
 * Переменные функции: VK_APP_ID (ID приложения VK ID) и TELEGRAM_BOT_TOKEN (токен бота).
 * Ключ Appwrite не хранится: функция получает временный ключ в заголовке x-appwrite-key.
 */

const TELEGRAM_MAX_AGE = 24 * 3600

class LoginError extends Error {}

/** Проверка подписи Telegram Login: https://core.telegram.org/widgets/login#checking-authorization */
export function verifyTelegram(data, botToken, now = Date.now() / 1000) {
  if (!botToken) throw new LoginError('Вход через Telegram ещё не настроен.')
  const { hash, ...fields } = data ?? {}
  if (typeof hash !== 'string' || !fields.id || !fields.auth_date) throw new LoginError('Telegram прислал неполные данные.')
  const check = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest()
  const got = Buffer.from(hash, 'hex')
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new LoginError('Подпись Telegram не сошлась.')
  if (now - Number(fields.auth_date) > TELEGRAM_MAX_AGE) throw new LoginError('Данные Telegram устарели, войдите ещё раз.')
  const name = [fields.first_name, fields.last_name].filter(Boolean).join(' ') || fields.username || ''
  return { userId: `tg_${fields.id}`, name }
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
    return { status: res.status, json }
  }
}

/** Находит пользователя по ID сервиса или создаёт нового и выдаёт токен на минуту. */
async function issueToken(api, { userId, name }) {
  const found = await api('GET', `/users/${userId}`)
  if (found.status === 404) {
    const created = await api('POST', '/users', { userId, name: name.slice(0, 128) || undefined })
    if (created.status >= 300) throw new Error(`users.create: ${created.json.message}`)
  } else if (found.status >= 300) {
    throw new Error(`users.get: ${found.json.message}`)
  } else if (found.json.status === false) {
    throw new LoginError('Этот аккаунт заблокирован.')
  }
  const token = await api('POST', `/users/${userId}/tokens`, { expire: 60 })
  if (token.status >= 300) throw new Error(`users.createToken: ${token.json.message}`)
  return { userId, secret: token.json.secret }
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
  try {
    const who =
      body.provider === 'vk'
        ? await verifyVk(body, process.env.VK_APP_ID)
        : body.provider === 'telegram'
          ? verifyTelegram(body.data, process.env.TELEGRAM_BOT_TOKEN)
          : null
    if (!who) return res.json({ error: 'Неизвестный способ входа.' }, 400)
    return res.json(await issueToken(appwrite(req), who))
  } catch (e) {
    if (e instanceof LoginError) return res.json({ error: e.message }, 400)
    error(String(e))
    return res.json({ error: 'Сервер входа не справился, попробуйте ещё раз.' }, 500)
  }
}

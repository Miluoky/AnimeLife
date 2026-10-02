import { createHash } from 'node:crypto'
import webpush from 'web-push'

/**
 * Отзывы и уведомления о новых сериях.
 *
 * Запросы с сайта (createExecution):
 *   review-save {animeId, text, rating?}  отзыв вошедшего пользователя, один на тайтл;
 *   review-delete {animeId}               удалить свой отзыв;
 *   push-subscribe {subscription, animeIds, site}  подписка браузера на тайтлы из «Смотрю»;
 *   push-unsubscribe {endpoint}.
 * По расписанию (каждые 15 минут) функция смотрит календарь Shikimori и шлёт пуш подписчикам,
 * у которых вышла новая серия.
 *
 * Данные лежат в базе anime (TablesDB): reviews, push, sent. Читать отзывы может кто угодно,
 * а пишет в таблицы только эта функция, поэтому имя автора и его ID подделать нельзя.
 * Переменные: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (секрет), VAPID_SUBJECT.
 */

const DB = '/tablesdb/anime/tables'
const SHIKIMORI = 'https://shikimori.io'
/** Серии, вышедшие раньше, считаем уже старыми: календарь Shikimori иногда долго не обновляется. */
const FRESH_WINDOW = 3 * 60 * 60 * 1000
const MAX_TEXT = 3000
const MIN_TEXT = 20

// Куда разрешено отправлять пуши: только настоящие сервисы браузеров.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/]
// С каких адресов сайта принимаем подписки (туда же ведут ссылки из уведомлений).
const SITES = [
  /^https:\/\/([a-z0-9-]+\.)?anime-night\.pages\.dev\/$/,
  /^https?:\/\/maintech67\.me\/Anime\/$/,
  /^http:\/\/localhost:\d+\/$/,
]

class UserError extends Error {}

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 32)

function appwrite(req) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
    'X-Appwrite-Key': req.headers['x-appwrite-key'],
  }
  return async (method, path, body) => {
    const res = await fetch(process.env.APPWRITE_FUNCTION_API_ENDPOINT + path, {
      method,
      headers,
      body: body && JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (res.status >= 300 && res.status !== 404) throw new Error(`${method} ${path}: ${json.message ?? res.status}`)
    return { status: res.status, json }
  }
}

const query = (q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`

// --- Отзывы ---

async function currentUser(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите, чтобы писать отзывы.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

function checkAnimeId(id) {
  if (!/^\d{1,10}$/.test(String(id ?? ''))) throw new UserError('Неизвестный тайтл.')
  return String(id)
}

async function reviewSave(api, req, body) {
  const user = await currentUser(api, req)
  const animeId = checkAnimeId(body.animeId)
  const text = String(body.text ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (text.length < MIN_TEXT) throw new UserError(`Отзыв слишком короткий: напишите хотя бы ${MIN_TEXT} символов.`)
  if (text.length > MAX_TEXT) throw new UserError(`Отзыв длиннее ${MAX_TEXT} символов.`)
  const rating = body.rating == null || body.rating === '' ? null : Number(body.rating)
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10))
    throw new UserError('Оценка от 1 до 10.')
  const rowId = 'r' + hash(`${animeId}:${user.$id}`)
  const row = await api('PUT', `${DB}/reviews/rows/${rowId}`, {
    data: { animeId, userId: user.$id, userName: (user.name || 'Зритель').slice(0, 128), rating, text },
  })
  return { review: row.json }
}

async function reviewDelete(api, req, body) {
  const user = await currentUser(api, req)
  const animeId = checkAnimeId(body.animeId)
  await api('DELETE', `${DB}/reviews/rows/r${hash(`${animeId}:${user.$id}`)}`)
  return { ok: true }
}

// --- Подписки на уведомления ---

async function pushSubscribe(api, req, body) {
  const sub = body.subscription ?? {}
  let host
  try {
    host = new URL(sub.endpoint).hostname
  } catch {
    throw new UserError('Браузер прислал неверную подписку.')
  }
  if (!sub.endpoint.startsWith('https://') || !PUSH_HOSTS.some((re) => re.test(host))) {
    throw new UserError('Этот браузер не поддерживается.')
  }
  if (!sub.keys?.p256dh || !sub.keys?.auth) throw new UserError('Браузер прислал неверную подписку.')
  const site = String(body.site ?? '')
  if (!SITES.some((re) => re.test(site))) throw new UserError('Неизвестный адрес сайта.')
  const animeIds = [...new Set((body.animeIds ?? []).map(String).filter((id) => /^\d{1,10}$/.test(id)))].slice(0, 200)
  await api('PUT', `${DB}/push/rows/p${hash(sub.endpoint)}`, {
    data: {
      endpoint: sub.endpoint.slice(0, 1000),
      p256dh: String(sub.keys.p256dh).slice(0, 200),
      auth: String(sub.keys.auth).slice(0, 100),
      userId: req.headers['x-appwrite-user-id'] || null,
      animeIds,
      site,
    },
  })
  return { ok: true, count: animeIds.length }
}

async function pushUnsubscribe(api, body) {
  if (typeof body.endpoint !== 'string') throw new UserError('Нет подписки.')
  await api('DELETE', `${DB}/push/rows/p${hash(body.endpoint)}`)
  return { ok: true }
}

// --- Рассылка по расписанию ---

async function freshEpisodes() {
  const res = await fetch(`${SHIKIMORI}/api/calendar`, { headers: { 'User-Agent': 'AnimeLife notifier' } })
  if (!res.ok) throw new Error(`Shikimori calendar ${res.status}`)
  const now = Date.now()
  return (await res.json()).filter((e) => {
    const at = Date.parse(e.next_episode_at)
    return at <= now && at > now - FRESH_WINDOW
  })
}

async function allSubscriptions(api) {
  const out = []
  let cursor
  for (;;) {
    const qs = [query({ method: 'limit', values: [100] })]
    if (cursor) qs.push(query({ method: 'cursorAfter', values: [cursor] }))
    const page = await api('GET', `${DB}/push/rows?${qs.join('&')}`)
    const rows = page.json.rows ?? []
    out.push(...rows)
    if (rows.length < 100) return out
    cursor = rows[rows.length - 1].$id
  }
}

async function notify(api, log) {
  const due = []
  for (const e of await freshEpisodes()) {
    const id = `s${e.anime.id}-${e.next_episode}`
    const seen = await api('GET', `${DB}/sent/rows/${id}`)
    if (seen.status !== 404) continue
    // Сначала отмечаем как отправленное: если запуск упадёт посередине, повторов не будет.
    await api('PUT', `${DB}/sent/rows/${id}`, { data: { count: 0 } })
    due.push(e)
  }
  if (!due.length) return { due: 0, sent: 0 }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@anime-night.pages.dev',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  let sent = 0
  for (const sub of await allSubscriptions(api)) {
    const mine = due.filter((e) => sub.animeIds?.includes(String(e.anime.id)))
    for (const e of mine) {
      const title = e.anime.russian || e.anime.name
      const payload = JSON.stringify({
        title: `Новая серия: ${title}`,
        body: `Вышла ${e.next_episode}-я серия. Тайтл в вашем списке «Смотрю».`,
        url: `${sub.site}anime/${e.anime.id}`,
        tag: `anime-${e.anime.id}`,
      })
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            TTL: 6 * 3600,
          },
        )
        sent++
      } catch (err) {
        // Подписка больше не действует (браузер отписался): удаляем.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await api('DELETE', `${DB}/push/rows/${sub.$id}`)
          break
        }
        log(`push ${err.statusCode ?? ''} ${err.message}`)
      }
    }
  }
  return { due: due.length, sent }
}

export default async ({ req, res, log, error }) => {
  const api = appwrite(req)

  if (req.headers['x-appwrite-trigger'] === 'schedule') {
    try {
      const result = await notify(api, log)
      log(JSON.stringify(result))
      return res.json(result)
    } catch (e) {
      error(String(e))
      return res.json({ error: 'notify failed' }, 500)
    }
  }

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
    switch (body.action) {
      case 'review-save':
        return res.json(await reviewSave(api, req, body))
      case 'review-delete':
        return res.json(await reviewDelete(api, req, body))
      case 'push-subscribe':
        return res.json(await pushSubscribe(api, req, body))
      case 'push-unsubscribe':
        return res.json(await pushUnsubscribe(api, body))
      default:
        return res.json({ error: 'Неизвестное действие.' }, 400)
    }
  } catch (e) {
    if (e instanceof UserError) return res.json({ error: e.message }, 400)
    error(String(e))
    return res.json({ error: 'Сервер не справился, попробуйте ещё раз.' }, 500)
  }
}

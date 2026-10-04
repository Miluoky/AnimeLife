import webpush from 'web-push'
import { DB, UserError, checkCaptcha, hash, query } from './util.js'
import {
  cleanRooms,
  roomClose,
  roomControl,
  roomCreate,
  roomMessage,
  roomMessageDelete,
  roomPresence,
  roomSignal,
} from './rooms.js'
import { commentDelete, commentSave, listInit, profileHide, profileSave } from './profile.js'
import { takedownCreate, takedownList, takedownStatus } from './takedowns.js'

/**
 * Отзывы и уведомления о новых сериях.
 *
 * Запросы с сайта (createExecution):
 *   review-save {animeId, text, rating?}  отзыв вошедшего пользователя, один на тайтл;
 *   review-delete {animeId}               удалить свой отзыв;
 *   review-like {reviewId}                поставить или снять «Полезно»;
 *   review-report {reviewId}              пожаловаться (после REPORTS_TO_HIDE жалоб отзыв скрывается);
 *   review-my-votes {animeId}             что пользователь уже отметил на странице тайтла;
 *   mod-list, mod-action {reviewId, decision: hide|show|delete}  только для админов (метка admin в Appwrite);
 *   push-subscribe {subscription, animeIds, site}  подписка браузера на тайтлы из «Смотрю»;
 *   push-unsubscribe {endpoint};
 *   room-* совместный просмотр, см. rooms.js;
 *   list-init, profile-*, comment-*  список, открытый профиль и обсуждение серий, см. profile.js;
 *   takedown-*  жалобы правообладателей и обратная связь (без входа), для админов — список и статус, см. takedowns.js.
 * По расписанию (каждые 15 минут) функция смотрит календарь Shikimori и шлёт пуш подписчикам,
 * у которых вышла новая серия.
 *
 * Данные лежат в базе anime (TablesDB): reviews, votes, push, sent, takedowns. Читать отзывы может кто угодно,
 * а пишет в таблицы только эта функция, поэтому имя автора и его ID подделать нельзя.
 * Переменные: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (секрет), VAPID_SUBJECT,
 * TURNSTILE_SECRET (секрет, необязательно: с ним отзывы, жалобы и обращения проверяются капчей Cloudflare),
 * IP_HASH_SALT (секрет, необязательно: соль для хеша IP в обращениях).
 */

const SHIKIMORI = 'https://shikimori.io'
/** Серии, вышедшие раньше, считаем уже старыми: календарь Shikimori иногда долго не обновляется. */
const FRESH_WINDOW = 3 * 60 * 60 * 1000
const MAX_TEXT = 3000
const MIN_TEXT = 20
/** Столько жалоб от разных людей, и отзыв прячется до решения модератора. */
const REPORTS_TO_HIDE = 3
/** Не больше стольких новых отзывов от одного человека за час: защита от спама. */
const REVIEWS_PER_HOUR = 5

// Куда разрешено отправлять пуши: только настоящие сервисы браузеров.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/]
// С каких адресов сайта принимаем подписки (туда же ведут ссылки из уведомлений).
const SITES = [
  /^https:\/\/([a-z0-9-]+\.)?anime-night\.pages\.dev\/$/,
  /^https?:\/\/maintech67\.me\/Anime\/$/,
  /^https:\/\/(www\.)?animelife\.top\/$/,
  /^https:\/\/anime\.artemdrr61f9\.workers\.dev\/$/,
  /^http:\/\/localhost:\d+\/$/,
]

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

const reviewRowId = (animeId, userId) => 'r' + hash(`${animeId}:${userId}`)
const voteRowId = (reviewId, userId, kind) => 'v' + hash(`${reviewId}:${userId}:${kind}`)

async function getReview(api, reviewId) {
  if (!/^r[a-f0-9]{32}$/.test(String(reviewId ?? ''))) throw new UserError('Отзыв не найден.')
  const row = await api('GET', `${DB}/reviews/rows/${reviewId}`)
  if (row.status === 404) throw new UserError('Отзыв не найден.')
  return row.json
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
  const rowId = reviewRowId(animeId, user.$id)
  const prev = await api('GET', `${DB}/reviews/rows/${rowId}`)
  if (prev.status === 404) {
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
    const recent = await api(
      'GET',
      `${DB}/reviews/rows?${[
        query({ method: 'equal', attribute: 'userId', values: [user.$id] }),
        query({ method: 'greaterThan', attribute: '$createdAt', values: [hourAgo] }),
        query({ method: 'limit', values: [REVIEWS_PER_HOUR] }),
      ].join('&')}`,
    )
    if ((recent.json.rows ?? []).length >= REVIEWS_PER_HOUR) {
      throw new UserError('Слишком много отзывов подряд. Попробуйте через час.')
    }
  }
  await checkCaptcha(req, body.captcha)
  // Лайки, жалобы и решение модератора при правке текста сохраняются.
  const keep = prev.status === 404 ? {} : prev.json
  const row = await api('PUT', `${DB}/reviews/rows/${rowId}`, {
    data: {
      animeId,
      userId: user.$id,
      userName: (user.name || 'Зритель').slice(0, 128),
      rating,
      text,
      likes: keep.likes ?? 0,
      reports: keep.reports ?? 0,
      hidden: keep.hidden ?? false,
    },
  })
  return { review: row.json }
}

async function deleteVotes(api, reviewId) {
  for (;;) {
    const page = await api(
      'GET',
      `${DB}/votes/rows?${[query({ method: 'equal', attribute: 'reviewId', values: [reviewId] }), query({ method: 'limit', values: [100] })].join('&')}`,
    )
    const rows = page.json.rows ?? []
    await Promise.all(rows.map((r) => api('DELETE', `${DB}/votes/rows/${r.$id}`)))
    if (rows.length < 100) return
  }
}

async function reviewDelete(api, req, body) {
  const user = await currentUser(api, req)
  const animeId = checkAnimeId(body.animeId)
  const rowId = reviewRowId(animeId, user.$id)
  await api('DELETE', `${DB}/reviews/rows/${rowId}`)
  await deleteVotes(api, rowId)
  return { ok: true }
}

async function countVotes(api, reviewId, kind) {
  const res = await api(
    'GET',
    `${DB}/votes/rows?${[
      query({ method: 'equal', attribute: 'reviewId', values: [reviewId] }),
      query({ method: 'equal', attribute: 'kind', values: [kind] }),
      query({ method: 'limit', values: [1] }),
    ].join('&')}`,
  )
  return res.json.total ?? 0
}

async function reviewLike(api, req, body) {
  const user = await currentUser(api, req)
  const review = await getReview(api, body.reviewId)
  if (review.userId === user.$id) throw new UserError('Свой отзыв отметить нельзя.')
  const voteId = voteRowId(review.$id, user.$id, 'like')
  const existing = await api('GET', `${DB}/votes/rows/${voteId}`)
  const liked = existing.status === 404
  if (liked) {
    await api('PUT', `${DB}/votes/rows/${voteId}`, {
      data: { reviewId: review.$id, animeId: review.animeId, userId: user.$id, kind: 'like' },
    })
  } else {
    await api('DELETE', `${DB}/votes/rows/${voteId}`)
  }
  // Пересчитываем, а не прибавляем: так счётчик не собьётся от одновременных нажатий.
  const likes = await countVotes(api, review.$id, 'like')
  await api('PATCH', `${DB}/reviews/rows/${review.$id}`, { data: { likes } })
  return { liked, likes }
}

async function reviewReport(api, req, body) {
  const user = await currentUser(api, req)
  const review = await getReview(api, body.reviewId)
  if (review.userId === user.$id) throw new UserError('На свой отзыв жаловаться нельзя.')
  const voteId = voteRowId(review.$id, user.$id, 'report')
  const existing = await api('GET', `${DB}/votes/rows/${voteId}`)
  if (existing.status !== 404) return { ok: true, already: true }
  await checkCaptcha(req, body.captcha)
  await api('PUT', `${DB}/votes/rows/${voteId}`, {
    data: { reviewId: review.$id, animeId: review.animeId, userId: user.$id, kind: 'report' },
  })
  const reports = await countVotes(api, review.$id, 'report')
  // Модератор уже оставил отзыв (moderated): повторные жалобы его снова не прячут.
  const hidden = review.hidden || (!review.moderated && reports >= REPORTS_TO_HIDE)
  await api('PATCH', `${DB}/reviews/rows/${review.$id}`, { data: { reports, hidden } })
  return { ok: true, hidden }
}

async function myVotes(api, req, body) {
  const user = await currentUser(api, req)
  const animeId = checkAnimeId(body.animeId)
  const res = await api(
    'GET',
    `${DB}/votes/rows?${[
      query({ method: 'equal', attribute: 'animeId', values: [animeId] }),
      query({ method: 'equal', attribute: 'userId', values: [user.$id] }),
      query({ method: 'limit', values: [200] }),
    ].join('&')}`,
  )
  const rows = res.json.rows ?? []
  return {
    liked: rows.filter((r) => r.kind === 'like').map((r) => r.reviewId),
    reported: rows.filter((r) => r.kind === 'report').map((r) => r.reviewId),
  }
}

// --- Модерация ---

async function currentAdmin(api, req) {
  const user = await currentUser(api, req)
  if (!(user.labels ?? []).includes('admin')) throw new UserError('Нужны права модератора.')
  return user
}

async function modList(api, req) {
  await currentAdmin(api, req)
  const res = await api(
    'GET',
    `${DB}/reviews/rows?${[
      query({
        method: 'or',
        values: [
          { method: 'greaterThan', attribute: 'reports', values: [0] },
          { method: 'equal', attribute: 'hidden', values: [true] },
        ],
      }),
      query({ method: 'orderDesc', attribute: 'reports' }),
      query({ method: 'limit', values: [100] }),
    ].join('&')}`,
  )
  return { reviews: res.json.rows ?? [] }
}

async function modAction(api, req, body) {
  await currentAdmin(api, req)
  const review = await getReview(api, body.reviewId)
  if (body.decision === 'delete') {
    await api('DELETE', `${DB}/reviews/rows/${review.$id}`)
    await deleteVotes(api, review.$id)
    return { ok: true }
  }
  if (body.decision !== 'hide' && body.decision !== 'show') throw new UserError('Неизвестное действие модератора.')
  const row = await api('PATCH', `${DB}/reviews/rows/${review.$id}`, {
    data: { hidden: body.decision === 'hide', moderated: true },
  })
  return { review: row.json }
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
    process.env.VAPID_SUBJECT || 'mailto:noreply@animelife.top',
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
      const result = { ...(await notify(api, log)), cleaned: await cleanRooms(api) }
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
      case 'review-like':
        return res.json(await reviewLike(api, req, body))
      case 'review-report':
        return res.json(await reviewReport(api, req, body))
      case 'review-my-votes':
        return res.json(await myVotes(api, req, body))
      case 'mod-list':
        return res.json(await modList(api, req))
      case 'mod-action':
        return res.json(await modAction(api, req, body))
      case 'push-subscribe':
        return res.json(await pushSubscribe(api, req, body))
      case 'room-create':
        return res.json(await roomCreate(api, req, body))
      case 'room-control':
        return res.json(await roomControl(api, req, body))
      case 'room-message':
        return res.json(await roomMessage(api, req, body))
      case 'room-close':
        return res.json(await roomClose(api, req, body))
      case 'room-message-delete':
        return res.json(await roomMessageDelete(api, req, body))
      case 'room-presence':
        return res.json(await roomPresence(api, req, body))
      case 'room-signal':
        return res.json(await roomSignal(api, req, body))
      case 'profile-save':
        return res.json(await profileSave(api, req, body))
      case 'profile-hide':
        return res.json(await profileHide(api, req))
      case 'comment-save':
        return res.json(await commentSave(api, req, body))
      case 'comment-delete':
        return res.json(await commentDelete(api, req, body))
      case 'list-init':
        return res.json(await listInit(api, req))
      case 'room-time':
        return res.json({ serverNow: Date.now() })
      case 'push-unsubscribe':
        return res.json(await pushUnsubscribe(api, body))
      case 'takedown-create':
        return res.json(await takedownCreate(api, req, body))
      case 'takedown-list':
        return res.json(await takedownList(api, req, body))
      case 'takedown-status':
        return res.json(await takedownStatus(api, req, body))
      default:
        return res.json({ error: 'Неизвестное действие.' }, 400)
    }
  } catch (e) {
    if (e instanceof UserError) return res.json({ error: e.message }, 400)
    error(String(e))
    return res.json({ error: 'Сервер не справился, попробуйте ещё раз.' }, 500)
  }
}

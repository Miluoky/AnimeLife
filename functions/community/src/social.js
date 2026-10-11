import { DB, UserError, hash, listRows, query } from './util.js'
import { notify } from './notifications.js'

/**
 * Социальная часть: подписки на людей и лента, подборки зрителей, клубы, оценки серий, синхронизация с Shikimori.
 * Все таблицы читаются сайтом напрямую (кроме shiki_links и жалоб), а пишет в них только эта функция:
 * автор, его имя и счётчики подделать нельзя.
 *
 *   follow {userId}, unfollow {userId}             подписка на открытый профиль;
 *   activity-add {kind, anime, value}               событие для ленты подписчиков (только с открытым профилем);
 *   ucol-save {id?, title, about, items}            своя подборка (до MAX_COLLECTIONS у человека);
 *   ucol-delete {id}, ucol-like {id}                удалить (автор или модератор), лайк и его снятие;
 *   club-create {title, about}, club-delete {clubId}
 *   club-join {clubId}, club-leave {clubId}
 *   club-post {clubId, text}, club-post-delete {postId}, club-post-report {postId}
 *   episode-rate {animeId, episode, score}          оценка серии от 1 до 5;
 *   shiki-connect {code, redirectUri}, shiki-status, shiki-disconnect, shiki-push {items}
 *                                                   список на Shikimori: вход OAuth и отправка изменений.
 * Переменные для Shikimori: SHIKIMORI_CLIENT_ID, SHIKIMORI_CLIENT_SECRET (секрет).
 */

const MAX_COLLECTIONS = 20
const MAX_COLLECTION_ITEMS = 100
const MAX_CLUBS_PER_USER = 3
const POSTS_PER_MINUTE = 5
const ACTIVITY_PER_10MIN = 40
const REPORTS_TO_HIDE = 3
const MAX_FOLLOWS = 1000

const ID = /^[a-zA-Z0-9._-]{1,36}$/
const ANIME_ID = /^\d{1,10}$/

async function signedIn(api, req, action = 'продолжить') {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError(`Войдите, чтобы ${action}.`)
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

const isAdmin = (user) => (user.labels ?? []).includes('admin')
const nameOf = (user) => (user.name || 'Зритель').slice(0, 64)

function checkId(id, what = 'Запись') {
  const s = String(id ?? '')
  if (!ID.test(s)) throw new UserError(`${what} не найдена.`)
  return s
}

async function getRow(api, table, id, what) {
  const row = await api('GET', `${DB}/${table}/rows/${checkId(id, what)}`)
  if (row.status === 404) throw new UserError(`${what} не найдена.`)
  return row.json
}

async function count(api, table, filters) {
  const res = await api('GET', `${DB}/${table}/rows?${[...filters, { method: 'limit', values: [1] }].map(query).join('&')}`)
  return res.json.total ?? 0
}

const eq = (attribute, value) => ({ method: 'equal', attribute, values: [value] })
const since = (attribute, t) => ({ method: 'greaterThan', attribute, values: [t] })

/** Строка с текстом от пользователя: без лишних пробелов, не длиннее max. */
function text(value, max, min = 1, what = 'Текст') {
  const s = String(value ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (s.length < min) throw new UserError(min > 1 ? `${what}: хотя бы ${min} символа.` : `${what} пустой.`)
  if (s.length > max) throw new UserError(`${what} длиннее ${max} символов.`)
  return s
}

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{1,490}$/.test(u) ? u : '')

// --- Подписки и лента ---

export async function follow(api, req, body) {
  const user = await signedIn(api, req, 'подписываться')
  const target = checkId(body.userId, 'Профиль')
  if (target === user.$id) throw new UserError('На себя подписаться нельзя.')
  if ((await api('GET', `${DB}/profiles/rows/${target}`)).status === 404) throw new UserError('Профиль закрыт.')
  if ((await count(api, 'follows', [eq('followerId', user.$id)])) >= MAX_FOLLOWS) throw new UserError('Слишком много подписок.')
  await api('PUT', `${DB}/follows/rows/f${hash(`${user.$id}:${target}`)}`, {
    data: { followerId: user.$id, followeeId: target, at: Date.now() },
  })
  await notify(api, { userId: target, kind: 'follow', actor: user, link: `/u/${user.$id}`, key: `${user.$id}:${target}` })
  return { ok: true, followers: await count(api, 'follows', [eq('followeeId', target)]) }
}

export async function unfollow(api, req, body) {
  const user = await signedIn(api, req, 'отписываться')
  const target = checkId(body.userId, 'Профиль')
  await api('DELETE', `${DB}/follows/rows/f${hash(`${user.$id}:${target}`)}`)
  return { ok: true, followers: await count(api, 'follows', [eq('followeeId', target)]) }
}

const ACTIVITY_KINDS = ['status', 'rating', 'episode']
const STATUSES = ['watching', 'planned', 'completed', 'on_hold', 'dropped']

export async function activityAdd(api, req, body) {
  const user = await signedIn(api, req)
  // В ленту попадает только тот, кто сам открыл профиль.
  if ((await api('GET', `${DB}/profiles/rows/${user.$id}`)).status === 404) return { ok: true, skipped: true }
  const kind = String(body.kind)
  if (!ACTIVITY_KINDS.includes(kind)) throw new UserError('Неизвестное событие.')
  const anime = body.anime ?? {}
  if (!ANIME_ID.test(String(anime.id ?? ''))) throw new UserError('Неизвестный тайтл.')
  const value = Number(body.value)
  if (kind === 'status' && !STATUSES.includes(body.status)) throw new UserError('Неизвестный статус.')
  if (kind === 'rating' && !(Number.isInteger(value) && value >= 1 && value <= 10)) throw new UserError('Оценка от 1 до 10.')
  if (kind === 'episode' && !(Number.isInteger(value) && value >= 1 && value <= 5000)) throw new UserError('Неверный номер серии.')
  const now = Date.now()
  const recent = await count(api, 'activity', [eq('userId', user.$id), since('at', now - 10 * 60 * 1000)])
  if (recent >= ACTIVITY_PER_10MIN) return { ok: true, skipped: true }
  // Одна строка на тайтл и вид события: новое событие заменяет старое, лента не засоряется.
  await api('PUT', `${DB}/activity/rows/a${hash(`${user.$id}:${anime.id}:${kind}`)}`, {
    data: {
      userId: user.$id,
      name: nameOf(user),
      kind,
      animeId: String(anime.id),
      title: String(anime.title ?? '').slice(0, 200),
      poster: httpsUrl(anime.poster),
      status: kind === 'status' ? body.status : '',
      value: kind === 'status' ? 0 : value,
      at: now,
    },
  })
  return { ok: true }
}

// --- Подборки зрителей ---

function cleanItems(items) {
  if (!Array.isArray(items)) throw new UserError('Неверный список тайтлов.')
  const seen = new Set()
  const out = []
  for (const it of items) {
    const id = String(it?.id ?? '')
    if (!ANIME_ID.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title: String(it.title ?? '').slice(0, 200),
      poster: httpsUrl(it.poster),
      year: Number.isInteger(it.year) ? it.year : undefined,
      kind: typeof it.kind === 'string' ? it.kind.slice(0, 20) : undefined,
      note: typeof it.note === 'string' ? it.note.trim().slice(0, 200) : undefined,
    })
    if (out.length > MAX_COLLECTION_ITEMS) throw new UserError(`В подборке не больше ${MAX_COLLECTION_ITEMS} тайтлов.`)
  }
  return out
}

export async function collectionSave(api, req, body) {
  const user = await signedIn(api, req, 'собирать подборки')
  const title = text(body.title, 80, 3, 'Название')
  const about = text(body.about ?? ' ', 500, 0, 'Описание')
  const items = cleanItems(body.items)
  if (!items.length) throw new UserError('Добавьте хотя бы один тайтл.')
  const now = Date.now()
  const data = {
    ownerId: user.$id,
    ownerName: nameOf(user),
    title,
    about,
    items: JSON.stringify(items),
    count: items.length,
    cover: items[0].poster,
    updatedAt: now,
  }
  if (body.id) {
    const prev = await getRow(api, 'user_collections', body.id, 'Подборка')
    if (prev.ownerId !== user.$id) throw new UserError('Менять подборку может только её автор.')
    const row = await api('PATCH', `${DB}/user_collections/rows/${prev.$id}`, { data })
    return { collection: row.json }
  }
  if ((await count(api, 'user_collections', [eq('ownerId', user.$id)])) >= MAX_COLLECTIONS)
    throw new UserError(`Не больше ${MAX_COLLECTIONS} подборок у одного человека.`)
  const row = await api('POST', `${DB}/user_collections/rows`, {
    rowId: 'unique()',
    data: { ...data, likes: 0, at: now, hidden: false },
  })
  return { collection: row.json }
}

export async function collectionDelete(api, req, body) {
  const user = await signedIn(api, req)
  const prev = await getRow(api, 'user_collections', body.id, 'Подборка')
  if (prev.ownerId !== user.$id && !isAdmin(user)) throw new UserError('Удалить подборку может только её автор.')
  await api('DELETE', `${DB}/user_collections/rows/${prev.$id}`)
  for (;;) {
    const likes = await listRows(api, 'collection_likes', [eq('collectionId', prev.$id), { method: 'limit', values: [100] }])
    await Promise.all(likes.map((r) => api('DELETE', `${DB}/collection_likes/rows/${r.$id}`)))
    if (likes.length < 100) break
  }
  return { ok: true }
}

export async function collectionLike(api, req, body) {
  const user = await signedIn(api, req, 'ставить лайки')
  const col = await getRow(api, 'user_collections', body.id, 'Подборка')
  const likeId = `l${hash(`${col.$id}:${user.$id}`)}`
  const had = (await api('GET', `${DB}/collection_likes/rows/${likeId}`)).status !== 404
  if (had) await api('DELETE', `${DB}/collection_likes/rows/${likeId}`)
  else await api('PUT', `${DB}/collection_likes/rows/${likeId}`, { data: { collectionId: col.$id, userId: user.$id, at: Date.now() } })
  const likes = await count(api, 'collection_likes', [eq('collectionId', col.$id)])
  await api('PATCH', `${DB}/user_collections/rows/${col.$id}`, { data: { likes } })
  if (!had) await notify(api, { userId: col.ownerId, kind: 'ucol-like', actor: user, text: col.title, link: `/c/${col.$id}`, key: `${col.$id}:${user.$id}` })
  return { liked: !had, likes }
}

export async function collectionMyLikes(api, req) {
  const user = await signedIn(api, req)
  const rows = await listRows(api, 'collection_likes', [eq('userId', user.$id), { method: 'limit', values: [500] }])
  return { liked: rows.map((r) => r.collectionId) }
}

// --- Клубы ---

export async function clubCreate(api, req, body) {
  const user = await signedIn(api, req, 'создавать клубы')
  const title = text(body.title, 60, 3, 'Название')
  const about = text(body.about ?? ' ', 500, 0, 'Описание')
  if ((await count(api, 'clubs', [eq('ownerId', user.$id)])) >= MAX_CLUBS_PER_USER && !isAdmin(user))
    throw new UserError(`Не больше ${MAX_CLUBS_PER_USER} клубов у одного человека.`)
  const now = Date.now()
  const row = await api('POST', `${DB}/clubs/rows`, {
    rowId: 'unique()',
    data: { ownerId: user.$id, ownerName: nameOf(user), title, about, members: 1, posts: 0, at: now, lastAt: now },
  })
  await api('PUT', `${DB}/club_members/rows/m${hash(`${row.json.$id}:${user.$id}`)}`, {
    data: { clubId: row.json.$id, userId: user.$id, at: now },
  })
  return { club: row.json }
}

async function deleteWhere(api, table, filters) {
  for (let page = 0; page < 20; page++) {
    const rows = await listRows(api, table, [...filters, { method: 'limit', values: [100] }])
    await Promise.all(rows.map((r) => api('DELETE', `${DB}/${table}/rows/${r.$id}`)))
    if (rows.length < 100) return
  }
}

export async function clubDelete(api, req, body) {
  const user = await signedIn(api, req)
  const club = await getRow(api, 'clubs', body.clubId, 'Клуб')
  if (club.ownerId !== user.$id && !isAdmin(user)) throw new UserError('Удалить клуб может только его создатель.')
  await api('DELETE', `${DB}/clubs/rows/${club.$id}`)
  await deleteWhere(api, 'club_posts', [eq('clubId', club.$id)])
  await deleteWhere(api, 'club_members', [eq('clubId', club.$id)])
  return { ok: true }
}

async function updateMembers(api, clubId) {
  const members = await count(api, 'club_members', [eq('clubId', clubId)])
  await api('PATCH', `${DB}/clubs/rows/${clubId}`, { data: { members } })
  return members
}

export async function clubJoin(api, req, body) {
  const user = await signedIn(api, req, 'вступать в клубы')
  const club = await getRow(api, 'clubs', body.clubId, 'Клуб')
  await api('PUT', `${DB}/club_members/rows/m${hash(`${club.$id}:${user.$id}`)}`, {
    data: { clubId: club.$id, userId: user.$id, at: Date.now() },
  })
  return { ok: true, members: await updateMembers(api, club.$id) }
}

export async function clubLeave(api, req, body) {
  const user = await signedIn(api, req)
  const club = await getRow(api, 'clubs', body.clubId, 'Клуб')
  if (club.ownerId === user.$id) throw new UserError('Создатель не может выйти из своего клуба, только удалить его.')
  await api('DELETE', `${DB}/club_members/rows/m${hash(`${club.$id}:${user.$id}`)}`)
  return { ok: true, members: await updateMembers(api, club.$id) }
}

export async function clubPost(api, req, body) {
  const user = await signedIn(api, req, 'писать в клуб')
  const club = await getRow(api, 'clubs', body.clubId, 'Клуб')
  if ((await api('GET', `${DB}/club_members/rows/m${hash(`${club.$id}:${user.$id}`)}`)).status === 404)
    throw new UserError('Вступите в клуб, чтобы писать.')
  const message = text(body.text, 2000, 2, 'Сообщение')
  const now = Date.now()
  if ((await count(api, 'club_posts', [eq('userId', user.$id), since('at', now - 60_000)])) >= POSTS_PER_MINUTE)
    throw new UserError('Не так быстро: подождите минуту.')
  const row = await api('POST', `${DB}/club_posts/rows`, {
    rowId: 'unique()',
    data: { clubId: club.$id, userId: user.$id, name: nameOf(user), text: message, at: now, hidden: false, reports: 0 },
  })
  const posts = await count(api, 'club_posts', [eq('clubId', club.$id)])
  await api('PATCH', `${DB}/clubs/rows/${club.$id}`, { data: { posts, lastAt: now } })
  return { post: row.json }
}

export async function clubPostDelete(api, req, body) {
  const user = await signedIn(api, req)
  const post = await getRow(api, 'club_posts', body.postId, 'Запись')
  if (post.userId !== user.$id && !isAdmin(user)) {
    const club = await api('GET', `${DB}/clubs/rows/${post.clubId}`)
    if (club.json?.ownerId !== user.$id) throw new UserError('Удалить запись может автор, создатель клуба или модератор.')
  }
  await api('DELETE', `${DB}/club_posts/rows/${post.$id}`)
  await deleteWhere(api, 'social_reports', [eq('targetId', post.$id)])
  return { ok: true }
}

export async function clubPostReport(api, req, body) {
  const user = await signedIn(api, req, 'жаловаться')
  const post = await getRow(api, 'club_posts', body.postId, 'Запись')
  if (post.userId === user.$id) throw new UserError('На свою запись жаловаться нельзя.')
  const reportId = `r${hash(`club:${post.$id}:${user.$id}`)}`
  if ((await api('GET', `${DB}/social_reports/rows/${reportId}`)).status !== 404) return { ok: true, already: true }
  await api('PUT', `${DB}/social_reports/rows/${reportId}`, { data: { targetId: post.$id, userId: user.$id, at: Date.now() } })
  const reports = await count(api, 'social_reports', [eq('targetId', post.$id)])
  const hidden = Boolean(post.hidden || reports >= REPORTS_TO_HIDE)
  await api('PATCH', `${DB}/club_posts/rows/${post.$id}`, { data: { reports, hidden } })
  return { ok: true, hidden }
}

// --- Оценки серий ---

export async function episodeRate(api, req, body) {
  const user = await signedIn(api, req, 'оценивать серии')
  const animeId = String(body.animeId ?? '')
  if (!ANIME_ID.test(animeId)) throw new UserError('Неизвестный тайтл.')
  const episode = Number(body.episode)
  if (!Number.isInteger(episode) || episode < 1 || episode > 5000) throw new UserError('Неверный номер серии.')
  const score = Number(body.score)
  if (!Number.isInteger(score) || score < 0 || score > 5) throw new UserError('Оценка от 1 до 5.')

  const voteId = `e${hash(`${animeId}:${episode}:${user.$id}`)}`
  const sumId = `x${hash(`${animeId}:${episode}`)}`
  const prev = await api('GET', `${DB}/episode_votes/rows/${voteId}`)
  const old = prev.status === 404 ? 0 : prev.json.score
  if (score === 0) {
    if (old) await api('DELETE', `${DB}/episode_votes/rows/${voteId}`)
  } else {
    await api('PUT', `${DB}/episode_votes/rows/${voteId}`, { data: { animeId, episode, userId: user.$id, score, at: Date.now() } })
  }
  const agg = await api('GET', `${DB}/episode_scores/rows/${sumId}`)
  const sum = Math.max(0, (agg.status === 404 ? 0 : agg.json.sum) - old + score)
  const votes = Math.max(0, (agg.status === 404 ? 0 : agg.json.votes) - (old ? 1 : 0) + (score ? 1 : 0))
  const avg = votes ? Math.round((sum / votes) * 100) / 100 : 0
  await api('PUT', `${DB}/episode_scores/rows/${sumId}`, { data: { animeId, episode, sum, votes, avg } })
  return { score, avg, votes }
}

export async function episodeMyRate(api, req, body) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) return { score: 0 }
  const animeId = String(body.animeId ?? '')
  const episode = Number(body.episode)
  if (!ANIME_ID.test(animeId) || !Number.isInteger(episode)) return { score: 0 }
  const row = await api('GET', `${DB}/episode_votes/rows/e${hash(`${animeId}:${episode}:${userId}`)}`)
  return { score: row.status === 404 ? 0 : row.json.score }
}

// --- Shikimori ---

const SHIKIMORI = 'https://shikimori.io'
const SHIKI_UA = 'Anime Life'
const SHIKI_STATUSES = new Set(STATUSES)

async function shikiToken(params) {
  const res = await fetch(`${SHIKIMORI}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': SHIKI_UA },
    body: new URLSearchParams({
      client_id: process.env.SHIKIMORI_CLIENT_ID ?? '',
      client_secret: process.env.SHIKIMORI_CLIENT_SECRET ?? '',
      ...params,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new UserError('Shikimori не подтвердил вход. Попробуйте подключить ещё раз.')
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expiresAt: ((json.created_at ?? Date.now() / 1000) + (json.expires_in ?? 86400)) * 1000,
  }
}

async function shikiApi(token, method, path, body) {
  const res = await fetch(SHIKIMORI + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': SHIKI_UA, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000))
    return shikiApi(token, method, path, body)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new UserError(`Shikimori ответил ошибкой ${res.status}.`)
  return json
}

export async function shikiConnect(api, req, body) {
  const user = await signedIn(api, req, 'подключить Shikimori')
  if (!process.env.SHIKIMORI_CLIENT_ID || !process.env.SHIKIMORI_CLIENT_SECRET)
    throw new UserError('Синхронизация с Shikimori ещё не настроена на сервере.')
  const redirectUri = String(body.redirectUri ?? '')
  if (!/^https:\/\/(www\.)?animelife\.top\/auth\/shikimori$|^http:\/\/localhost:\d+\/auth\/shikimori$/.test(redirectUri))
    throw new UserError('Неизвестный адрес возврата.')
  const token = await shikiToken({ grant_type: 'authorization_code', code: String(body.code ?? ''), redirect_uri: redirectUri })
  const me = await shikiApi(token.access, 'GET', '/api/users/whoami')
  await api('PUT', `${DB}/shiki_links/rows/${user.$id}`, {
    data: { shikiId: me.id, nickname: String(me.nickname ?? '').slice(0, 64), ...token },
  })
  return { nickname: me.nickname }
}

async function shikiLink(api, user) {
  const row = await api('GET', `${DB}/shiki_links/rows/${user.$id}`)
  if (row.status === 404) throw new UserError('Shikimori не подключён.')
  let link = row.json
  if (link.expiresAt < Date.now() + 60_000) {
    const token = await shikiToken({ grant_type: 'refresh_token', refresh_token: link.refresh })
    await api('PATCH', `${DB}/shiki_links/rows/${user.$id}`, { data: token })
    link = { ...link, ...token }
  }
  return link
}

export async function shikiStatus(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) return { connected: false }
  const row = await api('GET', `${DB}/shiki_links/rows/${userId}`)
  return row.status === 404 ? { connected: false } : { connected: true, nickname: row.json.nickname }
}

export async function shikiDisconnect(api, req) {
  const user = await signedIn(api, req)
  await api('DELETE', `${DB}/shiki_links/rows/${user.$id}`)
  return { ok: true }
}

/** Отправить изменения списка на Shikimori: за раз не больше 10 тайтлов, лимит API — 5 запросов в секунду. */
export async function shikiPush(api, req, body) {
  const user = await signedIn(api, req)
  const link = await shikiLink(api, user)
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10)
  const pause = () => new Promise((r) => setTimeout(r, 220))
  let sent = 0
  for (const it of items) {
    const targetId = String(it?.id ?? '')
    if (!ANIME_ID.test(targetId) || !SHIKI_STATUSES.has(it.status)) continue
    const rate = {
      status: it.status,
      episodes: Math.max(0, Math.min(5000, Number(it.episodes) || 0)),
      score: Math.max(0, Math.min(10, Number(it.score) || 0)),
    }
    const found = await shikiApi(link.access, 'GET', `/api/v2/user_rates?user_id=${link.shikiId}&target_id=${targetId}&target_type=Anime`)
    await pause()
    if (found?.[0]?.id) await shikiApi(link.access, 'PATCH', `/api/v2/user_rates/${found[0].id}`, { user_rate: rate })
    else
      await shikiApi(link.access, 'POST', '/api/v2/user_rates', {
        user_rate: { ...rate, user_id: link.shikiId, target_id: Number(targetId), target_type: 'Anime' },
      })
    await pause()
    sent++
  }
  return { sent, nickname: link.nickname }
}

export const socialActions = {
  follow,
  unfollow,
  'activity-add': activityAdd,
  'ucol-save': collectionSave,
  'ucol-delete': collectionDelete,
  'ucol-like': collectionLike,
  'ucol-my-likes': collectionMyLikes,
  'club-create': clubCreate,
  'club-delete': clubDelete,
  'club-join': clubJoin,
  'club-leave': clubLeave,
  'club-post': clubPost,
  'club-post-delete': clubPostDelete,
  'club-post-report': clubPostReport,
  'episode-rate': episodeRate,
  'episode-my-rate': episodeMyRate,
  'shiki-connect': shikiConnect,
  'shiki-status': shikiStatus,
  'shiki-disconnect': shikiDisconnect,
  'shiki-push': shikiPush,
}

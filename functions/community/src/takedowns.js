import { DB, UserError, checkCaptcha, hash, listRows } from './util.js'

/**
 * Обращения с сайта: жалобы правообладателей (/rightholders) и обратная связь (/contacts).
 *
 *   takedown-create {kind: takedown|contact, name, email, links, message, confirm, captcha?, website?}
 *       отправить обращение, вход не нужен. Для жалобы обязательны ссылки на animelife.top и галочка confirm.
 *       website — поле-ловушка: его заполняют только боты, такой запрос молча «принимается» и не сохраняется;
 *   takedown-list {status?: new|done|rejected|all}  список обращений (только админы, метка admin);
 *   takedown-status {takedownId, status: new|done|rejected}  отметить, что сделано (только админы).
 *
 * Таблица takedowns закрыта для сайта, читает и пишет только функция (создаётся setup-takedowns.mjs).
 * Защита от спама: не больше 3 обращений в час с одного IP (хранится только хеш), 5 в сутки на один email
 * и 30 в час на всех.
 */

const KINDS = ['takedown', 'contact']
const STATUSES = ['new', 'done', 'rejected']
const NAME_MAX = 200
const EMAIL_MAX = 254
const LINKS_MAX = 4000
const MESSAGE_MAX = 5000
const MESSAGE_MIN = { takedown: 20, contact: 10 }
const PER_IP_HOUR = 3
const PER_EMAIL_DAY = 5
const ALL_HOUR = 30
const HOUR = 3600 * 1000
// Обычная проверка формы адреса: что-то@домен.зона, без пробелов.
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

const field = (v, max) =>
  String(v ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, max + 1)

/** IP клиента, если Appwrite его передал. В базе остаётся только хеш с солью. */
function ipHash(req) {
  const ip = String(req.headers['x-appwrite-client-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0]
    .trim()
  return ip ? hash(`${process.env.IP_HASH_SALT ?? ''}:${ip}`) : null
}

async function tooMany(api, queries, max) {
  const rows = await listRows(api, 'takedowns', [...queries, { method: 'limit', values: [max] }])
  return rows.length >= max
}

export async function takedownCreate(api, req, body) {
  const kind = KINDS.includes(body.kind) ? body.kind : 'contact'
  // Ловушка для ботов: настоящий человек это поле не видит.
  if (body.website) return { ok: true }
  const name = field(body.name, NAME_MAX)
  const email = field(body.email, EMAIL_MAX).toLowerCase()
  const links = field(body.links, LINKS_MAX)
  const message = field(body.message, MESSAGE_MAX)
  if (name.length < 2) throw new UserError('Укажите имя или название организации.')
  if (name.length > NAME_MAX) throw new UserError(`Имя длиннее ${NAME_MAX} символов.`)
  if (email.length > EMAIL_MAX || !EMAIL.test(email)) throw new UserError('Проверьте адрес электронной почты.')
  if (links.length > LINKS_MAX) throw new UserError(`Ссылки длиннее ${LINKS_MAX} символов: разбейте жалобу на несколько.`)
  if (message.length < MESSAGE_MIN[kind]) throw new UserError(`Опишите подробнее: хотя бы ${MESSAGE_MIN[kind]} символов.`)
  if (message.length > MESSAGE_MAX) throw new UserError(`Текст длиннее ${MESSAGE_MAX} символов.`)
  if (kind === 'takedown') {
    if (!/animelife\.top/i.test(links)) throw new UserError('Добавьте ссылки на страницы animelife.top, о которых жалоба.')
    if (body.confirm !== true) throw new UserError('Подтвердите, что вы правообладатель или его представитель.')
  }

  const now = Date.now()
  const ip = ipHash(req)
  const since = (ms) => ({ method: 'greaterThan', attribute: 'createdAt', values: [now - ms] })
  if (ip && (await tooMany(api, [{ method: 'equal', attribute: 'ipHash', values: [ip] }, since(HOUR)], PER_IP_HOUR))) {
    throw new UserError('Слишком много обращений подряд. Попробуйте через час.')
  }
  if (await tooMany(api, [{ method: 'equal', attribute: 'email', values: [email] }, since(24 * HOUR)], PER_EMAIL_DAY)) {
    throw new UserError('С этого адреса уже много обращений за сутки. Мы ответим на них, подождите немного.')
  }
  if (await tooMany(api, [since(HOUR)], ALL_HOUR)) {
    throw new UserError('Сейчас слишком много обращений. Попробуйте через час.')
  }
  await checkCaptcha(req, body.captcha)

  await api('POST', `${DB}/takedowns/rows`, {
    rowId: 'unique()',
    data: {
      kind,
      name,
      email,
      links,
      message,
      status: 'new',
      createdAt: now,
      ipHash: ip,
      userId: req.headers['x-appwrite-user-id'] || null,
    },
  })
  return { ok: true }
}

async function admin(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Нужны права модератора.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false || !(user.json.labels ?? []).includes('admin')) {
    throw new UserError('Нужны права модератора.')
  }
  return user.json
}

export async function takedownList(api, req, body) {
  await admin(api, req)
  const status = body.status ?? 'new'
  if (status !== 'all' && !STATUSES.includes(status)) throw new UserError('Неизвестный статус.')
  const rows = await listRows(api, 'takedowns', [
    ...(status === 'all' ? [] : [{ method: 'equal', attribute: 'status', values: [status] }]),
    { method: 'orderDesc', attribute: 'createdAt' },
    { method: 'limit', values: [100] },
  ])
  // Хеш IP модератору ни к чему.
  return { takedowns: rows.map(({ ipHash: _, ...row }) => row) }
}

export async function takedownStatus(api, req, body) {
  await admin(api, req)
  if (!/^[a-zA-Z0-9]{1,36}$/.test(String(body.takedownId ?? ''))) throw new UserError('Обращение не найдено.')
  if (!STATUSES.includes(body.status)) throw new UserError('Неизвестный статус.')
  const row = await api('PATCH', `${DB}/takedowns/rows/${body.takedownId}`, { data: { status: body.status } })
  if (row.status === 404) throw new UserError('Обращение не найдено.')
  const { ipHash: _, ...takedown } = row.json
  return { takedown }
}

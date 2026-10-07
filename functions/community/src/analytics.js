import { DB, UserError, hash, query } from './util.js'

const SESSION_RE = /^[a-f0-9-]{20,64}$/i
const PATH_RE = /^\/[a-zA-Z0-9а-яА-ЯёЁ/_?=&.:%-]{0,300}$/

async function requireAdmin(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт администратора.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || !(user.json.labels ?? []).includes('admin')) throw new UserError('Недостаточно прав.')
}

export async function analyticsTrack(api, body) {
  const sessionId = String(body.sessionId ?? '')
  const path = String(body.path ?? '').slice(0, 300)
  if (!SESSION_RE.test(sessionId) || !PATH_RE.test(path)) throw new UserError('Неверные данные посещения.')
  const id = `a${hash(sessionId)}`
  const existing = await api('GET', `${DB}/analytics/rows/${id}`)
  await api('PUT', `${DB}/analytics/rows/${id}`, {
    data: {
      path,
      lastSeen: new Date().toISOString(),
      views: existing.status === 404 ? (body.pageview ? 1 : 0) : Math.min(1_000_000, Number(existing.json.views ?? 0) + (body.pageview ? 1 : 0)),
    },
  })
  return { ok: true }
}

async function countSince(api, attribute, at) {
  const result = await api('GET', `${DB}/analytics/rows?${[
    query({ method: 'greaterThanEqual', attribute, values: [at] }),
    query({ method: 'limit', values: [1] }),
  ].join('&')}`)
  return result.json.total ?? 0
}

export async function analyticsStats(api, req) {
  await requireAdmin(api, req)
  const now = Date.now()
  const since = (ms) => new Date(now - ms).toISOString()
  const [all, online, today, week, month, recent] = await Promise.all([
    api('GET', `${DB}/analytics/rows?${query({ method: 'limit', values: [1] })}`),
    countSince(api, 'lastSeen', since(5 * 60 * 1000)),
    countSince(api, '$createdAt', since(24 * 60 * 60 * 1000)),
    countSince(api, '$createdAt', since(7 * 24 * 60 * 60 * 1000)),
    countSince(api, '$createdAt', since(30 * 24 * 60 * 60 * 1000)),
    api('GET', `${DB}/analytics/rows?${[
      query({ method: 'greaterThanEqual', attribute: 'lastSeen', values: [since(30 * 24 * 60 * 60 * 1000)] }),
      query({ method: 'limit', values: [100] }),
      query({ method: 'orderDesc', attribute: 'lastSeen' }),
    ].join('&')}`),
  ])
  const paths = new Map()
  for (const row of recent.json.rows ?? []) paths.set(row.path, (paths.get(row.path) ?? 0) + Number(row.views ?? 0))
  return {
    online,
    visitors: { today, week, month, all: all.json.total ?? 0 },
    popular: [...paths].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, views]) => ({ path, views })),
    generatedAt: new Date(now).toISOString(),
  }
}
import { DB, UserError, hash, query } from './util.js'

/**
 * Ошибки JavaScript у посетителей (src/data/errors.ts шлёт их без входа, как статистику).
 * Одинаковые ошибки (сообщение + место) сливаются в одну строку со счётчиком: так таблица
 * не растёт от одного сломанного браузера, а администратор видит, что ломается чаще всего.
 * Новых видов ошибок за сутки принимаем не больше MAX_KINDS_PER_DAY — защита от мусора.
 */

const MAX_KINDS_PER_DAY = 200
const DAY = 24 * 60 * 60 * 1000

const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
    .slice(0, max)

async function requireAdmin(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт администратора.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || !(user.json.labels ?? []).includes('admin')) throw new UserError('Недостаточно прав.')
}

export async function errorReport(api, body, now = Date.now()) {
  const message = clean(body.message, 500).trim()
  if (message.length < 3) return { ok: false }
  const source = clean(body.source, 300)
  const id = 'e' + hash(`${message}|${source.replace(/:\d+$/, '')}`).slice(0, 30)
  const existing = await api('GET', `${DB}/client_errors/rows/${id}`)
  const fresh = {
    path: clean(body.path, 300),
    browser: clean(body.browser, 60),
    release: clean(body.release, 40),
    last: now,
  }
  if (existing.status !== 404) {
    await api('PATCH', `${DB}/client_errors/rows/${id}/count/increment`, { value: 1 })
    await api('PATCH', `${DB}/client_errors/rows/${id}`, { data: fresh })
    return { ok: true }
  }
  const today = await api('GET', `${DB}/client_errors/rows?${[{ method: 'greaterThan', attribute: 'first', values: [now - DAY] }, { method: 'limit', values: [1] }].map(query).join('&')}`)
  if ((today.json.total ?? 0) >= MAX_KINDS_PER_DAY) return { ok: false }
  await api('POST', `${DB}/client_errors/rows`, {
    rowId: id,
    data: { ...fresh, message, source, stack: clean(body.stack, 2000), count: 1, first: now },
  })
  return { ok: true }
}

export async function errorList(api, req) {
  await requireAdmin(api, req)
  const res = await api('GET', `${DB}/client_errors/rows?${[{ method: 'orderDesc', attribute: 'last' }, { method: 'limit', values: [50] }].map(query).join('&')}`)
  return { errors: res.json.rows ?? [] }
}

/** Ошибку исправили: убираем строку, а если она повторится, появится заново. */
export async function errorClear(api, req, body) {
  await requireAdmin(api, req)
  if (!/^e[a-f0-9]{30}$/.test(String(body.id ?? ''))) throw new UserError('Ошибка не найдена.')
  await api('DELETE', `${DB}/client_errors/rows/${body.id}`)
  return { ok: true }
}

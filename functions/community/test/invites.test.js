import assert from 'node:assert/strict'
import test from 'node:test'
import { inviteActions } from '../src/invites.js'
import { notificationActions } from '../src/notifications.js'

const day = 86400_000
const iso = (ago) => new Date(Date.now() - ago).toISOString()

/** База в памяти, как в notifications.test.js: equal и limit. */
function fakeDb() {
  const users = {
    host: { $id: 'host', name: 'Мика', registration: iso(90 * day) },
    fresh: { $id: 'fresh', name: 'Рэй', registration: iso(day) },
    other: { $id: 'other', name: 'Аска', registration: iso(2 * day) },
    old: { $id: 'old', name: 'Синдзи', registration: iso(30 * day) },
  }
  const tables = {}
  const table = (name) => (tables[name] ??= new Map())
  const api = async (method, path, body) => {
    if (path.startsWith('/users/')) {
      const u = users[path.split('/')[2]]
      return u ? { status: 200, json: u } : { status: 404, json: {} }
    }
    const m = path.match(/^\/tablesdb\/anime\/tables\/([a-z_]+)\/rows(?:\/([^?]+))?(?:\?(.*))?$/)
    if (!m) throw new Error(`unexpected ${method} ${path}`)
    const [, name, id, qs] = m
    const rows = table(name)
    if (method === 'GET' && !id) {
      const queries = new URLSearchParams(qs).getAll('queries[]').map((q) => JSON.parse(q))
      let found = [...rows.values()]
      for (const q of queries) {
        if (q.method === 'equal') found = found.filter((r) => q.values.includes(r[q.attribute]))
        if (q.method === 'orderDesc') found.sort((a, b) => b[q.attribute] - a[q.attribute])
      }
      const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
      return { status: 200, json: { total: found.length, rows: found.slice(0, limit) } }
    }
    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
    const rowId = method === 'POST' ? body.rowId : id
    const row = { ...(method === 'PATCH' ? rows.get(rowId) : {}), $id: rowId, ...body.data }
    rows.set(rowId, row)
    return { status: 201, json: row }
  }
  return { api, table }
}

const as = (userId) => ({ headers: { 'x-appwrite-user-id': userId } })
const claim = (db, userId, ref) => inviteActions['invite-claim'](db.api, as(userId), { ref })
const stats = (db, userId) => inviteActions['invite-stats'](db.api, as(userId))

test('новый аккаунт по ссылке засчитывается пригласившему один раз', async () => {
  const db = fakeDb()
  assert.deepEqual(await claim(db, 'fresh', 'host'), { ok: true, inviter: 'Мика' })
  assert.equal((await claim(db, 'fresh', 'host')).reason, 'already')
  assert.equal((await claim(db, 'fresh', 'other')).reason, 'already')
  assert.deepEqual(await stats(db, 'host'), { invited: 1, invitedBy: false })
  assert.deepEqual(await stats(db, 'fresh'), { invited: 0, invitedBy: true })
  const bell = await notificationActions['notif-list'](db.api, as('host'))
  assert.equal(bell.items[0].kind, 'invite')
  assert.equal(bell.items[0].actorName, 'Рэй')
})

test('себя, старый аккаунт и несуществующего друга не засчитываем', async () => {
  const db = fakeDb()
  assert.equal((await claim(db, 'fresh', 'fresh')).reason, 'self')
  assert.equal((await claim(db, 'old', 'host')).reason, 'old')
  assert.equal((await claim(db, 'fresh', 'nobody')).reason, 'unknown')
  assert.equal((await claim(db, 'fresh', '../users')).reason, 'bad')
  assert.equal(db.table('invites').size, 0)
  await assert.rejects(() => inviteActions['invite-claim'](db.api, { headers: {} }, { ref: 'host' }), /Войдите/)
})

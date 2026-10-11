import assert from 'node:assert/strict'
import test from 'node:test'
import { errorClear, errorList, errorReport } from '../src/errors.js'

function fakeDb() {
  const rows = new Map()
  const users = { admin: { $id: 'admin', labels: ['admin'] }, u1: { $id: 'u1', labels: [] } }
  const api = async (method, path, body) => {
    if (path.startsWith('/users/')) {
      const u = users[path.split('/')[2]]
      return u ? { status: 200, json: u } : { status: 404, json: {} }
    }
    const inc = path.match(/rows\/([^/]+)\/count\/increment$/)
    if (inc) {
      rows.get(inc[1]).count += body.value
      return { status: 200, json: {} }
    }
    const m = path.match(/client_errors\/rows(?:\/([^?]+))?(?:\?(.*))?$/)
    const [, id, qs] = m
    if (method === 'GET' && !id) {
      const queries = new URLSearchParams(qs).getAll('queries[]').map((q) => JSON.parse(q))
      let found = [...rows.values()]
      for (const q of queries) if (q.method === 'greaterThan') found = found.filter((r) => r[q.attribute] > q.values[0])
      return { status: 200, json: { total: found.length, rows: found.sort((a, b) => b.last - a.last) } }
    }
    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
    if (method === 'POST') return rows.set(body.rowId, { $id: body.rowId, ...body.data }), { status: 201, json: {} }
    if (method === 'PATCH') return rows.set(id, { ...rows.get(id), ...body.data }), { status: 200, json: {} }
    if (method === 'DELETE') return rows.delete(id), { status: 204, json: {} }
  }
  return { api, rows }
}

const as = (userId) => ({ headers: { 'x-appwrite-user-id': userId } })

test('одинаковые ошибки сливаются в одну строку со счётчиком, другая строка у другой ошибки', async () => {
  const db = fakeDb()
  const err = { message: 'TypeError: x is undefined', source: 'https://animelife.top/assets/Player-a.js:1:200', path: '/watch/1/2', browser: 'Chrome 129 / Android' }
  await errorReport(db.api, err, 1000)
  await errorReport(db.api, { ...err, source: 'https://animelife.top/assets/Player-a.js:1:900', path: '/watch/5/1' }, 2000)
  await errorReport(db.api, { ...err, message: 'RangeError: bad' }, 3000)
  assert.equal(db.rows.size, 2)
  const same = [...db.rows.values()].find((r) => r.message === err.message)
  assert.equal(same.count, 2)
  assert.equal(same.first, 1000)
  assert.equal(same.last, 2000)
  assert.equal(same.path, '/watch/5/1')
  // Пустое сообщение не принимаем.
  assert.deepEqual(await errorReport(db.api, { message: '' }), { ok: false })
})

test('список и «исправлено» только для администратора', async () => {
  const db = fakeDb()
  await errorReport(db.api, { message: 'Error: boom' }, 1000)
  await assert.rejects(errorList(db.api, as('u1')), /прав/)
  const { errors } = await errorList(db.api, as('admin'))
  assert.equal(errors.length, 1)
  await assert.rejects(errorClear(db.api, as('u1'), { id: errors[0].$id }), /прав/)
  await errorClear(db.api, as('admin'), { id: errors[0].$id })
  assert.equal(db.rows.size, 0)
})

test('новых видов ошибок за сутки не больше 200', async () => {
  const db = fakeDb()
  for (let i = 0; i < 205; i++) await errorReport(db.api, { message: `Error: n${i}` }, 10_000 + i)
  assert.equal(db.rows.size, 200)
})

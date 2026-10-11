import assert from 'node:assert/strict'
import test from 'node:test'
import { accountActions } from '../src/account.js'

function fakeDb({ canDeleteUsers = true } = {}) {
  const users = new Map([
    ['u1', { $id: 'u1', name: 'Мика', email: 'm@example.com', prefs: { theme: 'dark' } }],
    ['u2', { $id: 'u2', name: 'Рэй', email: 'r@example.com' }],
  ])
  const tables = {}
  const table = (name) => (tables[name] ??= new Map())
  const api = async (method, path) => {
    const u = path.match(/^\/users\/([^/]+)$/)
    if (u) {
      if (method === 'DELETE') {
        if (!canDeleteUsers) throw new Error('DELETE: missing scope users.write')
        users.delete(u[1])
        return { status: 204, json: {} }
      }
      return users.has(u[1]) ? { status: 200, json: users.get(u[1]) } : { status: 404, json: {} }
    }
    const m = path.match(/^\/tablesdb\/anime\/tables\/([a-z_]+)\/rows(?:\/([^?]+))?(?:\?(.*))?$/)
    const [, name, id, qs] = m
    const rows = table(name)
    if (method === 'GET' && !id) {
      const queries = new URLSearchParams(qs).getAll('queries[]').map((q) => JSON.parse(q))
      let found = [...rows.values()]
      for (const q of queries) if (q.method === 'equal') found = found.filter((r) => q.values.includes(r[q.attribute]))
      const offset = queries.find((q) => q.method === 'offset')?.values[0] ?? 0
      const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
      return { status: 200, json: { rows: found.slice(offset, offset + limit) } }
    }
    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
    if (method === 'DELETE') return rows.delete(id), { status: 204, json: {} }
    throw new Error(`unexpected ${method} ${path}`)
  }
  const put = (name, row) => table(name).set(row.$id, row)
  put('lists', { $id: 'u1', items: '[]' })
  put('lists', { $id: 'u2', items: '[]' })
  put('shiki_links', { $id: 'u1', shikiId: 5, access: 'SECRET', refresh: 'SECRET2' })
  put('comments', { $id: 'c1', userId: 'u1', text: 'моё' })
  put('comments', { $id: 'c2', userId: 'u2', text: 'чужое' })
  put('follows', { $id: 'f1', followerId: 'u2', followeeId: 'u1' })
  put('user_collections', { $id: 'col1', ownerId: 'u1', title: 'Моя подборка' })
  put('collection_likes', { $id: 'l1', collectionId: 'col1', userId: 'u2' })
  put('clubs', { $id: 'club1', ownerId: 'u1' })
  put('club_members', { $id: 'm1', clubId: 'club1', userId: 'u2' })
  return { api, tables, users }
}

const as = (userId) => ({ headers: { 'x-appwrite-user-id': userId } })

test('выгрузка: свои строки без токенов, с подписчиками и настройками аккаунта', async () => {
  const db = fakeDb()
  const data = await accountActions['account-export'](db.api, as('u1'), {})
  assert.equal(data.account.email, 'm@example.com')
  assert.deepEqual(data.account.prefs, { theme: 'dark' })
  assert.equal(data.tables.comments.length, 1)
  assert.equal(data.tables.comments[0].text, 'моё')
  assert.equal(data.tables['follows (подписчики)'].length, 1)
  assert.equal(data.tables.shiki_links[0].shikiId, 5)
  assert.equal(JSON.stringify(data).includes('SECRET'), false)
})

test('удаление: нужно слово УДАЛИТЬ; уходят свои строки, подборки и клубы с чужими лайками и участниками', async () => {
  const db = fakeDb()
  await assert.rejects(accountActions['account-delete'](db.api, as('u1'), { confirm: 'да' }), /УДАЛИТЬ/)
  const res = await accountActions['account-delete'](db.api, as('u1'), { confirm: 'удалить' })
  assert.equal(res.accountDeleted, true)
  assert.equal(db.users.has('u1'), false)
  assert.equal(db.tables.lists.has('u1'), false)
  assert.equal(db.tables.lists.has('u2'), true)
  assert.deepEqual([...db.tables.comments.keys()], ['c2'])
  assert.equal(db.tables.follows.size, 0)
  assert.equal(db.tables.collection_likes.size, 0)
  assert.equal(db.tables.club_members.size, 0)
  assert.equal(db.tables.shiki_links.size, 0)
})

test('удаление без права users.write: данные стёрты, аккаунт отключит сайт', async () => {
  const db = fakeDb({ canDeleteUsers: false })
  const res = await accountActions['account-delete'](db.api, as('u1'), { confirm: 'УДАЛИТЬ' })
  assert.equal(res.accountDeleted, false)
  assert.equal(db.tables.comments.has('c1'), false)
})

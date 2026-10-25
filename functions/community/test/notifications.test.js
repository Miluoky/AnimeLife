import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationActions } from '../src/notifications.js'
import { socialActions } from '../src/social.js'
import { commentSave } from '../src/profile.js'

/** Простая база в памяти, как в social.test.js: equal, limit, orderDesc по at. */
function fakeDb() {
  const users = { u1: { $id: 'u1', name: 'Мика' }, u2: { $id: 'u2', name: 'Рэй' } }
  const tables = {}
  let seq = 0
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
        if (q.method === 'greaterThan') found = found.filter((r) => r[q.attribute] > q.values[0])
        if (q.method === 'orderDesc') found.sort((a, b) => b[q.attribute] - a[q.attribute])
      }
      const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
      return { status: 200, json: { total: found.length, rows: found.slice(0, limit) } }
    }
    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
    if (method === 'DELETE') return rows.delete(id), { status: 204, json: {} }
    if (method === 'POST') {
      const row = { $id: `id${++seq}`, ...body.data }
      rows.set(row.$id, row)
      return { status: 201, json: row }
    }
    const row = { ...(method === 'PATCH' ? rows.get(id) : {}), $id: id, ...body.data }
    rows.set(id, row)
    return { status: 200, json: row }
  }
  return { api, table }
}

const as = (userId) => ({ headers: { 'x-appwrite-user-id': userId } })

test('ответ на комментарий: строка помнит, кому ответили, автор получает уведомление', async () => {
  const db = fakeDb()
  const { comment: first } = await commentSave(db.api, as('u1'), { animeId: '1', episode: 2, text: 'Отличная серия' })
  const { comment: reply } = await commentSave(db.api, as('u2'), { animeId: '1', episode: 2, text: 'Согласен, 12:34 огонь', replyTo: first.$id })
  assert.equal(reply.replyTo, first.$id)
  assert.equal(reply.replyName, 'Мика')
  const list = await notificationActions['notif-list'](db.api, as('u1'))
  assert.equal(list.unread, 1)
  assert.equal(list.items[0].kind, 'reply')
  assert.equal(list.items[0].actorName, 'Рэй')
  assert.equal(list.items[0].link, `/watch/1/2#c-${reply.$id}`)
  // Ответ самому себе уведомлений не создаёт, у автора ответа их нет.
  await commentSave(db.api, as('u1'), { animeId: '1', episode: 2, text: 'И ещё мысль', replyTo: first.$id })
  assert.equal((await notificationActions['notif-list'](db.api, as('u1'))).unread, 1)
  assert.equal((await notificationActions['notif-list'](db.api, as('u2'))).items.length, 0)
  // Ответ на комментарий другой серии не принимаем.
  await assert.rejects(commentSave(db.api, as('u2'), { animeId: '1', episode: 3, text: 'Не туда', replyTo: first.$id }), /не найден/)
  await notificationActions['notif-read'](db.api, as('u1'))
  assert.equal((await notificationActions['notif-list'](db.api, as('u1'))).unread, 0)
})

test('автомодерация: комментарий с матом уходит на проверку и не будит автора исходного', async () => {
  const db = fakeDb()
  const { comment: first } = await commentSave(db.api, as('u1'), { animeId: '1', episode: 2, text: 'Отличная серия' })
  const saved = await commentSave(db.api, as('u2'), { animeId: '1', episode: 2, text: 'да ну нахуй такой финал', replyTo: first.$id })
  assert.equal(saved.held, 'мат')
  assert.equal(saved.comment.hidden, true)
  assert.equal((await notificationActions['notif-list'](db.api, as('u1'))).unread, 0)
  await assert.rejects(commentSave(db.api, as('u1'), { animeId: '1', episode: 2, text: 'отличная  серия' }), /уже отправили/)
})

test('подписка и лайк подборки — по одному уведомлению, даже если нажать дважды', async () => {
  const db = fakeDb()
  db.table('profiles').set('u1', { $id: 'u1', name: 'Мика' })
  await socialActions.follow(db.api, as('u2'), { userId: 'u1' })
  await socialActions.unfollow(db.api, as('u2'), { userId: 'u1' })
  await socialActions.follow(db.api, as('u2'), { userId: 'u1' })
  db.table('user_collections').set('c1', { $id: 'c1', ownerId: 'u1', title: 'Лучшее осени', likes: 0 })
  await socialActions['ucol-like'](db.api, as('u2'), { id: 'c1' })
  const { items } = await notificationActions['notif-list'](db.api, as('u1'))
  assert.deepEqual(items.map((n) => n.kind).sort(), ['follow', 'ucol-like'])
  assert.equal(items.find((n) => n.kind === 'ucol-like').text, 'Лучшее осени')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { socialActions } from '../src/social.js'
import { isoWeekKey, monthKeyOf, profileSave } from '../src/profile.js'

/** База в памяти: таблицы → строки; понимает equal, greaterThan, limit и total, как TablesDB. */
function fakeDb(users = { u1: { $id: 'u1', name: 'Мика' }, u2: { $id: 'u2', name: 'Рэй' }, admin: { $id: 'admin', name: 'Мод', labels: ['admin'] } }) {
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
      }
      const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
      return { status: 200, json: { total: found.length, rows: found.slice(0, limit) } }
    }
    if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
    if (method === 'DELETE') {
      rows.delete(id)
      return { status: 204, json: {} }
    }
    if (method === 'POST') {
      const rowId = body.rowId === 'unique()' ? `id${++seq}` : body.rowId
      const row = { $id: rowId, ...body.data }
      rows.set(rowId, row)
      return { status: 201, json: row }
    }
    if (method === 'PUT') {
      const row = { $id: id, ...body.data }
      rows.set(id, row)
      return { status: 200, json: row }
    }
    if (method === 'PATCH') {
      const row = { ...rows.get(id), ...body.data }
      rows.set(id, row)
      return { status: 200, json: row }
    }
    throw new Error(`unexpected ${method}`)
  }
  return { api, tables, table }
}

const as = (userId) => ({ headers: userId ? { 'x-appwrite-user-id': userId } : {} })
const run = (db, action, userId, body = {}) => socialActions[action](db.api, as(userId), body)

test('подписка только на открытый профиль, счётчик подписчиков', async () => {
  const db = fakeDb()
  await assert.rejects(run(db, 'follow', 'u1', { userId: 'u2' }), /закрыт/)
  db.table('profiles').set('u2', { $id: 'u2' })
  assert.equal((await run(db, 'follow', 'u1', { userId: 'u2' })).followers, 1)
  // повторная подписка не удваивает
  assert.equal((await run(db, 'follow', 'u1', { userId: 'u2' })).followers, 1)
  await assert.rejects(run(db, 'follow', 'u2', { userId: 'u2' }), /себя/)
  assert.equal((await run(db, 'unfollow', 'u1', { userId: 'u2' })).followers, 0)
})

test('событие ленты пишется только с открытым профилем и заменяет прошлое', async () => {
  const db = fakeDb()
  const anime = { id: '52991', title: 'Фрирен', poster: 'https://x/p.jpg' }
  assert.equal((await run(db, 'activity-add', 'u1', { kind: 'episode', anime, value: 3 })).skipped, true)
  db.table('profiles').set('u1', { $id: 'u1' })
  await run(db, 'activity-add', 'u1', { kind: 'episode', anime, value: 3 })
  await run(db, 'activity-add', 'u1', { kind: 'episode', anime, value: 4 })
  const rows = [...db.table('activity').values()]
  assert.equal(rows.length, 1)
  assert.equal(rows[0].value, 4)
  await assert.rejects(run(db, 'activity-add', 'u1', { kind: 'rating', anime, value: 11 }), /1 до 10/)
  await run(db, 'activity-add', 'u1', { kind: 'status', anime: { ...anime, poster: 'javascript:alert(1)' }, status: 'completed' })
  assert.equal([...db.table('activity').values()].find((r) => r.kind === 'status').poster, '')
})

test('подборка: создать, править может только автор, лайк туда-обратно', async () => {
  const db = fakeDb()
  const items = [{ id: '1', title: 'A', poster: 'https://x/a.jpg' }, { id: '1' }, { id: 'bad' }, { id: '2', title: 'B' }]
  const { collection } = await run(db, 'ucol-save', 'u1', { title: 'Вечер', about: '', items })
  assert.equal(collection.count, 2)
  assert.equal(collection.ownerName, 'Мика')
  await assert.rejects(run(db, 'ucol-save', 'u2', { id: collection.$id, title: 'Чужая', items }), /автор/)
  assert.deepEqual(await run(db, 'ucol-like', 'u2', { id: collection.$id }), { liked: true, likes: 1 })
  assert.deepEqual(await run(db, 'ucol-like', 'u2', { id: collection.$id }), { liked: false, likes: 0 })
  await assert.rejects(run(db, 'ucol-save', 'u1', { title: 'Пусто', items: [] }), /хотя бы один/)
  await run(db, 'ucol-delete', 'admin', { id: collection.$id })
  assert.equal(db.table('user_collections').size, 0)
})

test('клуб: писать могут только участники, жалобы прячут запись', async () => {
  const db = fakeDb({
    u1: { $id: 'u1', name: 'Мика' },
    u2: { $id: 'u2', name: 'Рэй' },
    u3: { $id: 'u3', name: 'Аска' },
    u4: { $id: 'u4', name: 'Синдзи' },
  })
  const { club } = await run(db, 'club-create', 'u1', { title: 'Фрирен', about: 'Обсуждаем' })
  assert.equal(club.members, 1)
  await assert.rejects(run(db, 'club-post', 'u2', { clubId: club.$id, text: 'привет' }), /Вступите/)
  assert.equal((await run(db, 'club-join', 'u2', { clubId: club.$id })).members, 2)
  const { post } = await run(db, 'club-post', 'u2', { clubId: club.$id, text: 'привет всем' })
  assert.equal(db.table('clubs').get(club.$id).posts, 1)
  for (const u of ['u1', 'u3']) await run(db, 'club-post-report', u, { postId: post.$id })
  assert.equal(db.table('club_posts').get(post.$id).hidden, false)
  assert.equal((await run(db, 'club-post-report', 'u4', { postId: post.$id })).hidden, true)
  await assert.rejects(run(db, 'club-leave', 'u1', { clubId: club.$id }), /Создатель/)
  // создатель клуба может убрать чужую запись
  await run(db, 'club-post-delete', 'u1', { postId: post.$id })
  assert.equal(db.table('club_posts').size, 0)
})

test('оценка серии: среднее пересчитывается при смене и снятии оценки', async () => {
  const db = fakeDb()
  assert.deepEqual(await run(db, 'episode-rate', 'u1', { animeId: '1', episode: 2, score: 5 }), { score: 5, avg: 5, votes: 1 })
  assert.deepEqual(await run(db, 'episode-rate', 'u2', { animeId: '1', episode: 2, score: 2 }), { score: 2, avg: 3.5, votes: 2 })
  assert.deepEqual(await run(db, 'episode-rate', 'u2', { animeId: '1', episode: 2, score: 4 }), { score: 4, avg: 4.5, votes: 2 })
  assert.deepEqual(await run(db, 'episode-rate', 'u1', { animeId: '1', episode: 2, score: 0 }), { score: 0, avg: 4, votes: 1 })
  assert.equal((await run(db, 'episode-my-rate', 'u2', { animeId: '1', episode: 2 })).score, 4)
  await assert.rejects(run(db, 'episode-rate', 'u1', { animeId: '1', episode: 2, score: 6 }), /1 до 5/)
})

test('Shikimori без ключей на сервере не подключается', async () => {
  const db = fakeDb()
  await assert.rejects(run(db, 'shiki-connect', 'u1', { code: 'x', redirectUri: 'https://animelife.top/auth/shikimori' }), /не настроена/)
  assert.deepEqual(await run(db, 'shiki-status', 'u1'), { connected: false })
})

test('профиль: опыт за неделю засчитывается только для текущей недели', async () => {
  const db = fakeDb()
  const week = isoWeekKey()
  await profileSave(db.api, as('u1'), { summary: { xp: 1234.7, week: { key: week, xp: 99999999 } } })
  let row = db.table('profiles').get('u1')
  assert.equal(row.xp, 1234)
  assert.equal(row.weekXp, 30000)
  assert.equal(row.weekKey, week)
  await profileSave(db.api, as('u1'), { summary: { xp: 5, week: { key: 200001, xp: 50 } } })
  row = db.table('profiles').get('u1')
  assert.equal(row.weekXp, 0)
  assert.equal(row.weekKey, 0)
})

test('профиль: опыт за месяц — только текущего месяца и не больше 4 000 серий', async () => {
  const db = fakeDb()
  const month = monthKeyOf()
  await profileSave(db.api, as('u1'), { summary: { xp: 10, month: { key: month, xp: 420 } } })
  assert.deepEqual([db.table('profiles').get('u1').monthXp, db.table('profiles').get('u1').monthKey], [420, month])
  await profileSave(db.api, as('u1'), { summary: { xp: 10, month: { key: month, xp: 1e9 } } })
  assert.equal(db.table('profiles').get('u1').monthXp, 40000)
  await profileSave(db.api, as('u1'), { summary: { xp: 10, month: { key: 202001, xp: 420 } } })
  assert.deepEqual([db.table('profiles').get('u1').monthXp, db.table('profiles').get('u1').monthKey], [0, 0])
})

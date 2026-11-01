import assert from 'node:assert/strict'
import test from 'node:test'
import { socialActions } from '../src/social.js'

function fakeDb(
  users = {
    u1: { $id: 'u1', name: 'Мика' },
    u2: { $id: 'u2', name: 'Рэй' },
    u3: { $id: 'u3', name: 'Син' },
    hacker: { $id: 'hacker', name: 'Хакер' },
    admin: { $id: 'admin', name: 'Мод', labels: ['admin'] },
  },
) {
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
      const queries = qs ? new URLSearchParams(qs).getAll('queries[]').map((q) => JSON.parse(q)) : []
      let found = [...rows.values()]
      for (const q of queries) {
        if (q.method === 'equal') found = found.filter((r) => q.values.includes(r[q.attribute]))
        if (q.method === 'greaterThan') found = found.filter((r) => r[q.attribute] > q.values[0])
        if (q.method === 'orderDesc') found = found.sort((a, b) => (b[q.attribute] ?? 0) - (a[q.attribute] ?? 0))
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
      const rowId = body.rowId === 'unique()' ? `w${++seq}` : body.rowId
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
      const prev = rows.get(id) || {}
      const row = { ...prev, ...body.data }
      rows.set(id, row)
      return { status: 200, json: row }
    }

    throw new Error(`unexpected ${method} ${path}`)
  }

  return { api, tables, table }
}

const as = (userId) => ({ headers: userId ? { 'x-appwrite-user-id': userId } : {} })
const run = (db, action, userId, body = {}) => socialActions[action](db.api, as(userId), body)

test('ADVERSARIAL: ProfileWall rate-limiting strictly blocks excess rapid posts (limit: 6 per 10min)', async () => {
  const db = fakeDb()
  for (let i = 1; i <= 6; i++) {
    const res = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: `Сообщение в лимит ${i}` })
    assert.ok(res.comment.$id)
  }
  await assert.rejects(
    run(db, 'wall-post', 'u1', { profileId: 'u2', text: '7-е сообщение сверх лимита' }),
    /Слишком много записей подряд/
  )
})

test('ADVERSARIAL: ProfileWall automod detects obfuscated profanity and hides content', async () => {
  const db = fakeDb()
  const evasiveMnemonicPosts = [
    'какой-то х.у.й.л.о тут бродит',
    'это полное б.л.я.д.с.т.в.о',
    'ну ты и п_и_з_д_а',
    'полное е_б_л_о вокруг',
  ]

  for (const text of evasiveMnemonicPosts) {
    const res = await run(db, 'wall-post', 'u1', { profileId: 'u2', text })
    assert.strictEqual(res.held, 'мат', `Expected text "${text}" to be flagged as held: мат`)
    assert.strictEqual(res.comment.hidden, true, `Expected comment for "${text}" to have hidden: true`)
  }
})

test('ADVERSARIAL: ProfileWall authorization on delete enforces strict ownership boundaries', async () => {
  const db = fakeDb()
  const { comment } = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Запись для проверки прав' })

  // 1. hacker attempts to delete comment -> must fail
  await assert.rejects(
    run(db, 'wall-delete', 'hacker', { commentId: comment.$id }),
    /Удалить запись может только автор, владелец стены или администратор/
  )

  // 2. unauthenticated user attempts to delete comment -> must fail
  await assert.rejects(
    run(db, 'wall-delete', null, { commentId: comment.$id }),
    /Войдите/
  )

  // 3. Wall owner (u2) can delete comments on their wall even if authored by u1
  const ownerDelete = await run(db, 'wall-delete', 'u2', { commentId: comment.$id })
  assert.strictEqual(ownerDelete.ok, true)

  // Verify it is actually gone
  const list = await run(db, 'wall-list', 'u2', { profileId: 'u2' })
  assert.strictEqual(list.comments.length, 0)
})

test('ADVERSARIAL: ProfileWall likes stress - toggling idempotency and counters', async () => {
  const db = fakeDb()
  const { comment } = await run(db, 'wall-post', 'u1', { profileId: 'u2', text: 'Пост для лайков' })

  // u2 likes
  let res = await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  assert.strictEqual(res.liked, true)
  assert.strictEqual(res.likes, 1)

  // u2 unlikes
  res = await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  assert.strictEqual(res.liked, false)
  assert.strictEqual(res.likes, 0)

  // u2 re-likes
  res = await run(db, 'wall-like', 'u2', { commentId: comment.$id })
  assert.strictEqual(res.liked, true)
  assert.strictEqual(res.likes, 1)

  // u3 also likes
  res = await run(db, 'wall-like', 'u3', { commentId: comment.$id })
  assert.strictEqual(res.liked, true)
  assert.strictEqual(res.likes, 2)

  // Check list includes liked status per viewer
  const listForU2 = await run(db, 'wall-list', 'u2', { profileId: 'u2' })
  assert.strictEqual(listForU2.comments[0].likes, 2)
  assert.strictEqual(listForU2.comments[0].liked, true)

  const listForHacker = await run(db, 'wall-list', 'hacker', { profileId: 'u2' })
  assert.strictEqual(listForHacker.comments[0].likes, 2)
  assert.strictEqual(listForHacker.comments[0].liked, false)
})

test('ADVERSARIAL: Community XP stat calculation handles zero, huge XP, and period switching safely', () => {
  const calcStat = (period, p) => {
    const xpVal = (period === 'week' ? p.weekXp : period === 'month' ? p.monthXp : p.xp) ?? 0
    const eps =
      period === 'week' || period === 'month'
        ? Math.round(xpVal / 10)
        : (p.facts?.episodes ?? Math.max(1, Math.round(xpVal / 10)))
    const hours =
      period === 'week' || period === 'month'
        ? Math.round((eps * 24) / 60)
        : (Math.round((eps * 24) / 60) || Math.max(1, Math.round(xpVal / 25)))
    return { xpVal, eps, hours }
  }

  // 1. Zero XP in week
  const zero = calcStat('week', { weekXp: 0, monthXp: 100, xp: 5000, facts: { episodes: 500 } })
  assert.strictEqual(zero.xpVal, 0)
  assert.strictEqual(zero.eps, 0)
  assert.strictEqual(zero.hours, 0)

  // 2. 150 week XP = 15 episodes, 6 hours
  const normal = calcStat('week', { weekXp: 150, monthXp: 600, xp: 10000, facts: { episodes: 1000 } })
  assert.strictEqual(normal.xpVal, 150)
  assert.strictEqual(normal.eps, 15)
  assert.strictEqual(normal.hours, 6)

  // 3. Huge month XP: 10,000 XP = 1,000 episodes, 400 hours
  const huge = calcStat('month', { weekXp: 200, monthXp: 10000, xp: 50000 })
  assert.strictEqual(huge.xpVal, 10000)
  assert.strictEqual(huge.eps, 1000)
  assert.strictEqual(huge.hours, 400)
})

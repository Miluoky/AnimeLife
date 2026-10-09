import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsStats, analyticsTrack, buckets, sourceOf } from '../src/analytics.js'

/** Простая база в памяти: строки таблиц, increment, фильтры greaterThanEqual/equal и счёт total. */
function fakeApi({ admin = true } = {}) {
  const tables = { analytics: new Map(), analytics_stats: new Map() }
  const api = async (method, path, body) => {
    if (path.startsWith('/users/')) return { status: 200, json: { $id: 'u1', labels: admin ? ['admin'] : [] } }
    if (path.startsWith('/users?')) return { status: 200, json: { total: 3 } }
    const [, table, rest] = path.match(/\/tables\/(\w+)\/rows(.*)$/)
    const rows = tables[table]
    const inc = rest.match(/^\/([^/]+)\/(\w+)\/increment$/)
    if (inc) {
      const row = rows.get(inc[1])
      if (!row) return { status: 404, json: {} }
      row[inc[2]] = (row[inc[2]] ?? 0) + body.value
      return { status: 200, json: row }
    }
    if (method === 'POST') {
      if (rows.has(body.rowId)) throw new Error('409')
      rows.set(body.rowId, { $id: body.rowId, $createdAt: new Date(NOW).toISOString(), ...body.data })
      return { status: 201, json: {} }
    }
    if (rest.startsWith('/')) {
      const id = rest.slice(1)
      if (method === 'GET') return rows.has(id) ? { status: 200, json: rows.get(id) } : { status: 404, json: {} }
      rows.set(id, { $id: id, $createdAt: rows.get(id)?.$createdAt ?? new Date(NOW).toISOString(), ...body.data })
      return { status: 200, json: {} }
    }
    const queries = new URLSearchParams(rest.slice(1)).getAll('queries[]').map((q) => JSON.parse(q))
    let found = [...rows.values()]
    for (const q of queries) {
      if (q.method === 'greaterThanEqual') found = found.filter((row) => row[q.attribute] >= q.values[0])
      if (q.method === 'equal') found = found.filter((row) => q.values.includes(row[q.attribute]))
      if (q.method === 'orderDesc') found.sort((a, b) => b[q.attribute] - a[q.attribute])
    }
    const limit = queries.find((q) => q.method === 'limit')?.values[0] ?? found.length
    return { status: 200, json: { total: found.length, rows: found.slice(0, limit) } }
  }
  return { api, tables }
}

let NOW = Date.parse('2026-10-09T15:10:00Z') // 18:10 по Москве
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const req = { headers: { 'x-appwrite-user-id': 'u1' } }

test('ключи периодов считаются по московскому времени', () => {
  assert.deepEqual(buckets(Date.parse('2026-10-09T22:30:00Z')), { hour: '2026101001', day: '20261010', month: '202610' })
})

test('источник трафика по referrer и utm', () => {
  assert.equal(sourceOf('https://yandex.ru/search?text=x'), 'yandex')
  assert.equal(sourceOf('https://www.google.com/'), 'google')
  assert.equal(sourceOf('https://t.me/animelife'), 'telegram')
  assert.equal(sourceOf('https://animelife.top/anime/1'), 'direct')
  assert.equal(sourceOf(''), 'direct')
  assert.equal(sourceOf('https://shikimori.one/x'), 'shikimori.one')
  assert.equal(sourceOf('', 'TikTok'), 'tiktok')
})

test('посещения, серии, поток по часам и устройства', async () => {
  const { api, tables } = fakeApi()
  await analyticsTrack(api, { sessionId: A, path: '/', pageview: true, device: 'mobile', referrer: 'https://yandex.ru/' }, NOW)
  await analyticsTrack(api, { sessionId: A, path: '/watch/1/1', pageview: true }, NOW + 60_000)
  await analyticsTrack(api, { sessionId: A, path: '/watch/1/1', pageview: false }, NOW + 120_000)
  await analyticsTrack(api, { sessionId: B, path: '/anime/1', pageview: true, device: 'desktop' }, NOW + 180_000)

  const hour = tables.analytics_stats.get('h2026100918')
  assert.deepEqual([hour.views, hour.episodes, hour.visitors, hour.newVisitors], [3, 1, 2, 2])
  assert.equal(tables.analytics_stats.get('d20261009').visitors, 2)
  assert.equal([...tables.analytics.values()].find((row) => row.device === 'mobile').source, 'yandex')

  NOW += 4 * 60_000
  const stats = await analyticsStats(api, req, NOW)
  assert.equal(stats.online, 2)
  assert.deepEqual(stats.visitors, { today: 2, week: 2, month: 2, all: 2 })
  assert.deepEqual(stats.views, { today: 3, week: 3, month: 3 })
  assert.deepEqual(stats.episodes, { today: 1, week: 1, month: 1 })
  assert.equal(stats.hours.length, 1)
  assert.deepEqual(stats.devices.map((d) => d.name).sort(), ['desktop', 'mobile'])
  assert.equal(stats.popular[0].views, 1)
  assert.equal(stats.users.all, 3)
})

test('в новый час тот же человек снова считается в потоке часа, но не дня', async () => {
  const { api, tables } = fakeApi()
  await analyticsTrack(api, { sessionId: A, path: '/', pageview: true }, NOW)
  await analyticsTrack(api, { sessionId: A, path: '/', pageview: false }, NOW + 60 * 60_000)
  assert.equal(tables.analytics_stats.size, 4) // два часа, один день, одна страница
  assert.equal(tables.analytics_stats.get(`d${buckets(NOW).day}`).visitors, 1)
  assert.equal(tables.analytics_stats.get(`h${buckets(NOW + 3_600_000).hour}`).visitors, 1)
})

test('статистика закрыта для обычных пользователей и гостей', async () => {
  await assert.rejects(analyticsStats(fakeApi({ admin: false }).api, req), /Недостаточно прав/)
  await assert.rejects(analyticsStats(fakeApi().api, { headers: {} }), /Войдите/)
})

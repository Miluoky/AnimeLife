import assert from 'node:assert/strict'
import test from 'node:test'
import { sibnetProxy, isSibnetProxy } from '../worker/sibnetProxy.js'

test('ADVERSARIAL: Sibnet Proxy prefix detection and routing', () => {
  assert.strictEqual(isSibnetProxy('/api/sibnet/stream/12345'), true)
  assert.strictEqual(isSibnetProxy('/api/sibnet/resolve/12345'), true)
  assert.strictEqual(isSibnetProxy('/api/sibnet/'), true)
  assert.strictEqual(isSibnetProxy('/api/shiki/anime'), false)
  assert.strictEqual(isSibnetProxy('/watch/123'), false)
})

test('ADVERSARIAL: Sibnet Proxy OPTIONS preflight returns 204 with strict CORS headers', async () => {
  const req = new Request('https://animelife.top/api/sibnet/stream/12345', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://animelife.top',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Range',
    },
  })
  const res = await sibnetProxy(req)
  assert.strictEqual(res.status, 204)
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*')
  assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS')
  assert.strictEqual(res.headers.get('Access-Control-Allow-Headers'), 'Range, Accept-Ranges, Content-Type')
  assert.strictEqual(res.headers.get('Access-Control-Expose-Headers'), 'Content-Range, Content-Length, Accept-Ranges')
  assert.strictEqual(res.headers.get('Access-Control-Max-Age'), '86400')
})

test('ADVERSARIAL: Sibnet Proxy rejects invalid or malicious video IDs with HTTP 400', async () => {
  const maliciousIds = [
    '../../etc/passwd',
    '<script>alert(1)</script>',
    '12345; DROP TABLE videos;',
    '-10',
    'abc123',
    '',
  ]

  for (const id of maliciousIds) {
    const req = new Request(`https://animelife.top/api/sibnet/stream/${encodeURIComponent(id)}`, {
      method: 'GET',
    })
    const res = await sibnetProxy(req)
    assert.strictEqual(res.status, 400, `Expected status 400 for malicious ID: ${id}`)
    const json = await res.json()
    assert.strictEqual(json.error, 'invalid video id')
  }
})

test('ADVERSARIAL: Canonical URL algorithm strips unwanted query params, trailing slashes, and preserves page only on whitelist', () => {
  const ORIGIN = 'https://animelife.top'
  function getCanonicalUrl(pathname = '/', search = '') {
    const path = pathname.replace(/\/+$/, '') || '/'
    const params = new URLSearchParams(search)
    const page = Number(params.get('page'))
    const keep =
      /^\/(?:catalog$|genre\/|theme\/|best\/|studio\/|type\/|year\/)/.test(path) &&
      Number.isInteger(page) &&
      page > 1 &&
      (path !== '/catalog' || [...params.keys()].every((k) => k === 'page'))
    return ORIGIN + path + (keep ? `?page=${page}` : '')
  }

  // 1. Home page with tracking params and trailing slash -> clean root
  assert.strictEqual(
    getCanonicalUrl('///', '?utm_source=tg&ref=vk'),
    'https://animelife.top/'
  )

  // 2. Title page with query params -> stripped
  assert.strictEqual(
    getCanonicalUrl('/anime/5114/', '?voice=anilibria&ep=5'),
    'https://animelife.top/anime/5114'
  )

  // 3. Catalog page 1 -> no page param
  assert.strictEqual(
    getCanonicalUrl('/catalog', '?page=1'),
    'https://animelife.top/catalog'
  )

  // 4. Catalog page 3 (clean) -> keep page 3
  assert.strictEqual(
    getCanonicalUrl('/catalog', '?page=3'),
    'https://animelife.top/catalog?page=3'
  )

  // 5. Catalog with filters AND page -> strip page because filtered catalogs aren't indexed as canonical pages
  assert.strictEqual(
    getCanonicalUrl('/catalog', '?genre=action&page=3'),
    'https://animelife.top/catalog'
  )

  // 6. Whitelisted genre page 4 -> keep page 4
  assert.strictEqual(
    getCanonicalUrl('/genre/action', '?page=4'),
    'https://animelife.top/genre/action?page=4'
  )

  // 7. Whitelisted studio page 2 -> keep page 2
  assert.strictEqual(
    getCanonicalUrl('/studio/mappa', '?page=2'),
    'https://animelife.top/studio/mappa?page=2'
  )

  // 8. Whitelisted theme page 2 -> keep page 2
  assert.strictEqual(
    getCanonicalUrl('/theme/isekai', '?page=2'),
    'https://animelife.top/theme/isekai?page=2'
  )
})

test('ADVERSARIAL: Positions sync algorithms cap at 20 most recent entries and handle conflicts', () => {
  const MIN = 30
  function getRecentPositionsForSync(all) {
    const latestByAnime = new Map()
    for (const [k, v] of Object.entries(all)) {
      const colon = k.lastIndexOf(':')
      if (colon === -1) continue
      const animeId = k.slice(0, colon)
      const ep = parseInt(k.slice(colon + 1), 10)
      if (!animeId || isNaN(ep) || v.t < MIN) continue
      const existing = latestByAnime.get(animeId)
      if (!existing || v.at > existing.at) {
        latestByAnime.set(animeId, { ep, t: v.t, d: v.d, at: v.at })
      }
    }
    const sorted = [...latestByAnime.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 20)

    const result = {}
    for (const [animeId, pos] of sorted) {
      result[animeId] = {
        animeId,
        ep: pos.ep,
        episode: pos.ep,
        t: pos.t,
        d: pos.d,
        at: pos.at,
      }
    }
    return result
  }

  // Create 50 anime entries with timestamps
  const testData = {}
  for (let i = 1; i <= 50; i++) {
    // anime_i episode 1 (old)
    testData[`anime_${i}:1`] = { t: 50, d: 1400, at: 1000 + i }
    // anime_i episode 2 (newer)
    testData[`anime_${i}:2`] = { t: 120, d: 1400, at: 2000 + i }
  }
  // Add some entries with t < MIN (should be ignored)
  testData['anime_short:1'] = { t: 15, d: 1400, at: 999999 }

  const synced = getRecentPositionsForSync(testData)
  const keys = Object.keys(synced)
  assert.strictEqual(keys.length, 20, 'Must strictly cap at 20 entries')
  assert.ok(!synced['anime_short'], 'Must ignore entries with t < 30')

  // Top entry must be anime_50 with episode 2
  assert.strictEqual(synced['anime_50'].ep, 2)
  assert.strictEqual(synced['anime_50'].at, 2050)
})

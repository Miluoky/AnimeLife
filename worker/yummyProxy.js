/**
 * Прокси к списку серий YummyAnime: /api/yummy/videos/<id тайтла YummyAnime>.
 *
 * API YummyAnime (api.yani.tv) открыт, но отдаёт JSON без сжатия: у длинного сериала это около мегабайта на каждый
 * заход в плеер. Через Worker тот же ответ уходит зрителю сжатым (в 20–30 раз меньше) и лежит в кэше Cloudflare:
 * одинаковые запросы разных зрителей обходятся одним запросом к YummyAnime, а при его сбое отдаётся последняя копия.
 * Тело не разбираем и не переделываем: так Worker почти не тратит процессорного времени.
 */

const UPSTREAM = 'https://api.yani.tv'
const PREFIX = '/api/yummy/videos/'
const CACHE_ROOT = 'https://animelife.top/__yummy/v1/videos/'
// Новые серии появляются раз в день-неделю: часа свежести хватает.
const FRESH = 3600
const STALE = 7 * 24 * 3600
const BROWSER_TTL = 300
const TIMEOUT = 10000
const UA = 'AnimeLife/1.0 (+https://animelife.top)'

const json = (body, status, cache, maxAge = BROWSER_TTL) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Cache': cache,
    },
  })

export const isYummyProxy = (pathname) => pathname.startsWith(PREFIX)

export async function yummyProxy(request, ctx) {
  const id = new URL(request.url).pathname.slice(PREFIX.length)
  if (!/^\d{1,9}$/.test(id) || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return json(JSON.stringify({ error: 'not found' }), 404, 'MISS', 0)
  }
  const key = new Request(CACHE_ROOT + id)
  const cached = await caches.default.match(key)
  const freshUntil = Number(cached?.headers.get('X-Fresh-Until')) || 0
  if (cached && Date.now() < freshUntil) return json(cached.body, 200, 'HIT')

  let text
  try {
    const res = await fetch(`${UPSTREAM}/anime/${id}/videos`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const body = res.ok && (res.headers.get('Content-Type') ?? '').includes('json') ? await res.text() : ''
    // Ошибки YummyAnime тоже приходят как JSON, но без списка: такое не сохраняем.
    if (body.startsWith('{"response":[')) text = body
  } catch {
    // Ниже отдадим копию или ошибку.
  }
  if (text) {
    const stored = new Response(text, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${FRESH + STALE}`,
        'X-Fresh-Until': String(Date.now() + FRESH * 1000),
      },
    })
    ctx.waitUntil(caches.default.put(key, stored).catch(() => undefined))
    return json(text, 200, 'MISS')
  }
  if (cached) return json(cached.body, 200, 'STALE', 60)
  return json(JSON.stringify({ error: 'upstream error' }), 502, 'MISS', 0)
}

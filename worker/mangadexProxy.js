/**
 * Прокси к API MangaDex для читалки манги: /api/mangadex/<путь API>, например /api/mangadex/manga?title=...
 *
 * MangaDex не отдаёт CORS-заголовки чужим сайтам, поэтому браузер зрителя ходит к нему через Worker.
 * Пускаем только то, что нужно читалке: поиск манги, список глав и адреса страниц главы. Ответы лежат
 * в кэше Cloudflare, при сбое MangaDex отдаётся последняя копия. Сами картинки грузятся прямо с серверов
 * MangaDex@Home, через Worker они не идут.
 */

const UPSTREAM = 'https://api.mangadex.org'
const PREFIX = '/api/mangadex/'
const CACHE_ROOT = 'https://animelife.top/__mangadex/v1/'
const MIN = 60
const HOUR = 60 * MIN
const STALE = 24 * HOUR
const BROWSER_TTL = 300
const TIMEOUT = 10000
const UA = 'AnimeLife/1.0 (+https://animelife.top)'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** [путь, свежесть в секундах]. Адрес страниц главы живёт около 15 минут, поэтому его держим недолго. */
const PATHS = [
  [/^manga$/, 12 * HOUR],
  [new RegExp(`^manga/${UUID}/feed$`), 30 * MIN],
  [new RegExp(`^at-home/server/${UUID}$`), 5 * MIN],
]

const json = (body, status, cache, maxAge = BROWSER_TTL) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${Math.min(maxAge, BROWSER_TTL)}` : 'no-store',
      'X-Cache': cache,
    },
  })

export const isMangadexProxy = (pathname) => pathname.startsWith(PREFIX)

export async function mangadexProxy(request, ctx) {
  const url = new URL(request.url)
  const path = url.pathname.slice(PREFIX.length)
  const rule = PATHS.find(([re]) => re.test(path))
  if (!rule || url.search.length > 1500 || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return json(JSON.stringify({ error: 'not found' }), 404, 'MISS', 0)
  }
  const fresh = rule[1]
  const key = new Request(CACHE_ROOT + path + url.search)
  const cached = await caches.default.match(key)
  const freshUntil = Number(cached?.headers.get('X-Fresh-Until')) || 0
  if (cached && Date.now() < freshUntil) return json(cached.body, 200, 'HIT', fresh)

  let text
  let status = 502
  try {
    const res = await fetch(`${UPSTREAM}/${path}${url.search}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    status = res.status
    const body = await res.text()
    if (res.ok && body.startsWith('{"result":"ok"')) text = body
    else if (res.status === 404) return json(body, 404, 'MISS', 60)
  } catch {
    // Ниже отдадим копию или ошибку.
  }
  if (text) {
    const stored = new Response(text, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${fresh + STALE}`,
        'X-Fresh-Until': String(Date.now() + fresh * 1000),
      },
    })
    ctx.waitUntil(caches.default.put(key, stored).catch(() => undefined))
    return json(text, 200, 'MISS', fresh)
  }
  // Адрес страниц главы устаревает, старую копию не отдаём.
  if (cached && !path.startsWith('at-home/')) return json(cached.body, 200, 'STALE', 60)
  return json(JSON.stringify({ error: 'upstream error', status }), 502, 'MISS', 0)
}

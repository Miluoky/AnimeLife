/**
 * Прокси к API MangaDex для читалки манги: /api/mangadex/<путь API>, например /api/mangadex/manga?title=...
 *
 * MangaDex не отдаёт CORS-заголовки чужим сайтам, поэтому браузер зрителя ходит к нему через Worker.
 * Пускаем только то, что нужно читалке: поиск манги, список глав и адреса страниц главы. Ответы лежат
 * в кэше Cloudflare, при сбое MangaDex отдаётся последняя копия.
 *
 * Картинки страниц: /api/mangadex-img/<data|data-saver>/<hash>/<файл>?n=<адрес узла MangaDex@Home>. MangaDex
 * заблокирован в России, поэтому страницы тоже идут через Worker. Узел берём из ответа at-home (основной сервер
 * uploads.mangadex.org отвечает 403 запросам из дата-центров и служит только запасным). Файл главы с этим хэшем
 * не меняется, поэтому ключ кэша без узла: каждая картинка скачивается у MangaDex один раз.
 */

const UPSTREAM = 'https://api.mangadex.org'
const PREFIX = '/api/mangadex/'
const CACHE_ROOT = 'https://animelife.top/__mangadex/v1/'
const MIN = 60
const HOUR = 60 * MIN
const STALE = 24 * HOUR
const DAY_S = 24 * HOUR
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

export const isMangadexProxy = (pathname) => pathname.startsWith(PREFIX) || pathname.startsWith(IMG_PREFIX)

const IMG_PREFIX = '/api/mangadex-img/'
const IMG_PATH = /^(data|data-saver)\/[0-9a-f]{32}\/[\w.-]{1,200}\.(?:png|jpe?g|gif|webp)$/
const IMG_TTL = 30 * DAY_S
// Только узлы сети MangaDex@Home: иначе Worker стал бы открытым прокси для любых картинок.
const NODE = /^https:\/\/[a-z0-9-]{1,64}\.mangadex\.network(?::\d{2,5})?(?:\/[\w-]{1,128}){0,2}$/

/** Картинка страницы главы через кэш Cloudflare. */
async function mangadexImage(request, ctx, path, node) {
  if (!IMG_PATH.test(path) || (request.method !== 'GET' && request.method !== 'HEAD')) return new Response('not found', { status: 404 })
  const key = new Request(CACHE_ROOT + 'img/' + path)
  const cached = await caches.default.match(key)
  if (cached) return cached
  let res
  for (const base of [NODE.test(node ?? '') ? node : null, 'https://uploads.mangadex.org']) {
    if (!base) continue
    try {
      res = await fetch(`${base}/${path}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
      if (res.ok && (res.headers.get('Content-Type') ?? '').startsWith('image/')) break
    } catch {
      res = undefined
    }
  }
  if (!res?.ok || !(res.headers.get('Content-Type') ?? '').startsWith('image/')) {
    return new Response('upstream error', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  const out = new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type'),
      'Cache-Control': `public, max-age=${IMG_TTL}, immutable`,
      'X-Cache': 'MISS',
    },
  })
  ctx.waitUntil(caches.default.put(key, out.clone()).catch(() => undefined))
  return out
}

export async function mangadexProxy(request, ctx) {
  const url = new URL(request.url)
  if (url.pathname.startsWith(IMG_PREFIX)) return mangadexImage(request, ctx, url.pathname.slice(IMG_PREFIX.length), url.searchParams.get('n'))
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

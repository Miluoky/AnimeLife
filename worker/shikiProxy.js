/**
 * Прокси к API Shikimori с кэшем: /api/shiki/<путь API>, например /api/shiki/api/animes?limit=1.
 *
 * На animelife.top приложение берёт данные отсюда, а не прямо с Shikimori (src/api/shikimori.ts). Ответы лежат
 * в кэше Cloudflare (caches.default): одинаковые запросы разных зрителей обходятся одним запросом к Shikimori,
 * а если Shikimori тормозит, отвечает 429 или лежит, отдаётся последняя сохранённая копия (до недели).
 *
 * Пропускаются только адреса, которые нужны приложению (PATHS), остальное — 404. POST разрешён одному GraphQL
 * с постерами, ключ кэша для него — хэш тела. Ответ отдаётся как есть, без переделки JSON.
 * Ничего личного не хранится: списки пользователей (/users/...) сюда не ходят, адрес и заголовки зрителя
 * дальше не передаются и не пишутся в журнал.
 */

const UPSTREAM = 'https://shikimori.io'
const PREFIX = '/api/shiki'
// Ключи кэша живут на основном домене, как у карты сайта. v1 — поменять, если изменится формат записи.
const CACHE_ROOT = 'https://animelife.top/__shiki/v1'
const MIN = 60
const HOUR = 3600
const DAY = 24 * HOUR
// Сколько копия хранится сверх свежести: её отдаём, только если Shikimori не ответил.
const STALE = 7 * DAY
// Свежесть ответа 404 (тайтла нет): недолго, чтобы не дёргать Shikimori на каждый битый адрес.
const NOT_FOUND_TTL = 10 * MIN
const TIMEOUT = 8000
// Браузер держит ответ 5 минут: повторные заходы на те же страницы не тратят запросы Worker.
const BROWSER_TTL = 300
const UA = 'AnimeLife/1.0 (+https://animelife.top)'

const ID = '\\d{1,10}'
/** [путь, свежесть в секундах, разрешённые параметры]. Прочие параметры отбрасываются, чтобы не дробить кэш. */
const PATHS = [
  [/^\/api\/animes$/, (q) => (q.has('search') ? HOUR : 30 * MIN), ['page', 'limit', 'order', 'status', 'kind', 'season', 'score', 'genre', 'studio', 'rating', 'exclude_ids', 'search', 'censored', 'ids']],
  [new RegExp(`^/api/animes/${ID}$`), () => 6 * HOUR, []],
  [new RegExp(`^/api/animes/${ID}/(?:related|similar|screenshots|external_links|roles)$`), () => 12 * HOUR, []],
  [/^\/api\/calendar$/, () => 15 * MIN, ['censored']],
  [/^\/api\/genres$/, () => 7 * DAY, []],
  [/^\/api\/studios$/, () => 7 * DAY, []],
  [new RegExp(`^/api/characters/${ID}$`), () => DAY, []],
]
// GraphQL пропускаем только в виде, который шлёт withPosters: постеры пачки тайтлов (до 50).
const GRAPHQL = /^\{ animes\(ids: "\d{1,10}(?:,\d{1,10}){0,49}", limit: \d{1,2}\) \{ id poster \{ originalUrl mainUrl main2xUrl \} \} \}$/
const GRAPHQL_TTL = DAY

const jsonError = (status, error) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Разбирает запрос: адрес Shikimori, ключ кэша, свежесть и тело для POST. null — такого адреса нет. */
async function route(request, url) {
  const path = url.pathname.slice(PREFIX.length)
  if (path === '/api/graphql') {
    if (request.method !== 'POST') return null
    const text = await request.text()
    if (text.length > 2000) return null
    let query
    try {
      query = JSON.parse(text).query
    } catch {
      return null
    }
    if (typeof query !== 'string' || !GRAPHQL.test(query)) return null
    const body = JSON.stringify({ query })
    return { target: UPSTREAM + path, key: `${CACHE_ROOT}${path}?sha256=${await sha256(body)}`, ttl: GRAPHQL_TTL, body }
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const rule = PATHS.find(([re]) => re.test(path))
  if (!rule || url.search.length > 1000) return null
  const [, ttl, allowed] = rule
  // Параметры по алфавиту: один и тот же запрос с другим порядком попадает в ту же запись кэша.
  const params = new URLSearchParams([...url.searchParams].filter(([k]) => allowed.includes(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  const search = params.toString() ? `?${params}` : ''
  return { target: UPSTREAM + path + search, key: CACHE_ROOT + path + search, ttl: ttl(params) }
}

function reply(body, status, cache, maxAge = BROWSER_TTL) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Cache': cache,
    },
  })
}

/** Запрос к Shikimori с таймаутом. Возвращает ответ, который можно сохранить, или причину отказа. */
async function upstream(r) {
  let res
  try {
    res = await fetch(r.target, {
      method: r.body ? 'POST' : 'GET',
      body: r.body,
      headers: { Accept: 'application/json', 'User-Agent': UA, ...(r.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch {
    return { error: 504 }
  }
  const usable = res.ok || res.status === 404
  const isJson = (res.headers.get('Content-Type') ?? '').includes('json')
  if (!usable || !isJson) {
    // 429 и прочие 4xx отдаём с тем же кодом (на 429 приложение подождёт и повторит), сбои сервера — 502.
    const error = res.status >= 400 && res.status < 500 ? res.status : 502
    return { error, retryAfter: res.headers.get('Retry-After') }
  }
  const text = await res.text()
  // GraphQL при сбое отвечает 200 с errors и без data: такое не сохраняем.
  if (r.body && !text.includes('"data"')) return { error: 502 }
  return { status: res.status, text }
}

export async function shikiProxy(request, ctx) {
  const url = new URL(request.url)
  const r = await route(request, url)
  if (!r) return jsonError(404, 'not found')

  const key = new Request(r.key)
  const cached = await caches.default.match(key)
  const freshUntil = Number(cached?.headers.get('X-Fresh-Until')) || 0
  if (cached && Date.now() < freshUntil) return reply(cached.body, cached.status, 'HIT')

  const got = await upstream(r)
  if (got.error === undefined) {
    const ttl = got.status === 404 ? Math.min(r.ttl, NOT_FOUND_TTL) : r.ttl
    const stored = new Response(got.text, {
      status: got.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Запись живёт дольше свежести: просроченная копия выручает, когда Shikimori недоступен.
        'Cache-Control': `public, max-age=${ttl + STALE}`,
        'X-Fresh-Until': String(Date.now() + ttl * 1000),
      },
    })
    ctx.waitUntil(caches.default.put(key, stored).catch(() => undefined))
    return reply(got.text, got.status, 'MISS')
  }
  // Shikimori не ответил: отдаём последнюю копию, браузер спросит снова через минуту.
  if (cached) return reply(cached.body, cached.status, 'STALE', 60)
  const res = jsonError(got.error, got.error === 504 ? 'upstream timeout' : 'upstream error')
  res.headers.set('X-Cache', 'MISS')
  if (got.retryAfter) res.headers.set('Retry-After', got.retryAfter)
  return res
}

export const isShikiProxy = (pathname) => pathname.startsWith(PREFIX + '/')

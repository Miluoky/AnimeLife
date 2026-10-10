import { expect, test, type Page } from '@playwright/test'
import { mockServices, shikimoriFixture } from './mocks'
import { shikiProxy } from '../worker/shikiProxy.js'
import { yummyProxy } from '../worker/yummyProxy.js'
import worker from '../worker/index.js'

// Прокси Shikimori (/api/shiki, worker/shikiProxy.js): приложение на animelife.top ходит через него,
// остальные адреса — напрямую. Сам Worker проверяется без браузера, с подменёнными fetch и кэшем.

/**
 * Открывает сборку под адресом http://animelife.top: страницы и файлы берутся с vite preview,
 * а /api/shiki/* отвечает заготовками (или handler, если он что-то вернул).
 */
async function asProduction(page: Page, handler?: (path: string) => { status: number } | undefined) {
  const proxied: string[] = []
  await page.route('http://animelife.top/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/shiki/')) {
      const path = url.pathname.replace('/api/shiki/api', '')
      proxied.push(`${route.request().method()} ${path}`)
      const special = handler?.(path)
      if (special) return route.fulfill({ status: special.status, json: { error: 'busy' } })
      return route.fulfill({ json: shikimoriFixture(path, url.searchParams), headers: { 'X-Cache': 'HIT' } })
    }
    const res = await route.fetch({ url: `http://localhost:${process.env.PW_PORT ?? 4173}${url.pathname}${url.search}` })
    return route.fulfill({ response: res })
  })
  return proxied
}

const directApi = (page: Page) => {
  const list: string[] = []
  page.on('request', (r) => {
    if (/shikimori\.(io|one)\/api\//.test(r.url())) list.push(r.url())
  })
  return list
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('на animelife.top данные идут через /api/shiki, картинки — прямо с Shikimori', async ({ page }) => {
  const direct = directApi(page)
  const proxied = await asProduction(page)
  await page.goto('http://animelife.top/')
  await expect(page.locator('.hero__title')).toContainText('Ковбой Бибоп')
  await expect(page.getByRole('link', { name: /Ван-Пис/ }).first()).toBeVisible()
  const src = await page.locator('.poster-card img').first().getAttribute('src')
  expect(src).toMatch(/^https:\/\/shikimori\.io\/uploads\/.*main-.*\.webp$/)
  expect(proxied).toContain('GET /animes')
  expect(proxied).toContain('POST /graphql')
  expect(direct).toEqual([])
})

test('через прокси работает повтор после 429', async ({ page }) => {
  let refused = 0
  const proxied = await asProduction(page, (path) => (path === '/animes/1' && refused++ < 1 ? { status: 429 } : undefined))
  await page.goto('http://animelife.top/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  expect(proxied.filter((p) => p === 'GET /animes/1').length).toBeGreaterThanOrEqual(2)
})

test('на других адресах (локально, зеркала) — прямо в Shikimori', async ({ page }) => {
  const direct = directApi(page)
  const own: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/shiki/')) own.push(r.url())
  })
  await page.goto('/')
  await expect(page.locator('.hero__title')).toContainText('Ковбой Бибоп')
  expect(direct.some((u) => u.startsWith('https://shikimori.io/api/animes'))).toBe(true)
  expect(own).toEqual([])
})

// --- Worker без браузера ---

type Stored = Map<string, Response>
interface Upstream {
  url: string
  init: RequestInit
}

/** Подменяет caches.default, fetch и часы на время теста. */
function fakeEnv() {
  const store: Stored = new Map()
  const calls: Upstream[] = []
  const pending: Promise<unknown>[] = []
  let reply: (url: string) => Response | Promise<Response> = () => Response.json([{ id: 1 }])
  const clock = { now: Date.parse('2026-10-03T12:00:00Z') }
  const g = globalThis as Record<string, unknown>
  const saved = { caches: g.caches, fetch: g.fetch, now: Date.now }
  g.caches = {
    default: {
      match: async (req: Request) => store.get(req.url)?.clone(),
      // Как настоящий Cache API: тело читается целиком в момент сохранения.
      put: async (req: Request, res: Response) => void store.set(req.url, new Response(await res.arrayBuffer(), res)),
    },
  }
  g.fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return reply(String(url))
  }
  Date.now = () => clock.now
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) }
  return {
    store,
    calls,
    clock,
    ctx,
    respond: (fn: typeof reply) => (reply = fn),
    /** Дожидается фоновой работы Worker (ctx.waitUntil). */
    settle: async () => {
      while (pending.length) await Promise.all(pending.splice(0))
    },
    async call(path: string, init?: RequestInit) {
      const res = await shikiProxy(new Request(`https://animelife.top${path}`, init), ctx)
      await Promise.all(pending.splice(0))
      return { res, cache: res.headers.get('X-Cache'), body: await res.text() }
    },
    restore() {
      Object.assign(g, { caches: saved.caches, fetch: saved.fetch })
      Date.now = saved.now
    },
  }
}

test.describe('Worker: прокси Shikimori', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

  test('MISS, затем HIT; параметры по алфавиту, лишние отброшены, свой User-Agent', async () => {
    const env = fakeEnv()
    try {
      const first = await env.call('/api/shiki/api/animes?order=popularity&limit=1&utm=x')
      expect(first.cache).toBe('MISS')
      expect(first.body).toBe('[{"id":1}]')
      expect(first.res.headers.get('Cache-Control')).toBe('public, max-age=300')
      expect(env.calls[0].url).toBe('https://shikimori.io/api/animes?limit=1&order=popularity')
      expect((env.calls[0].init.headers as Record<string, string>)['User-Agent']).toBe('AnimeLife/1.0 (+https://animelife.top)')
      const second = await env.call('/api/shiki/api/animes?limit=1&order=popularity')
      expect(second.cache).toBe('HIT')
      expect(second.body).toBe(first.body)
      expect(env.calls).toHaveLength(1)
    } finally {
      env.restore()
    }
  })

  test('свежесть по типу запроса: расписание 15 минут, тайтл 6 часов', async () => {
    const env = fakeEnv()
    try {
      await env.call('/api/shiki/api/calendar?censored=true')
      await env.call('/api/shiki/api/animes/21')
      env.clock.now += 16 * 60_000
      expect((await env.call('/api/shiki/api/calendar?censored=true')).cache).toBe('MISS')
      expect((await env.call('/api/shiki/api/animes/21')).cache).toBe('HIT')
      env.clock.now += 6 * 3600_000
      expect((await env.call('/api/shiki/api/animes/21')).cache).toBe('MISS')
    } finally {
      env.restore()
    }
  })

  test('Shikimori недоступен: старая копия (STALE), без копии — 429 или 504', async () => {
    const env = fakeEnv()
    try {
      await env.call('/api/shiki/api/genres')
      env.clock.now += 8 * 24 * 3600_000
      env.respond(() => new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '2' } }))
      const stale = await env.call('/api/shiki/api/genres')
      expect(stale.cache).toBe('STALE')
      expect(stale.res.status).toBe(200)
      expect(stale.body).toBe('[{"id":1}]')
      expect(stale.res.headers.get('Cache-Control')).toBe('public, max-age=60')
      env.respond(() => new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }))
      expect((await env.call('/api/shiki/api/genres')).cache).toBe('STALE')
      env.respond(() => Promise.reject(new DOMException('timeout', 'TimeoutError')))
      expect((await env.call('/api/shiki/api/genres')).cache).toBe('STALE')

      env.respond(() => new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '2' } }))
      const busy = await env.call('/api/shiki/api/animes/5')
      expect(busy.res.status).toBe(429)
      expect(busy.res.headers.get('Retry-After')).toBe('2')
      expect(busy.res.headers.get('Cache-Control')).toBe('no-store')
      env.respond(() => Promise.reject(new DOMException('timeout', 'TimeoutError')))
      expect((await env.call('/api/shiki/api/animes/5')).res.status).toBe(504)
      // Ошибки не сохраняются.
      expect([...env.store.keys()].some((k) => k.includes('/animes/5'))).toBe(false)
    } finally {
      env.restore()
    }
  })

  test('429 без копии: Worker сам повторяет один раз, и зритель получает ответ', async () => {
    const env = fakeEnv()
    try {
      let n = 0
      env.respond(() => (n++ === 0 ? new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '1' } }) : Response.json([{ id: 7 }])))
      const got = await env.call('/api/shiki/api/animes?season=fall_2025')
      expect(got.res.status).toBe(200)
      expect(got.cache).toBe('MISS')
      expect(got.body).toBe('[{"id":7}]')
      expect(env.calls).toHaveLength(2)
    } finally {
      env.restore()
    }
  })

  test('404 от Shikimori кэшируется ненадолго', async () => {
    const env = fakeEnv()
    try {
      env.respond(() => Response.json({ message: 'Страница не найдена', code: 404 }, { status: 404 }))
      expect((await env.call('/api/shiki/api/animes/999')).res.status).toBe(404)
      expect((await env.call('/api/shiki/api/animes/999')).cache).toBe('HIT')
      env.clock.now += 11 * 60_000
      expect((await env.call('/api/shiki/api/animes/999')).cache).toBe('MISS')
    } finally {
      env.restore()
    }
  })

  test('GraphQL: только запрос постеров, ключ — хэш тела', async () => {
    const env = fakeEnv()
    try {
      env.respond(() => Response.json({ data: { animes: [] } }))
      const query = '{ animes(ids: "1,21", limit: 2) { id poster { originalUrl mainUrl main2xUrl } } }'
      const post = (q: string) =>
        env.call('/api/shiki/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })
      expect((await post(query)).cache).toBe('MISS')
      expect((await post(query)).cache).toBe('HIT')
      expect(env.calls[0].init.method).toBe('POST')
      expect(env.calls[0].init.body).toBe(JSON.stringify({ query }))
      expect([...env.store.keys()][0]).toMatch(/\/api\/graphql\?sha256=[0-9a-f]{64}$/)
      expect((await post('{ animes(ids: "5", limit: 1) { id poster { originalUrl mainUrl main2xUrl } } }')).cache).toBe('MISS')
      expect((await post('{ users { id } }')).res.status).toBe(404)
      // Ответ без data (ошибка GraphQL) не сохраняется.
      env.respond(() => Response.json({ errors: [{ message: 'busy' }] }))
      const failed = await post('{ animes(ids: "7", limit: 1) { id poster { originalUrl mainUrl main2xUrl } } }')
      expect(failed.res.status).toBe(502)
      expect(env.calls).toHaveLength(3)
    } finally {
      env.restore()
    }
  })

  test('чужие адреса и методы — 404 без запроса к Shikimori', async () => {
    const env = fakeEnv()
    try {
      for (const [path, init] of [
        ['/api/shiki/api/users/1/anime_rates', undefined],
        ['/api/shiki/api/animes/1/topics', undefined],
        ['/api/shiki/api/graphql', undefined],
        ['/api/shiki/oauth/token', undefined],
        ['/api/shiki/api/animes', { method: 'DELETE' }],
      ] as const) {
        expect((await env.call(path, init)).res.status, path).toBe(404)
      }
      expect(env.calls).toHaveLength(0)
    } finally {
      env.restore()
    }
  })

  test('убранный жанр «Магия»: старый адрес ведёт на «Фэнтези» (301)', async () => {
    const ctx = { waitUntil: () => undefined }
    const res = await worker.fetch(new Request('https://animelife.top/genre/magic?page=2'), {}, ctx)
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://animelife.top/genre/fantasy?page=2')
  })

  test('Worker отдаёт /api/shiki через прокси, а robots.txt закрывает /api/', async () => {
    const env = fakeEnv()
    try {
      const ctx = { waitUntil: () => undefined }
      const api = await worker.fetch(new Request('https://animelife.top/api/shiki/api/genres'), {}, ctx)
      expect(api.headers.get('X-Cache')).toBe('MISS')
      const robots = await (await worker.fetch(new Request('https://animelife.top/robots.txt'), {}, ctx)).text()
      expect(robots).toContain('Disallow: /api/\n')
    } finally {
      env.restore()
    }
  })
})

test.describe('Worker: кэш готовых страниц', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

  /** Worker с index.html версии version; HTMLRewriter в Node нет, поэтому страница — сам index.html. */
  function site(env: ReturnType<typeof fakeEnv>) {
    let version = '"v1"'
    const g = globalThis as Record<string, unknown>
    g.HTMLRewriter = class {
      on() {
        return this
      }
      transform(res: Response) {
        return new Response(res.body, res)
      }
    }
    const assets = { fetch: async () => new Response('<!doctype html><div id="root"></div>', { headers: { ETag: version, 'Content-Type': 'text/html' } }) }
    return {
      deploy: (v: string) => (version = v),
      async open(path: string, init?: RequestInit) {
        const before = env.calls.length
        const res = await worker.fetch(new Request(`https://animelife.top${path}`, init), { ASSETS: assets }, env.ctx)
        await env.settle()
        return { status: res.status, cache: res.headers.get('X-Page-Cache'), upstream: env.calls.length - before }
      },
    }
  }

  const fixture = (failing?: RegExp) => (url: string) => {
    const u = new URL(url.replace('/api/shiki', ''))
    if (failing?.test(u.pathname)) return new Response('busy', { status: 503 })
    return Response.json(shikimoriFixture(u.pathname.replace(/^\/api/, ''), u.searchParams))
  }

  test('страница собирается один раз, потом сразу из кэша; через 5 минут обновляется в фоне', async () => {
    const env = fakeEnv()
    try {
      env.respond(fixture())
      const s = site(env)
      const first = await s.open('/anime/1')
      expect([first.status, first.cache]).toEqual([200, 'MISS'])
      expect(first.upstream).toBeGreaterThan(0)
      expect(await s.open('/anime/1')).toMatchObject({ cache: 'HIT', upstream: 0 })
      env.clock.now += 6 * 60_000
      const stale = await s.open('/anime/1')
      // Зритель получил старую копию, а Worker в фоне собрал свежую.
      expect(stale.cache).toBe('STALE')
      expect(stale.upstream).toBeGreaterThan(0)
      expect(await s.open('/anime/1')).toMatchObject({ cache: 'HIT', upstream: 0 })
    } finally {
      env.restore()
    }
  })

  test('все страницы приложения отвечают 200, неизвестный адрес — 404', async () => {
    const env = fakeEnv()
    try {
      env.respond(fixture())
      const s = site(env)
      for (const path of ['/quiz', '/chat', '/admin/analytics', '/top', '/collections']) expect((await s.open(path)).status, path).toBe(200)
      expect((await s.open('/no-such-page')).status).toBe(404)
    } finally {
      env.restore()
    }
  })

  test('неполная страница, новая сборка сайта, комнаты и HEAD мимо кэша', async () => {
    const env = fakeEnv()
    try {
      // Похожие не ответили: страница отдаётся без них, но не сохраняется.
      env.respond(fixture(/\/similar$/))
      const s = site(env)
      expect((await s.open('/anime/1')).cache).toBe('MISS')
      expect((await s.open('/anime/1')).cache).toBe('MISS')
      env.respond(fixture())
      await s.open('/anime/1')
      expect((await s.open('/anime/1')).cache).toBe('HIT')
      s.deploy('"v2"')
      expect((await s.open('/anime/1')).cache).toBe('MISS')
      expect((await s.open('/together/ABC123')).cache).toBeNull()
      expect((await s.open('/anime/1', { method: 'HEAD' })).cache).toBeNull()
      // Тайтла нет: 404 тоже хранится.
      env.respond((url: string) => (url.includes('/animes/999') ? new Response('', { status: 404 }) : fixture()(url)))
      expect(await s.open('/anime/999')).toMatchObject({ status: 404, cache: 'MISS' })
      expect(await s.open('/anime/999')).toMatchObject({ status: 404, cache: 'HIT', upstream: 0 })
    } finally {
      env.restore()
    }
  })
})

test.describe('Worker: прокси серий YummyAnime', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

  const call = async (env: ReturnType<typeof fakeEnv>, path: string) => {
    const res = await yummyProxy(new Request(`https://animelife.top${path}`), env.ctx)
    await env.settle()
    return { res, cache: res.headers.get('X-Cache'), body: await res.text() }
  }

  test('отдаёт тело как есть и кэширует на час; при сбое — старая копия; чужие адреса — 404', async () => {
    const env = fakeEnv()
    try {
      env.respond(() => new Response('{"response":[{"number":"1"}]}', { headers: { 'Content-Type': 'application/json' } }))
      const first = await call(env, '/api/yummy/videos/10661')
      expect(first.cache).toBe('MISS')
      expect(first.body).toBe('{"response":[{"number":"1"}]}')
      expect(env.calls[0].url).toBe('https://api.yani.tv/anime/10661/videos')
      expect((await call(env, '/api/yummy/videos/10661')).cache).toBe('HIT')
      expect(env.calls).toHaveLength(1)
      env.clock.now += 2 * 3600_000
      // Ошибка YummyAnime приходит как JSON без списка: её не сохраняем, отдаём прошлую копию.
      env.respond(() => new Response('{"error":"Not found."}', { headers: { 'Content-Type': 'application/json' } }))
      const stale = await call(env, '/api/yummy/videos/10661')
      expect(stale.cache).toBe('STALE')
      expect(stale.body).toBe(first.body)
      expect((await call(env, '/api/yummy/videos/5')).res.status).toBe(502)
      expect((await call(env, '/api/yummy/videos/../search')).res.status).toBe(404)
      expect((await call(env, '/api/yummy/videos/abc')).res.status).toBe(404)
    } finally {
      env.restore()
    }
  })
})

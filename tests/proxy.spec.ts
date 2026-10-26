import { expect, test, type Page } from '@playwright/test'
import { mockServices, shikimoriFixture } from './mocks'
import { shikiProxy } from '../worker/shikiProxy.js'
import { seasonQuery } from '../src/api/seasonQuery'
import { yummyProxy } from '../worker/yummyProxy.js'
import worker from '../worker/index.js'
import { guard } from '../worker/guard.js'

/** Запрос к Worker, как его шлёт робот без браузера (curl): без Sec-Fetch-Mode, но с User-Agent. */
const visit = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { 'User-Agent': 'curl/8.5.0', ...(init.headers as Record<string, string> | undefined) } })

// Прокси Shikimori (/api/shiki, worker/shikiProxy.js): приложение на animelife.top ходит прямо к Shikimori,
// а через прокси — только если напрямую не вышло (сеть, 429, сбой). Сам Worker проверяется без браузера, с подменёнными fetch и кэшем.

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
    const local = new URL(url.pathname + url.search, test.info().project.use.baseURL).href
    // Под нагрузкой preview изредка рвёт соединение, которое клиент успел взять из keep-alive
    // («socket hang up»). Запрос за статикой безопасно повторить один раз.
    const res = await route.fetch({ url: local }).catch(() => route.fetch({ url: local }))
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

// Проверки заканчиваются раньше, чем страница догрузит всё: в простое она тянет код соседних страниц
// (prefetchNavigation), и route.fetch в asProduction ещё ждёт preview, когда Playwright закрывает
// контекст. Такой обработчик падал с «Target page, context or browser has been closed» — примерно
// раз из шести под нагрузкой. Снимаем подмены до закрытия, недоделанные запросы уже не важны.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})

test('на animelife.top данные идут прямо в Shikimori, а не через Worker', async ({ page }) => {
  const direct = directApi(page)
  const proxied = await asProduction(page)
  await page.goto('http://animelife.top/')
  await expect(page.locator('.hero__title')).toContainText('Ковбой Бибоп')
  await expect(page.getByRole('link', { name: /Ван-Пис/ }).first()).toBeVisible()
  const src = await page.locator('.poster-card img').first().getAttribute('src')
  expect(src).toMatch(/^https:\/\/shikimori\.io\/uploads\/.*main-.*\.webp$/)
  expect(direct.some((u) => u.startsWith('https://shikimori.io/api/animes'))).toBe(true)
  expect(direct.some((u) => u.startsWith('https://shikimori.io/api/graphql'))).toBe(true)
  expect(proxied).toEqual([])
})

test('Shikimori напрямую отказал и на повторе (429 или сеть): запрос уходит в прокси, дальше вкладка ходит через него', async ({ page }) => {
  const proxied = await asProduction(page)
  let refused = 0
  await page.route('https://shikimori.io/api/animes/1', (route) => (refused++ ? route.abort('connectionrefused') : route.fulfill({ status: 429, body: '' })))
  await page.goto('http://animelife.top/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  expect(proxied).toContain('GET /animes/1')
  // Первый отказ и один повтор напрямую, дальше — прокси.
  expect(refused).toBe(2)
  // Остальные запросы страницы после отказа тоже пошли через прокси.
  expect(proxied.length).toBeGreaterThan(1)
  expect(await page.evaluate(() => Number(sessionStorage.getItem('shiki.viaProxy')) > Date.now())).toBe(true)
})

test('одиночный отказ Shikimori (429 без CORS) не уводит вкладку в прокси: повтор напрямую через паузу', async ({ page }) => {
  const proxied = await asProduction(page)
  let calls = 0
  await page.route('https://shikimori.io/api/animes/1', (route) =>
    calls++ ? route.fulfill({ json: shikimoriFixture('/animes/1', new URLSearchParams()), headers: { 'Access-Control-Allow-Origin': '*' } }) : route.fulfill({ status: 429, body: '' }),
  )
  await page.goto('http://animelife.top/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  expect(calls).toBe(2)
  expect(proxied).not.toContain('GET /animes/1')
  expect(await page.evaluate(() => sessionStorage.getItem('shiki.viaProxy'))).toBeNull()
})

test('через прокси работает повтор после 429', async ({ page }) => {
  let refused = 0
  await page.addInitScript(() => sessionStorage.setItem('shiki.viaProxy', String(Date.now() + 600_000)))
  const proxied = await asProduction(page, (path) => (path === '/animes/1' && refused++ < 1 ? { status: 429 } : undefined))
  await page.goto('http://animelife.top/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  expect(proxied.filter((p) => p === 'GET /animes/1').length).toBeGreaterThanOrEqual(2)
})

test('переходы по старым адресам без Worker: /search?q= и убранный жанр ведут куда надо', async ({ page }) => {
  await page.goto('/search?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE')
  await expect(page).toHaveURL(/\/catalog\?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE$/)
  await page.goto('/genre/magic?page=2')
  await expect(page).toHaveURL(/\/genre\/fantasy\?page=2$/)
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

  test('GraphQL сезонного чарта: ровно запрос seasonQuery, другие поля — 404', async () => {
    const env = fakeEnv()
    try {
      env.respond(() => Response.json({ data: { animes: [] } }))
      const post = (q: string) =>
        env.call('/api/shiki/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })
      expect((await post(seasonQuery('fall_2026', 'tv', 1))).res.status).toBe(200)
      expect((await post(seasonQuery('winter_2027', 'ova,ona,special,tv_special', 2))).res.status).toBe(200)
      expect((await post(seasonQuery('fall_2026', 'tv', 1).replace('description', 'description users { id }'))).res.status).toBe(404)
      expect((await post(seasonQuery('fall_2026', 'music', 1))).res.status).toBe(404)
      expect(env.calls).toHaveLength(2)
      expect((await env.call('/api/shiki/api/people/5')).res.status).toBe(200)
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
    const res = await worker.fetch(visit('https://animelife.top/genre/magic?page=2'), {}, ctx)
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://animelife.top/genre/fantasy?page=2')
  })

  test('/search?q= ведёт в каталог с запросом (301), пустой — просто в каталог', async () => {
    const ctx = { waitUntil: () => undefined }
    const res = await worker.fetch(visit('https://animelife.top/search?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE'), {}, ctx)
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://animelife.top/catalog?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE')
    const empty = await worker.fetch(visit('https://animelife.top/search'), {}, ctx)
    expect(empty.headers.get('Location')).toBe('https://animelife.top/catalog')
  })

  test('Worker отдаёт /api/shiki через прокси, а robots.txt (обычный файл) закрывает /api/', async () => {
    const env = fakeEnv()
    try {
      const ctx = { waitUntil: () => undefined }
      const api = await worker.fetch(visit('https://animelife.top/api/shiki/api/genres'), {}, ctx)
      expect(api.headers.get('X-Cache')).toBe('MISS')
      const { readFileSync } = await import('node:fs')
      const robots = readFileSync('public/robots.txt', 'utf8')
      expect(robots).toContain('User-agent: *\nAllow: /\nDisallow: /api/\n')
      expect(robots).toContain('User-agent: Amazonbot\n')
      expect(robots).toContain('Sitemap: https://animelife.top/sitemap.xml')
      expect(robots).not.toMatch(/User-agent: (?:Googlebot|Yandex|Bingbot)\b/)
    } finally {
      env.restore()
    }
  })

  test('«О проекте» и «Приложение» есть в карте сайта', async () => {
    const ctx = { waitUntil: () => undefined }
    const xml = await (await worker.fetch(visit('https://animelife.top/sitemap-pages.xml'), {}, ctx)).text()
    for (const path of ['/about', '/app', '/catalog', '/rightholders']) expect(xml).toContain(`<loc>https://animelife.top${path}</loc>`)
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
        const res = await worker.fetch(visit(`https://animelife.top${path}`, init), { ASSETS: assets }, env.ctx)
        await env.settle()
        return { status: res.status, cache: res.headers.get('X-Page-Cache'), upstream: env.calls.length - before, location: res.headers.get('Location') }
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
      const first = await s.open('/anime/1-cowboy-bebop')
      expect([first.status, first.cache]).toEqual([200, 'MISS'])
      expect(first.upstream).toBeGreaterThan(0)
      expect(await s.open('/anime/1-cowboy-bebop')).toMatchObject({ cache: 'HIT', upstream: 0 })
      env.clock.now += 6 * 60_000
      const stale = await s.open('/anime/1-cowboy-bebop')
      // Зритель получил старую копию, а Worker в фоне собрал свежую.
      expect(stale.cache).toBe('STALE')
      expect(stale.upstream).toBeGreaterThan(0)
      expect(await s.open('/anime/1-cowboy-bebop')).toMatchObject({ cache: 'HIT', upstream: 0 })
    } finally {
      env.restore()
    }
  })

  test('адрес тайтла с названием: старый /anime/1 и неверное название ведут на /anime/1-cowboy-bebop (301)', async () => {
    const env = fakeEnv()
    try {
      env.respond(fixture())
      const s = site(env)
      const to = 'https://animelife.top/anime/1-cowboy-bebop'
      expect(await s.open('/anime/1')).toMatchObject({ status: 301, location: to })
      expect(await s.open('/anime/1/')).toMatchObject({ status: 301, location: to })
      expect(await s.open('/anime/1-old-name')).toMatchObject({ status: 301, location: to })
      expect(await s.open('/anime/1?ref=tg')).toMatchObject({ status: 301, location: `${to}?ref=tg` })
      expect((await s.open('/anime/1-cowboy-bebop')).status).toBe(200)
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

  test('каталог: список и постеры первой страницы приходят вместе с HTML, первый постер грузится сразу', async () => {
    const env = fakeEnv()
    const g = globalThis as Record<string, unknown>
    const head: string[] = []
    try {
      env.respond(fixture())
      // Подмена HTMLRewriter, которая запоминает, что Worker дописал в <head>.
      g.HTMLRewriter = class {
        handlers: [string, { element?: (el: unknown) => void }][] = []
        on(selector: string, h: { element?: (el: unknown) => void }) {
          this.handlers.push([selector, h])
          return this
        }
        transform(res: Response) {
          for (const [selector, h] of this.handlers)
            if (selector === 'head') h.element?.({ append: (html: string) => head.push(html) })
          return new Response(res.body, res)
        }
      }
      const assets = { fetch: async () => new Response('<!doctype html><div id="root"></div>', { headers: { ETag: '"v1"', 'Content-Type': 'text/html' } }) }
      const res = await worker.fetch(visit('https://animelife.top/catalog'), { ASSETS: assets }, env.ctx)
      await env.settle()
      expect(res.status).toBe(200)
      const html = head.join('')
      const data = JSON.parse(html.match(/<script id="shiki-preload" type="application\/json">(.*?)<\/script>/)![1])
      expect(Object.keys(data)).toContain('/animes?censored=true&limit=24&order=popularity&page=1')
      expect(Object.keys(data).some((k) => k.startsWith('graphql:{ animes(ids: '))).toBe(true)
      expect(html).toMatch(/<link rel="preload" as="image" href="[^"]+" imagesrcset="[^"]+ 1x, [^"]+ 2x" fetchpriority="high" \/>/)
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
      expect((await s.open('/anime/1-cowboy-bebop')).cache).toBe('MISS')
      expect((await s.open('/anime/1-cowboy-bebop')).cache).toBe('MISS')
      env.respond(fixture())
      await s.open('/anime/1-cowboy-bebop')
      expect((await s.open('/anime/1-cowboy-bebop')).cache).toBe('HIT')
      s.deploy('"v2"')
      expect((await s.open('/anime/1-cowboy-bebop')).cache).toBe('MISS')
      expect((await s.open('/together/ABC123')).cache).toBeNull()
      expect((await s.open('/anime/1-cowboy-bebop', { method: 'HEAD' })).cache).toBeNull()
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

test.describe('Worker: лимит вызовов и отсев роботов', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

  const ua = {
    googlebot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/141.0.7390.122 Safari/537.36',
    yandex: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    bing: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
    telegram: 'TelegramBot (like TwitterBot)',
    vk: 'Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)',
    facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    amazon: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36',
    meta: 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    semrush: 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  }
  const req = (path: string, agent: string, headers: Record<string, string> = {}) =>
    new Request(`https://animelife.top${path}`, { headers: { 'User-Agent': agent, ...headers } })
  const status = (v: ReturnType<typeof guard>) => (v instanceof Response ? v.status : v)

  test('поисковики и превью ссылок проходят всегда, сборщики и мусор — сразу отказ', () => {
    for (const agent of [ua.googlebot, ua.yandex, ua.bing, ua.telegram, ua.vk, ua.facebook]) {
      expect(status(guard(req('/anime/1', agent), new URL('https://animelife.top/anime/1'))), agent).toBe('welcome')
    }
    for (const agent of [ua.amazon, ua.meta, ua.semrush, 'python-requests/2.32', '']) {
      expect(status(guard(req('/anime/1', agent), new URL('https://animelife.top/anime/1'))), agent).toBe(403)
    }
    for (const path of ['/wp-login.php', '/.env', '/.git/config', '/xmlrpc.php', '/wp-content/x.js']) {
      expect(status(guard(req(path, ua.googlebot), new URL(`https://animelife.top${path}`))), path).toBe(410)
    }
    // Настоящий Chrome шлёт Sec-Fetch-Mode: обычная обработка. Без него — программа под видом Chrome.
    expect(guard(req('/anime/1', ua.chrome, { 'Sec-Fetch-Mode': 'cors' }), new URL('https://animelife.top/anime/1'))).toBeUndefined()
    expect(guard(req('/anime/1', ua.chrome), new URL('https://animelife.top/anime/1'))).toBe('plain')
    expect(status(guard(req('/api/shiki/api/genres', ua.chrome), new URL('https://animelife.top/api/shiki/api/genres')))).toBe(403)
    // curl и обычные проверки владельца не задеваются.
    expect(guard(req('/anime/1', 'curl/8.5.0'), new URL('https://animelife.top/anime/1'))).toBeUndefined()
  })

  test('поддельный Chrome получает простой index.html без запросов к Shikimori, сборщик — 403', async () => {
    const env = fakeEnv()
    try {
      const assets = { fetch: async () => new Response('<!doctype html><div id="root"></div>', { headers: { ETag: '"v1"', 'Content-Type': 'text/html' } }) }
      const plain = await worker.fetch(req('/anime/1', ua.chrome), { ASSETS: assets }, env.ctx)
      expect(plain.status).toBe(200)
      expect(await plain.text()).toContain('<div id="root">')
      expect((await worker.fetch(req('/no-such-page', ua.chrome), { ASSETS: assets }, env.ctx)).status).toBe(404)
      expect((await worker.fetch(req('/anime/1', ua.amazon), { ASSETS: assets }, env.ctx)).status).toBe(403)
      await env.settle()
      expect(env.calls).toHaveLength(0)
      expect(env.store.size).toBe(0)
    } finally {
      env.restore()
    }
  })

  test('Worker не запускается первым: переходы людей отдаются статикой, в обоих конфигах', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['wrangler.animelife.jsonc', 'wrangler.jsonc']) {
      const text = readFileSync(file, 'utf8')
      // Список путей выключил бы распознавание переходов (Sec-Fetch-Mode), и поисковики получали бы голый index.html.
      expect(text.match(/"run_worker_first": ([^\n,]*)/)![1], file).toBe('false')
      // Переходы людей отдаются без Worker только при этом режиме и дате совместимости не раньше 2025-04-01.
      expect(text, file).toContain('"not_found_handling": "single-page-application"')
      expect(text.match(/"compatibility_date": "(\d{4}-\d{2}-\d{2})"/)![1] >= '2025-04-01', file).toBe(true)
    }
  })
})

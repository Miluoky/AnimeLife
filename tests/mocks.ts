import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const animes = fixture('animes')
const anime = fixture('anime')
const genres = fixture('genres')
const posters = fixture('posters')

/** Заготовка ответа API Shikimori по пути без /api (/animes, /graphql…). Её же отдаёт подменённый прокси /api/shiki. */
export function shikimoriFixture(path: string, params: URLSearchParams): unknown {
  if (path === '/graphql') return posters
  if (path === '/genres') return genres
  if (path === '/calendar') return []
  if (path === '/animes') return animes.slice(0, Number(params.get('limit')) || animes.length)
  if (/^\/animes\/\d+$/.test(path)) return anime
  // related, similar, screenshots, roles, external_links и прочее
  return []
}

/** Счётчик случайных обращений к Appwrite в прогоне (должен оставаться 0). */
export function createAppwriteGuard() {
  let hits = 0
  return {
    hits: () => hits,
    route: async (page: Page) => {
      await page.route(/cloud\.appwrite\.io\/.*/, (route) => {
        hits += 1
        return route.fulfill({
          status: 503,
          json: { message: 'Appwrite retired: use /api/core stubs in tests', type: 'test_guard' },
        })
      })
    },
  }
}

const defaultCoreGet = (path: string) => {
  if (path === '/health' || path === '/') return { ok: true, backend: 'core', time: Date.now() }
  if (path.startsWith('/reviews')) return { reviews: [] }
  if (path === '/chat') return { messages: [] }
  if (path.startsWith('/rooms')) return { rooms: [], room: null, messages: [] }
  if (path.startsWith('/social/')) return { counts: { followers: 0, following: 0 }, following: false, feed: [], items: [] }
  return { ok: true }
}

/**
 * Подменяет внешние сервисы заготовками. Бэкенд — AnimeLife Core (`/api/core`), не Appwrite.
 */
export async function mockServices(page: Page) {
  const appwrite = createAppwriteGuard()
  await appwrite.route(page)
  ;(page as Page & { __appwriteGuard?: ReturnType<typeof createAppwriteGuard> }).__appwriteGuard = appwrite

  await page.route(/\/api\/core(\/.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\/core/, '') || '/'
    const method = route.request().method().toUpperCase()
    if (method === 'GET') {
      if (path === '/auth/me' || path === '/lists/me') {
        return route.fulfill({ status: 401, json: { message: 'Не вошли', code: 401 } })
      }
      return route.fulfill({ json: defaultCoreGet(path) })
    }
    if (method === 'POST' && path === '/action') {
      return route.fulfill({ status: 401, json: { message: 'Войдите', code: 401 } })
    }
    if (method === 'POST' && path.startsWith('/auth/')) {
      return route.fulfill({ status: 401, json: { message: 'Тест: войдите через route override', code: 401 } })
    }
    return route.fulfill({ status: 404, json: { message: `Core mock: нет заготовки для ${method} ${path}` } })
  })

  await page.route(/shikimori\.(io|one)\/api\/.*/, async (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: shikimoriFixture(url.pathname.replace('/api', ''), url.searchParams) })
  })
  await page.route(/shikimori\.(io|one)\/(system|uploads)\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.alloc(0) }),
  )
  await page.route(/challenges\.cloudflare\.com\/.*/, (route) => route.fulfill({ status: 204, body: '' }))
  // AniLibria по умолчанию ничего не находит (плеер показывает трейлер), трейлер YouTube — пустая страница.
  await page.route(/anilibria\.top\/api\/.*/, (route) => route.fulfill({ json: [] }))
  // AnimeVost по умолчанию тоже ничего не находит.
  await page.route(/api\.animevost\.org\/.*/, (route) => route.fulfill({ json: { state: { status: 'ok' } } }))
  // Dream Cast зеркала (api.dreamerscast.com, api.dreamcast.fun, dcast.online) по умолчанию ничего не находят (устраняет задержки 9-27с).
  await page.route(/(api\.dreamerscast\.com|api\.dreamcast\.fun|dcast\.online)\/.*/, (route) =>
    route.fulfill({ status: 200, json: { response: [] } }),
  )
  // Логотипы студий Anixart: прозрачный пиксель вместо картинки.
  await page.route(/s3\.anixmirai\.com\/.*/, (route) =>
    route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBAAA=', 'base64') }),
  )
  await page.route(/api\.anixart\.tv\/.*/, (route) => route.fulfill({ json: { code: 0, content: [], types: [], sources: [], episodes: [] } }))
  await page.route(/api\.yani\.tv\/.*/, (route) => route.fulfill({ json: { response: [] } }))
  // Опенинги и эндинги (AnimeThemes) и поиск по кадру (trace.moe) по умолчанию ничего не находят.
  await page.route(/api\.animethemes\.moe\/.*/, (route) => route.fulfill({ json: { anime: [] } }))
  await page.route(/api\.trace\.moe\/.*/, (route) => route.fulfill({ json: { result: [] } }))
  await page.route(/youtube\.com\/embed\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Трейлер</title>' }))
}

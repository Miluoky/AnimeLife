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

/**
 * Подменяет внешние сервисы заготовками. Любой список тайтлов отдаёт одни и те же 8 онгоингов,
 * любой тайтл — «Ковбоя Бибопа». Appwrite отвечает «не вошли», картинки — пустым ответом.
 */
export async function mockServices(page: Page) {
  await page.route(/shikimori\.(io|one)\/api\/.*/, async (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({ json: shikimoriFixture(url.pathname.replace('/api', ''), url.searchParams) })
  })
  await page.route(/shikimori\.(io|one)\/(system|uploads)\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.alloc(0) }),
  )
  await page.route(/cloud\.appwrite\.io\/.*/, (route) =>
    route.fulfill({ status: 401, json: { message: 'User (role: guests) missing scope (account)', type: 'general_unauthorized_scope' } }),
  )
  await page.route(/challenges\.cloudflare\.com\/.*/, (route) => route.fulfill({ status: 204, body: '' }))
  // AniLibria по умолчанию ничего не находит (плеер показывает трейлер), трейлер YouTube — пустая страница.
  await page.route(/anilibria\.top\/api\/.*/, (route) => route.fulfill({ json: [] }))
  // AnimeVost по умолчанию тоже ничего не находит.
  await page.route(/api\.animevost\.org\/.*/, (route) => route.fulfill({ json: { state: { status: 'ok' } } }))
  await page.route(/api\.anixart\.tv\/.*/, (route) => route.fulfill({ json: { code: 0, content: [], types: [], sources: [], episodes: [] } }))
  await page.route(/youtube\.com\/embed\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Трейлер</title>' }))
}

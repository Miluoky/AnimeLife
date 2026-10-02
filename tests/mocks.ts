import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const animes = fixture('animes')
const anime = fixture('anime')
const genres = fixture('genres')
const posters = fixture('posters')

/**
 * Подменяет внешние сервисы заготовками. Любой список тайтлов отдаёт одни и те же 8 онгоингов,
 * любой тайтл — «Ковбоя Бибопа». Appwrite отвечает «не вошли», картинки — пустым ответом.
 */
export async function mockServices(page: Page) {
  await page.route(/shikimori\.(io|one)\/api\/.*/, async (route) => {
    const url = new URL(route.request().url())
    const json = (body: unknown) => route.fulfill({ json: body })
    const path = url.pathname.replace('/api', '')
    if (path === '/graphql') return json(posters)
    if (path === '/genres') return json(genres)
    if (path === '/calendar') return json([])
    if (path === '/animes') return json(animes)
    if (/^\/animes\/\d+$/.test(path)) return json(anime)
    // related, similar, screenshots, roles, external_links и прочее
    return json([])
  })
  await page.route(/shikimori\.(io|one)\/(system|uploads)\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.alloc(0) }),
  )
  await page.route(/cloud\.appwrite\.io\/.*/, (route) =>
    route.fulfill({ status: 401, json: { message: 'User (role: guests) missing scope (account)', type: 'general_unauthorized_scope' } }),
  )
  await page.route(/challenges\.cloudflare\.com\/.*/, (route) => route.fulfill({ status: 204, body: '' }))
}

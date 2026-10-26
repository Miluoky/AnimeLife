import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

// Список манги у Shikimori устроен как список аниме: берём ту же заготовку.
const mangas = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8')).map(
  (a: Record<string, unknown>) => ({ ...a, kind: 'manga', volumes: 0, chapters: 0 }),
)

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/shikimori\.(io|one)\/api\/mangas\?.*/, (route) => route.fulfill({ json: mangas }))
})

test('раздел «Манга»: популярное, поиск в адресе, вид и полка «Читаю»', async ({ page }) => {
  const queries: URLSearchParams[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (/\/api\/(shiki\/api\/)?mangas$/.test(url.pathname)) queries.push(url.searchParams)
  })
  await page.addInitScript(() =>
    localStorage.setItem(
      'anime.mangaProgress.v1',
      JSON.stringify({ '2': { lang: 'ru', chapterId: 'abc', num: '12', at: 1, title: 'Берсерк', page: 5 } }),
    ),
  )
  await page.goto('/manga')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Манга')
  await expect(page.locator('.manga-reading a')).toHaveAttribute('href', '/manga/2/chapter/abc?lang=ru')
  await expect(page.locator('.manga-reading')).toContainText('Глава 12, стр. 5')
  const first = page.locator('.poster-card').first()
  await expect(first).toHaveAttribute('href', `/manga/${mangas[0].id}`)
  expect(queries[0].get('order')).toBe('popularity')
  expect(queries[0].get('kind')).toBe('manga,manhwa,manhua,one_shot')

  await page.getByRole('button', { name: 'Манхва' }).click()
  await expect(page).toHaveURL(/kind=manhwa/)
  await expect.poll(() => queries.some((q) => q.get('kind') === 'manhwa')).toBe(true)

  await page.getByRole('searchbox', { name: 'Название манги' }).fill('берсерк')
  await page.getByRole('button', { name: 'Найти' }).click()
  await expect(page).toHaveURL(/q=%D0%B1/)
  await expect.poll(() => queries.some((q) => q.get('search') === 'берсерк' && !q.has('order'))).toBe(true)
  await expect(page.locator('.manga-reading')).toHaveCount(0)
})

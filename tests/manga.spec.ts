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
  // Последняя русская глава «Берсерка» на MangaDex — 15-я.
  await page.route(/api\.mangadex\.org\/manga\/md-berserk\/feed.*/, (route) =>
    route.fulfill({ json: { data: [{ id: 'c15', attributes: { chapter: '15' }, relationships: [] }], total: 15 } }),
  )
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
      JSON.stringify({ '2': { lang: 'ru', chapterId: 'abc', num: '12', at: 1, title: 'Берсерк', page: 5, md: 'md-berserk' } }),
    ),
  )
  await page.goto('/manga')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Манга')
  await expect(page.locator('.manga-reading a')).toHaveAttribute('href', '/manga/2/chapter/abc?lang=ru')
  await expect(page.locator('.manga-reading')).toContainText('Глава 12, стр. 5')
  await expect(page.locator('.manga-reading__new')).toHaveText('Новых глав: 3')
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

test('место в манге синхронизируется с аккаунтом: с другого устройства приходит, своё уходит', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({
      json: {
        $id: 'u1',
        name: 'Аня',
        email: 'a@example.com',
        labels: [],
        status: true,
        prefs: { manga: { '5': { lang: 'en', chapterId: 'x5', num: '40', at: 2000, title: 'Ван-Пис' } } },
      },
    }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/.*\/tables\/lists\/rows\/u1$/, (route) => route.fulfill({ json: { $id: 'u1', data: '[]' } }))
  await page.route(/cloud\.appwrite\.io\/v1\/account\/prefs$/, (route) => {
    const prefs = (route.request().postDataJSON() as { prefs: Record<string, unknown> }).prefs
    sent.push(prefs)
    return route.fulfill({ json: { $id: 'u1', name: 'Аня', email: 'a@example.com', labels: [], status: true, prefs } })
  })
  await page.addInitScript(() =>
    localStorage.setItem('anime.mangaProgress.v1', JSON.stringify({ '2': { lang: 'ru', chapterId: 'abc', num: '12', at: 1000, title: 'Берсерк' } })),
  )
  await page.goto('/account')
  await expect.poll(() => sent.length).toBeGreaterThan(0)
  expect(Object.keys(sent[0].manga as object).sort()).toEqual(['2', '5'])
  await page.goto('/manga')
  await expect(page.locator('.manga-reading li')).toHaveCount(2)
  await expect(page.locator('.manga-reading li').first()).toContainText('Ван-Пис')
})

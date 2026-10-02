import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

const card = (id: string, title: string, episodes?: number) => ({
  id,
  title,
  kind: 'TV',
  episodes,
  ongoing: false,
  posterFill: '#333',
})

async function seedList(page: Page, list: unknown[]) {
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('anime.mylist.v1', JSON.stringify(data))
      sessionStorage.setItem('seeded', '1')
    }
  }, list)
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«+1 серия»: последняя серия переносит тайтл в «Просмотрено», можно отменить', async ({ page }) => {
  await seedList(page, [
    { anime: card('1', 'Ковбой Бибоп', 3), status: 'watching', addedAt: 1, updatedAt: 1, watched: 2 },
  ])
  await page.goto('/my-list')
  await expect(page.getByText('2 / 3 эп.')).toBeVisible()
  await page.getByRole('button', { name: 'Отметить серию 3 просмотренной' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ковбой Бибоп: «Просмотрено»' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Смотрю/ })).not.toContainText('1')
  await page.getByRole('status').getByRole('button', { name: 'Отменить' }).click()
  await expect(page.getByText('2 / 3 эп.')).toBeVisible()
})

test('плеер отмечает предыдущие серии просмотренными', async ({ page }) => {
  await seedList(page, [{ anime: card('1', 'Ковбой Бибоп', 26), status: 'planned', addedAt: 1, updatedAt: 1 }])
  await page.goto('/watch/1/5')
  await expect(page.getByRole('heading', { name: 'Серия 5' })).toBeVisible()
  await page.goto('/my-list')
  await page.getByRole('tab', { name: /Смотрю/ }).click()
  await expect(page.getByText('4 / 26 эп.')).toBeVisible()
})

test('импорт из Shikimori по нику', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/users\/[^/]+\/anime_rates.*/, (route) =>
    route.fulfill({
      json: [
        { score: 9, status: 'completed', episodes: 13, updated_at: '2026-01-01T00:00:00Z', anime: animes[4] },
        { score: 0, status: 'watching', episodes: 4, updated_at: '2026-01-02T00:00:00Z', anime: animes[5] },
        { score: 0, status: 'on_hold', episodes: 1, updated_at: '2026-01-03T00:00:00Z', anime: animes[7] },
      ],
    }),
  )
  await page.goto('/my-list')
  await page.getByText('Импорт и экспорт списка').click()
  await page.getByLabel('Ник на Shikimori').fill('https://shikimori.io/someone')
  await page.getByRole('button', { name: 'Импорт', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Импортировано 3: новых 3' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Смотрю/ })).toContainText('1')
  await expect(page.getByText('4 / 26 эп.')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Буду смотреть/ })).toContainText('1')
})

test('импорт из файла MyAnimeList и выгрузка обратно', async ({ page }) => {
  const xml = `<?xml version="1.0"?><myanimelist>
    <anime><series_animedb_id>21</series_animedb_id><my_watched_episodes>100</my_watched_episodes><my_score>10</my_score><my_status>Watching</my_status></anime>
    <anime><series_animedb_id>235</series_animedb_id><my_watched_episodes>0</my_watched_episodes><my_score>0</my_score><my_status>Plan to Watch</my_status></anime>
  </myanimelist>`
  await page.goto('/my-list')
  await page.getByText('Импорт и экспорт списка').click()
  await page.locator('.list-tools input[type=file]').setInputFiles({ name: 'animelist.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect(page.getByRole('status').filter({ hasText: 'Импортировано 2: новых 2' })).toBeVisible()
  await expect(page.getByText('100 эп.')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Для MAL (XML)' }).click()
  const file = await download
  const text = readFileSync(await file.path(), 'utf8')
  expect(text).toContain('<series_animedb_id>21</series_animedb_id>')
  expect(text).toContain('<my_status>Plan to Watch</my_status>')
})

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from '../mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))
const search = fixture('anilibria-search')
const rawRelease = fixture('anilibria-release')

const release = {
  ...rawRelease,
  episodes: rawRelease.episodes.map((ep: { ordinal: number; name?: string }) => ({
    ...ep,
    hls_480: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/480/stream.mp4`,
    hls_720: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/720/stream.mp4`,
    hls_1080: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/1080/stream.mp4`,
  })),
}

async function setupPlayerMock(page: import('@playwright/test').Page) {
  await mockServices(page)
  await page.route(/api\.dreamerscast\.com\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/api\.dreamcast\.fun\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/dcast\.online\/.*/, (r) => r.fulfill({ json: [] }))
  const clip = readFileSync(new URL('../fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.mp4/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: search }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))
}

test.beforeEach(async ({ page }) => {
  await setupPlayerMock(page)
})

test.describe('Tier 3: Cross-Feature Combinations', () => {
  test('catalog search -> select anime -> view title details -> open episode in player', async ({ page }) => {
    // 1. Start in catalog with search query
    await page.goto('/catalog?q=Cowboy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «Cowboy»')

    // 2. Click the anime card in results
    const card = page.locator('.poster-card').first()
    await expect(card).toBeVisible()
    await card.click()

    // 3. Verify title page loads
    await expect(page).toHaveURL(/\/anime\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
    await expect(page.getByRole('heading', { name: /Серии/ })).toBeVisible()

    // 4. Click link to episode 2
    const ep2Link = page.getByRole('link', { name: /Серия 2/ }).first()
    await expect(ep2Link).toBeVisible()
    await ep2Link.click()

    // 5. Verify player loads episode 2
    await expect(page).toHaveURL(/\/watch\/.*\/2$/)
    const video = page.locator('video.player-video')
    await expect(video).toBeAttached()
  })

  test('profile customization -> navigate to community -> verify style and podium cards', async ({ page }) => {
    // Mock profiles for community podium
    await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/profiles\/rows\?.*/, (route) => {
      return route.fulfill({
        json: {
          total: 3,
          rows: [
            { $id: 'u_1', name: 'DrStone', xp: 8000, weekXp: 750, monthXp: 2800, summary: '{"style":{"frame":"inferno"}}' },
            { $id: 'u_2', name: 'Gen', xp: 6000, weekXp: 550, monthXp: 2100, summary: '{"style":{"frame":"void"}}' },
            { $id: 'u_3', name: 'Suika', xp: 4000, weekXp: 350, monthXp: 1500, summary: '{"style":{"frame":"sakura_anim"}}' },
          ],
        },
      })
    })

    // 1. Visit account to set theme and accent
    await page.goto('/account')
    await page.getByRole('button', { name: 'Чёрный' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')

    // 2. Navigate to Community tab=top
    await page.goto('/community?tab=top')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')

    // 3. Verify community podium cards render with leader crown
    const podium = page.locator('.s-podium')
    await expect(podium).toBeVisible()
    await expect(page.locator('.s-podium__card--1 .s-podium__crown')).toHaveText('👑')
    await expect(page.locator('.s-podium__card--1')).toContainText('DrStone')
  })

  test('add to watchlist on title page -> verify in MyList -> launch directly from MyList', async ({ page }) => {
    // 1. Go to title page and add to 'watching'
    await page.goto('/anime/1')
    const statusSelect = page.getByLabel('Статус в моём списке')
    await expect(statusSelect).toBeVisible()
    await statusSelect.selectOption('watching')

    // 2. Navigate to MyList
    await page.goto('/my-list')
    await expect(page.getByRole('tab', { name: /Смотрю/ })).toBeVisible()
    await page.getByRole('tab', { name: /Смотрю/ }).click()

    // 3. Check item in list
    const listItem = page.locator('.list-item').first()
    await expect(listItem).toBeVisible()
    await expect(listItem).toContainText('Ковбой Бибоп')

    // 4. Click the card to launch title and player
    await listItem.locator('.poster-card').click()
    await expect(page).toHaveURL(/\/anime\/1/)
    const watchLink = page.getByRole('link', { name: /Смотреть|Серия 1/ }).first()
    await expect(watchLink).toBeVisible()
    await watchLink.click()

    await expect(page).toHaveURL(/\/watch\/1\/1$/)
  })

  test('search redirect -> catalog filter -> navigation to collections', async ({ page }) => {
    // 1. Hit redirect
    await page.goto('/search?q=Sunrise')
    await expect(page).toHaveURL(/\/catalog\?q=Sunrise$/)

    // 2. Click collections quick link
    const collectionsLink = page.getByRole('link', { name: 'Подборки' })
    await expect(collectionsLink).toBeVisible()
    await collectionsLink.click()

    // 3. Land on collections page
    await expect(page).toHaveURL(/\/collections$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('подборки: полки по запросам каталога, «Все» ведёт в каталог с теми же фильтрами', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (/\/animes$/.test(u.pathname)) asked.push(u.searchParams.get('genre') ?? '')
  })
  await page.goto('/catalog')
  await page.getByRole('link', { name: /Подборки/ }).first().click()
  await expect(page).toHaveURL(/\/collections$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Подборки' })).toBeVisible()
  const first = page.locator('section', { has: page.getByRole('heading', { name: 'С чего начать знакомство с аниме' }) })
  await expect(first.locator('.poster-card').first()).toBeVisible()

  // Полки ниже грузятся по мере прокрутки, в том числе с исключённым жанром.
  const comedy = page.getByRole('heading', { name: 'Комедии без романтики' })
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollBy(0, 600))
      return comedy.count()
    })
    .toBe(1)
  await expect.poll(() => asked).toContain('4,!22')
  await page.locator('section', { has: comedy }).getByRole('link', { name: /Все/ }).click()
  await expect(page).toHaveURL(/\/catalog\?genre=4&nogenre=22&score=7$/)
})

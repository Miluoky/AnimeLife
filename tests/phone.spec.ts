import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  await mockServices(page)
})

test('телефон: кнопка «Смотреть» в баннере видна на первом экране, над нижним меню', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const watch = page.locator('.hero .actions .btn').first()
  await expect(watch).toBeVisible()
  const [btn, dock] = await Promise.all([watch.boundingBox(), page.locator('.dock').boundingBox()])
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(dock!.y)
})

test('телефон: на странице тайтла полоска «Смотреть» появляется, когда кнопка уехала вверх', async ({ page }) => {
  await page.goto('/anime/1')
  const bar = page.locator('.sticky-watch')
  await expect(page.locator('.title-hero, main').first()).toBeVisible()
  await expect(bar).not.toHaveClass(/is-shown/)
  await page.locator('.episode-card').last().scrollIntoViewIfNeeded()
  await expect(bar).toHaveClass(/is-shown/)
  await expect(bar.getByRole('link', { name: 'Смотреть' })).toHaveAttribute('href', '/watch/1/1')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(bar).not.toHaveClass(/is-shown/)
})

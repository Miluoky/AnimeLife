import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«Что нового»: обновления по дням, ссылка из подвала и переход к разделу', async ({ page }) => {
  await page.goto('/top')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Что нового' }).click()
  await expect(page).toHaveURL(/\/changelog$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Что нового' })).toBeVisible()
  await expect(page.locator('.changelog__date').first()).toHaveText('26 октября 2026 г.')
  await page.getByRole('link', { name: 'Топ-100', exact: true }).click()
  await expect(page).toHaveURL(/\/top$/)
})

import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/community_chat\/rows(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        total: 2,
        rows: [
          { $id: 'first', userId: 'u1', name: 'Мика', text: 'Всем привет!', at: Date.now() - 60_000 },
          { $id: 'second', userId: 'u2', name: 'Аня', text: '<script>не запускать</script>', at: Date.now() },
        ],
      },
    }),
  )
})

test('общий чат показывает новые сообщения и оставляет гостю только чтение', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByRole('heading', { name: 'Общий чат' })).toBeVisible()
  await expect(page.getByText('Всем привет!')).toBeVisible()
  await expect(page.getByText('<script>не запускать</script>')).toBeVisible()
  await expect(page.locator('.community-chat__messages script')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Войдите' })).toHaveAttribute('href', '/account')
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveCount(0)
})

test('общий чат не создаёт горизонтальную прокрутку на телефоне', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/chat')
  await expect(page.getByText('Всем привет!')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  )
})
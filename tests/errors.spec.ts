import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('ошибки у посетителей: ошибка уходит в функцию один раз, сетевой шум не уходит', async ({ page }) => {
  const reports: Record<string, string>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    if (body.action === 'error-report') reports.push(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: '{"ok":true}' } })
  })
  await page.addInitScript(() => ((window as Window & { __reportErrors?: boolean }).__reportErrors = true))
  await page.goto('/')
  await page.evaluate(() => {
    const boom = () => {
      throw new Error('Проверка сбора ошибок')
    }
    setTimeout(boom)
    setTimeout(boom)
    void Promise.reject(new TypeError('Failed to fetch'))
  })
  await expect.poll(() => reports.length).toBe(1)
  await page.waitForTimeout(300)
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({ message: 'Error: Проверка сбора ошибок', path: '/' })
  expect(reports[0].browser).toMatch(/Chrome/)
})

test('ошибки у посетителей: администратор видит список и убирает исправленную', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'admin', name: 'Админ', email: 'a@example.com', labels: ['admin'], prefs: {}, status: true } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    sent.push(body)
    const reply =
      body.action === 'error-list'
        ? {
            errors: [
              { $id: 'e1', message: 'TypeError: x is undefined', source: 'Player.js:1:2', stack: 'at play (Player.js:1:2)', path: '/watch/1/2', browser: 'Chrome 129 / Android', count: 7, first: Date.now() - 86_400_000, last: Date.now() },
            ],
          }
        : body.action === 'notif-list'
          ? { items: [], unread: 0 }
          : body.action === 'error-clear'
            ? { ok: true }
            : { error: 'нет данных' }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
  })
  await page.goto('/admin/analytics')
  // Статистика не загрузилась, а ошибки всё равно видны.
  await expect(page.getByText('нет данных')).toBeVisible()
  const card = page.getByRole('region', { name: /^Ошибки у посетителей/ })
  await expect(card.getByRole('heading')).toHaveText('Ошибки у посетителей (1)')
  await expect(card).toContainText('TypeError: x is undefined')
  await expect(card).toContainText('7 раз')
  await expect(card).toContainText('/watch/1/2 · Chrome 129 / Android')
  await card.getByText('TypeError: x is undefined').click()
  await expect(card.locator('pre')).toHaveText('at play (Player.js:1:2)')
  await card.getByRole('button', { name: 'Исправлено, убрать' }).click()
  await expect(card).toContainText('Ошибок нет')
  expect(sent).toContainEqual({ action: 'error-clear', id: 'e1' })
})

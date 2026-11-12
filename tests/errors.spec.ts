import { expect, test } from '@playwright/test'
import { coreActionOk, coreHttp, mockCoreAction, mockCoreSession, mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('ошибки у посетителей: ошибка уходит в функцию один раз, сетевой шум не уходит', async ({ page }) => {
  const reports: Record<string, string>[] = []
  await mockCoreAction(page, (body) => {
    if (body.action === 'error-report') reports.push(body as Record<string, string>)
    return coreActionOk(body)
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
  await mockCoreSession(page, { $id: 'admin', name: 'Админ', email: 'a@example.com', labels: ['admin'] })
  await mockCoreAction(page, (body) => {
    sent.push(body)
    if (body.action === 'error-list') {
      return {
        errors: [
          { $id: 'e1', message: 'TypeError: x is undefined', source: 'Player.js:1:2', stack: 'at play (Player.js:1:2)', path: '/watch/1/2', browser: 'Chrome 129 / Android', count: 7, first: Date.now() - 86_400_000, last: Date.now() },
        ],
      }
    }
    if (body.action === 'analytics-stats') return coreHttp(500, { message: 'нет данных' })
    if (body.action === 'error-clear') return { ok: true }
    return coreActionOk(body)
  })
  await page.goto('/admin/analytics')
  await expect(page.locator('.notice--error')).toHaveText('нет данных')
  const card = page.getByRole('region', { name: /^Ошибки у посетителей/ })
  await expect(card.getByRole('heading')).toHaveText('Ошибки у посетителей (1)')
  await expect(card).toContainText('TypeError: x is undefined')
  await expect(card).toContainText('7 раз')
  await expect(card).toContainText('/watch/1/2 · Chrome 129 / Android')
  await card.getByText('TypeError: x is undefined').click()
  await expect(card.locator('pre')).toHaveText('at play (Player.js:1:2)')
  await card.getByRole('button', { name: 'Исправлено, убрать' }).click()
  await expect(card).toContainText('Ошибок нет')
  await expect.poll(() => sent.some((b) => b.action === 'error-clear' && b.id === 'e1')).toBe(true)
})

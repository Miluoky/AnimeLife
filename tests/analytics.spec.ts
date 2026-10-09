import { expect, test, type Page } from '@playwright/test'
import { mockServices } from './mocks'

const now = Date.now()
const hour = 3_600_000
const stats = {
  online: 7,
  onlinePages: [{ name: '/watch/52991/3', count: 4 }, { name: '/', count: 3 }],
  visitors: { today: 128, week: 640, month: 2210, all: 3400 },
  newVisitors: { today: 41, week: 300, month: 1500 },
  views: { today: 950, week: 5100, month: 17800 },
  episodes: { today: 210, week: 1300, month: 4800 },
  users: { all: 86, week: 12 },
  hours: Array.from({ length: 24 }, (_, i) => ({
    at: new Date(Math.floor(now / hour) * hour - (23 - i) * hour).toISOString(),
    views: 20 + ((i * 37) % 60),
    episodes: 5 + (i % 9),
    visitors: 6 + ((i * 13) % 20),
    newVisitors: 2,
  })),
  days: [],
  devices: [{ name: 'mobile', count: 1500 }, { name: 'desktop', count: 650 }, { name: 'tablet', count: 60 }],
  sources: [{ name: 'yandex', count: 900 }, { name: 'direct', count: 700 }, { name: 'telegram', count: 400 }, { name: 'google', count: 210 }],
  popular: [{ path: '/anime/52991', views: 1200 }, { path: '/top', views: 800 }],
  generatedAt: new Date(now).toISOString(),
}

async function signIn(page: Page, labels: string[]) {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u1', name: labels.length ? 'Miluoky' : 'Зритель', email: 'u@example.test', labels, prefs: {} } }),
  )
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

async function watchStats(page: Page) {
  const asked: string[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    asked.push(body.action)
    return route.fulfill({ status: 201, json: { responseStatusCode: 400, responseBody: '{"error":"Недостаточно прав."}' } })
  })
  return asked
}

test('гостю статистика не открывается', async ({ page }) => {
  const asked = await watchStats(page)
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: 'Доступ закрыт' })).toBeVisible()
  expect(asked).not.toContain('analytics-stats')
})

test('обычному пользователю статистика не открывается и не запрашивается', async ({ page }) => {
  const asked = await watchStats(page)
  await signIn(page, [])
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Статистика', exact: true })).toHaveCount(0)
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: 'Доступ закрыт' })).toBeVisible()
  expect(asked).not.toContain('analytics-stats')
})

test('администратор видит сводку в профиле и полную статистику', async ({ page }) => {
  await signIn(page, ['admin'])
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    const reply = body.action === 'analytics-stats' ? stats : { ok: true }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
  })

  await page.goto('/account')
  const card = page.getByRole('region', { name: 'Статистика сайта' })
  await expect(card.getByText('Онлайн сейчас')).toBeVisible()
  await expect(card.getByText('2 210')).toBeVisible()
  await card.getByRole('link', { name: 'Вся статистика' }).click()

  await expect(page.getByRole('heading', { name: 'Статистика сайта' })).toBeVisible()
  await expect(page.getByText('Поток за последние 24 часа')).toBeVisible()
  await expect(page.getByText('Яндекс')).toBeVisible()
  await expect(page.getByText('Телефоны')).toBeVisible()
  await expect(page.getByRole('link', { name: '/watch/52991/3' })).toBeVisible()
  await expect(page.locator('.an-chart').first().locator('.an-chart__col')).toHaveCount(24)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

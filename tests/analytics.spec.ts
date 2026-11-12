import { expect, test, type Page } from '@playwright/test'
import { coreActionOk, coreHttp, mockCoreAction, mockCoreSession, mockServices } from './mocks'

const now = Date.now()
const hour = 3_600_000
const stats = {
  online: 7,
  onlinePages: [{ name: '/watch/52991/3', count: 4 }, { name: '/', count: 3 }],
  visitors: { today: 128, week: 640, month: 2210, all: 3400, todayMsk: 95, weekMsk: 880, monthMsk: 4100 },
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
  funnel: {
    visitors: 100,
    titles: 60,
    episodes: 40,
    day1: { of: 80, back: 24 },
    day7: { of: 50, back: 12 },
  },
  sample: { sessions: 2210, capped: false, cohort: 100 },
  generatedAt: new Date(now).toISOString(),
}

async function signIn(page: Page, labels: string[]) {
  await mockCoreSession(page, { $id: 'u1', name: labels.length ? 'Miluoky' : 'Зритель', email: 'u@example.test', labels })
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

async function watchStats(page: Page) {
  const asked: string[] = []
  await mockCoreAction(page, (body) => {
    asked.push(String(body.action))
    if (body.action === 'analytics-stats') return coreHttp(403, { message: 'Недостаточно прав.' })
    return coreActionOk(body)
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
  await expect(page.getByRole('link', { name: 'Статистика сайта' })).toHaveCount(0)
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: 'Доступ закрыт' })).toBeVisible()
  expect(asked).not.toContain('analytics-stats')
})

test('администратор видит сводку в профиле и полную статистику', async ({ page }) => {
  await signIn(page, ['admin'])
  await mockCoreAction(page, (body) => (body.action === 'analytics-stats' ? stats : coreActionOk(body)))

  await page.goto('/account')
  const card = page.getByRole('region', { name: 'Статистика сайта' })
  await expect(card.getByText('Онлайн · 5 мин')).toBeVisible()
  await expect(card.getByText('Уник. сегодня · МСК')).toBeVisible()
  await expect(card.getByText('95', { exact: true })).toBeVisible()
  await card.getByRole('link', { name: 'Полный отчёт' }).click()

  await expect(page.getByRole('heading', { name: 'Статистика сайта' })).toBeVisible()
  await expect(page.getByText('Поток за последние 24 часа')).toBeVisible()
  await expect(page.getByText('Воронка новичков')).toBeVisible()
  await expect(page.getByText('Яндекс')).toBeVisible()
  await expect(page.getByText('Телефоны')).toBeVisible()
  await expect(page.getByRole('link', { name: '/watch/52991/3' })).toBeVisible()
  await expect(page.locator('.an-chart').first().locator('.an-chart__col')).toHaveCount(24)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

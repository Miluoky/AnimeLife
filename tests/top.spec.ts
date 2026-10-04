import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('топ-100: пьедестал из трёх, список с четвёртого места, вкладки и формат в адресе', async ({ page }) => {
  const queries: URLSearchParams[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (/\/api\/(shiki\/api\/)?animes$/.test(url.pathname)) queries.push(url.searchParams)
  })
  await page.goto('/top')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Топ-100: лучшие')
  await expect(page.locator('.podium__item')).toHaveCount(3)
  await expect(page.locator('.top-row__place').first()).toHaveText('4')
  expect(queries.some((q) => q.get('order') === 'ranked' && q.get('page') === '2')).toBe(true)

  await page.getByRole('tab', { name: 'Онгоинги' }).click()
  await page.getByRole('button', { name: 'Фильмы' }).click()
  await expect(page).toHaveURL(/tab=ongoing/)
  await expect(page).toHaveURL(/kind=movie/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Топ-100: онгоинги')
  await expect.poll(() => queries.some((q) => q.get('status') === 'ongoing' && q.get('kind') === 'movie')).toBe(true)
})

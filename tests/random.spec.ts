import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('что посмотреть: настроение уходит в запрос, барабан выдаёт тайтл, второй раз — другой', async ({ page }) => {
  const queries: URLSearchParams[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (/\/api\/(shiki\/api\/)?animes$/.test(url.pathname)) queries.push(url.searchParams)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/random')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Что посмотреть?')
  await page.getByRole('button', { name: /Посмеяться/ }).click()
  await page.getByRole('button', { name: 'Фильм' }).click()
  await page.getByRole('button', { name: 'Подобрать аниме' }).click()

  const pick = page.locator('.pick')
  await expect(pick).toBeVisible()
  const first = await pick.locator('.pick__title').innerText()
  expect(queries.at(-1)?.get('order')).toBe('random')
  expect(queries.at(-1)?.get('genre')).toBe('4')
  expect(queries.at(-1)?.get('kind')).toBe('movie')

  await page.getByRole('button', { name: 'Другой вариант' }).click()
  await expect(pick.locator('.pick__title')).not.toHaveText(first)
  await expect(page.locator('.random-seen__item')).toHaveCount(1)
})

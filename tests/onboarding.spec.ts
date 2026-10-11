import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('знакомство: новичок отмечает жанр и тайтлы, на главной появляются рекомендации', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/animes\/\d+\/similar/, (route) => route.fulfill({ json: animes }))
  const genreQueries: string[] = []
  page.on('request', (r) => {
    const g = new URL(r.url()).searchParams.get('genre')
    if (g && /shikimori/.test(r.url())) genreQueries.push(g)
  })
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Впервые у нас?' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Подобрать аниме' }).click()
  const dialog = page.getByRole('dialog', { name: 'Что вам нравится?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Готово' })).toBeDisabled()
  await dialog.getByRole('group', { name: 'Любимые жанры' }).getByRole('button', { name: 'Комедия' }).click()
  await expect.poll(() => genreQueries.includes('4')).toBe(true)
  const titles = dialog.getByRole('list', { name: 'Популярные аниме' }).getByRole('button')
  await titles.nth(0).click()
  await titles.nth(1).click()
  await expect(dialog.getByText('Отмечено: 2')).toBeVisible()
  await dialog.getByRole('button', { name: 'Готово' }).click()
  await expect(dialog).toBeHidden()
  await expect(card).toBeHidden()
  const taste = await page.evaluate(() => JSON.parse(localStorage.getItem('anime.taste.v1') ?? '{}'))
  expect(taste.done).toBe(true)
  expect(taste.genres).toEqual([4])
  expect(taste.liked).toHaveLength(2)
  await expect(page.getByText(/Подобрали по тому, что вы отметили/)).toBeVisible()
  // После перезагрузки карточка не возвращается.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Вам понравится' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Впервые у нас?' })).toHaveCount(0)
})

test('знакомство: «Не сейчас» прячет карточку, а у кого есть история, её нет', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Впервые у нас?' })
  await card.getByRole('button', { name: 'Не сейчас' }).click()
  await expect(card).toHaveCount(0)
  await page.evaluate(() => {
    localStorage.removeItem('anime.taste.v1')
    localStorage.setItem('anime.history.v1', JSON.stringify([{ animeId: '1', title: 'Ковбой Бибоп', episode: 2, total: 26, at: Date.now() }]))
  })
  await page.reload()
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Впервые у нас?' })).toHaveCount(0)
})

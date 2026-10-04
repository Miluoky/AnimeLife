import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('расписание: тайтлы из моего списка отмечены и фильтруются', async ({ page }) => {
  const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
  const calendar = [
    { next_episode: 4, next_episode_at: at(2), duration: 24, anime: animes[0] },
    { next_episode: 6, next_episode_at: at(26), duration: 24, anime: animes[1] },
    { next_episode: 8, next_episode_at: at(50), duration: 24, anime: animes[2] },
  ]
  await page.route(/\/api\/(shiki\/)?calendar/, (route) => route.fulfill({ json: calendar }))
  const mine = { id: String(animes[1].id), title: animes[1].russian, kind: 'TV', ongoing: true, posterFill: '#333', genres: [] }
  await page.addInitScript((entry) => {
    localStorage.setItem('anime.mylist.v1', JSON.stringify([{ anime: entry, status: 'watching', addedAt: 1 }]))
  }, mine)
  await page.goto('/schedule')

  await expect(page.locator('.schedule-row')).toHaveCount(3)
  const marked = page.locator('.schedule-row--mine')
  await expect(marked).toHaveCount(1)
  await expect(marked).toContainText('В списке')

  await page.getByRole('button', { name: /Из моего списка/ }).click()
  await expect(page).toHaveURL(/mine=1/)
  await expect(page.locator('.schedule-row')).toHaveCount(1)
  await expect(page.locator('.schedule-row')).toContainText('Серия 6')
  await page.getByRole('button', { name: 'Все онгоинги' }).click()
  await expect(page.locator('.schedule-row')).toHaveCount(3)
})

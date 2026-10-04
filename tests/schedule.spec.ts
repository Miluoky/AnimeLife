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

test('расписание: вышедшие сегодня свёрнуты, у ближайшей серии отсчёт, дни недели наверху', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-04T15:00:00') })
  const at = (h: number, m = 0) => new Date(2026, 9, 4, h, m).toISOString()
  const calendar = [
    ...[6, 7, 8, 9].map((h, i) => ({ next_episode: 1, next_episode_at: at(h), duration: 24, anime: animes[i] })),
    { next_episode: 5, next_episode_at: at(16, 30), duration: 24, anime: animes[4] },
    { next_episode: 7, next_episode_at: new Date(2026, 9, 5, 10).toISOString(), duration: 24, anime: animes[5] },
  ]
  await page.route(/\/api\/(shiki\/)?calendar/, (route) => route.fulfill({ json: calendar }))
  await page.goto('/schedule')

  const today = page.locator('.schedule-day').first()
  await expect(today.locator('.schedule-row')).toHaveCount(3)
  await expect(today.locator('.schedule-row__soon')).toHaveText('через 1 ч 30 мин')
  await today.getByRole('button', { name: 'Уже вышли сегодня: 4 · показать все' }).click()
  await expect(today.locator('.schedule-row')).toHaveCount(5)

  const chips = page.getByRole('navigation', { name: 'Дни недели' }).locator('.pill')
  await expect(chips).toHaveCount(2)
  await expect(chips.first()).toContainText('Сегодня')
})

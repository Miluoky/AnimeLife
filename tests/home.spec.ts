import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('главная: полка «Ближайшие серии» по расписанию на сутки вперёд', async ({ page }) => {
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
  const calendar = [
    { next_episode: 5, next_episode_at: hours(3), duration: 24, anime: animes[1] },
    { next_episode: 2, next_episode_at: hours(1), duration: 24, anime: animes[0] },
    { next_episode: 9, next_episode_at: hours(30), duration: 24, anime: animes[2] },
    { next_episode: 7, next_episode_at: hours(5), duration: 24, anime: animes[3] },
    { next_episode: 3, next_episode_at: hours(8), duration: 24, anime: animes[4] },
  ]
  await page.route(/\/api\/(shiki\/)?calendar/, (route) => route.fulfill({ json: calendar }))
  await page.goto('/')
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Ближайшие серии' }) })
  // Четыре серии в пределах суток, по времени выхода; та, что через 30 часов, не попадает.
  await expect(shelf.locator('.poster-card')).toHaveCount(4)
  await expect(shelf.locator('.poster-card').first()).toContainText('2 эп.')
  await expect(shelf.getByRole('link', { name: /Расписание/ })).toHaveAttribute('href', '/schedule')
})

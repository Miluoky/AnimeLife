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

test('главная: «Новые серии в вашем списке» по расписанию и прогрессу', async ({ page }) => {
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
  await page.route(/\/api\/(shiki\/)?calendar/, (route) =>
    route.fulfill({
      json: [
        { next_episode: 6, next_episode_at: hours(2), duration: 24, anime: animes[0] },
        { next_episode: 4, next_episode_at: hours(5), duration: 24, anime: animes[1] },
      ],
    }),
  )
  const entry = (a: { id: number; russian: string }, watched: number) => ({
    anime: { id: String(a.id), title: a.russian, kind: 'TV', ongoing: true, posterFill: '#333', genres: [] },
    status: 'watching',
    addedAt: 1,
    watched,
  })
  // Первый тайтл: вышло 5 серий, просмотрено 3. Второй: вышло 3, просмотрено 3 — на полку не попадает.
  await page.addInitScript((list) => localStorage.setItem('anime.mylist.v1', JSON.stringify(list)), [entry(animes[0], 3), entry(animes[1], 3)])
  await page.goto('/')
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Новые серии в вашем списке' }) })
  await expect(shelf.locator('.poster-card')).toHaveCount(1)
  await expect(shelf.locator('.poster-card__tag')).toHaveText('Новых серий: 2')
})

test('главная: плитки жанров ведут на страницы жанров', async ({ page }) => {
  await page.goto('/')
  const tiles = page.locator('.genre-tile')
  await expect(tiles).toHaveCount(12)
  await expect(tiles.filter({ hasText: 'Романтика' })).toHaveAttribute('href', '/genre/romance')
  await tiles.filter({ hasText: 'Меха' }).click()
  await expect(page).toHaveURL(/\/genre\/mecha$/)
})

test('главная: карточки «Ещё на сайте» ведут в мини-игру, подбор и подборки', async ({ page }) => {
  await page.goto('/')
  const cards = page.getByRole('region', { name: 'Ещё на сайте' }).getByRole('link')
  await expect(cards).toHaveCount(3)
  await cards.filter({ hasText: 'Угадай по кадру' }).click()
  await expect(page).toHaveURL(/\/quiz$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Угадай аниме по кадру')
})

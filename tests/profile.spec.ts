import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('первое добавление в список открывает достижение', async ({ page }) => {
  await page.goto('/anime/1')
  // Достижения подключаются, когда браузер свободен.
  await page.waitForTimeout(2000)
  await page.getByLabel('Статус в моём списке').selectOption('planned')
  await expect(page.getByRole('status').filter({ hasText: 'Достижение: «Первый шаг»' })).toBeVisible()
  await page.goto('/account')
  await expect(page.locator('.badge--on')).toContainText('Первый шаг')
})

test('открытый профиль показывает списки и достижения', async ({ page }) => {
  const card = (id: string, title: string) => ({ id, title, kind: 'TV', ongoing: false, posterFill: '#333', episodes: 12 })
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/profiles\/rows\/u1/, (route) =>
    route.fulfill({
      json: {
        $id: 'u1',
        name: 'Мика',
        about: 'Смотрю всё про космос',
        updatedAt: Date.now(),
        summary: JSON.stringify({
          facts: { total: 3, completed: 1, planned: 1, watchingOngoing: 0, episodes: 17, rated: 1 },
          counts: { watching: 1, completed: 1, planned: 1 },
          meanRating: 9,
          favorites: [card('1', 'Ковбой Бибоп')],
          watching: [{ ...card('2', 'Планеты'), watched: 5 }],
          recent: [card('1', 'Ковбой Бибоп')],
          achievements: ['first', 'owl'],
        }),
      },
    }),
  )
  await page.goto('/u/u1')
  await expect(page.getByRole('heading', { name: 'Мика' })).toBeVisible()
  await expect(page.getByText('Смотрю всё про космос')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Смотрит сейчас' })).toBeVisible()
  await expect(page.getByText('5 / 12 эп.')).toBeVisible()
  await expect(page.locator('.badge--on')).toHaveCount(2)
})

test('скрытый профиль', async ({ page }) => {
  await page.goto('/u/nobody')
  await expect(page.getByRole('heading', { name: 'Профиль скрыт' })).toBeVisible()
})

test('обсуждение серии: спойлер скрыт до нажатия', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/comments\/rows\?.*/, (route) =>
    route.fulfill({
      json: {
        total: 2,
        rows: [
          { $id: 'c1', animeId: '1', episode: 2, userId: 'u', name: 'Аня', text: 'Спайк выживет', spoiler: true, at: Date.now() - 60_000 },
          { $id: 'c2', animeId: '1', episode: 2, userId: 'u', name: 'Боря', text: 'Классная музыка', spoiler: false, at: Date.now() - 3_600_000 },
        ],
      },
    }),
  )
  await page.goto('/watch/1/2')
  const block = page.getByRole('region', { name: 'Обсуждение серии 2' })
  await expect(block.getByText('Классная музыка')).toBeVisible()
  await expect(block.getByText('Спайк выживет')).toHaveCount(0)
  await block.getByRole('button', { name: 'Показать спойлер' }).click()
  await expect(block.getByText('Спайк выживет')).toBeVisible()
  await expect(block.getByRole('link', { name: 'Войдите' })).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const anime = JSON.parse(readFileSync(new URL('./fixtures/anime.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('тайтл-онгоинг: таймер до следующей серии и фильтр видео по виду', async ({ page }) => {
  const nextAt = new Date(Date.now() + (2 * 86400 + 3 * 3600 + 5 * 60) * 1000).toISOString()
  const ongoing = {
    ...anime,
    status: 'ongoing',
    episodes_aired: 7,
    next_episode_at: nextAt,
    videos: [
      ...anime.videos,
      { id: 9, kind: 'op', name: 'Tank!', hosting: 'youtube', player_url: 'http://youtube.com/embed/n2rVnRwW0h8', url: '', image: '' },
    ],
  }
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) => route.fulfill({ json: ongoing }))
  // Тестовый браузер сразу отвечает «уведомления запрещены»: делаем вид, что пользователь ещё не решал.
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }))
  await page.goto('/anime/1')

  const timer = page.getByRole('timer')
  await expect(timer).toContainText('Серия 8 выйдет через')
  await expect(timer.locator('.next-ep__part').first()).toHaveText(/^2\s*дн$/)

  // Колокольчик есть только у онгоингов и анонсов.
  await expect(page.getByRole('button', { name: 'Сообщить о новой серии' })).toHaveAttribute('aria-pressed', 'false')

  const kinds = page.getByRole('group', { name: 'Какие видео показать' })
  await expect(kinds.getByRole('button')).toHaveText(['Все · 3', 'Трейлер · 2', 'Опенинг · 1'])
  await kinds.getByRole('button', { name: 'Опенинг · 1' }).click()
  await expect(page.locator('.video-card')).toHaveCount(1)
  await expect(page.locator('.video-card')).toContainText('Опенинг: Tank!')
})

test('вышедший тайтл: без таймера и без фильтра, когда видео одного вида', async ({ page }) => {
  await page.goto('/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page.locator('.video-card').first()).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Сообщить о новой серии' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Какие видео показать' })).toHaveCount(0)
})

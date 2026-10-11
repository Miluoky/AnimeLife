import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('экономия трафика: постеры без версии 2x и облегчённый режим, настройка в профиле', async ({ page }) => {
  await page.goto('/catalog')
  const poster = page.locator('.poster-card img').first()
  await expect(poster).toHaveAttribute('srcset', /2x/)

  await page.goto('/account')
  await page.getByRole('group', { name: 'Экономия трафика' }).getByRole('button', { name: 'Всегда' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1')

  await page.goto('/catalog')
  await expect(page.locator('.poster-card img').first()).toBeVisible()
  await expect(page.locator('.poster-card img').first()).not.toHaveAttribute('srcset', /.+/)
  // Стартовый скрипт ставит облегчённый режим сразу, до загрузки приложения.
  await expect(page.locator('html')).toHaveAttribute('data-lite', '1')

  await page.goto('/account')
  await page.getByRole('group', { name: 'Экономия трафика' }).getByRole('button', { name: 'Выключена' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-lite', '1')
})

test('без сети: плашка «Нет сети», потом «Сеть вернулась»', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.offline-notice')).toHaveCount(0)
  // Плашка скачивается заранее, пока сеть есть.
  await page.waitForResponse(/OfflineNotice/)
  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'Нет сети' })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: 'Сеть вернулась' })).toBeVisible()
  await expect(page.locator('.offline-notice')).toHaveCount(0, { timeout: 8000 })
})

test('без сети: раздел, который ещё не скачан, объясняет, что случилось', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.hero, .hero--loading').first()).toBeVisible()
  await context.setOffline(true)
  // Переход внутри приложения, как по ссылке: код викторины ещё не скачан.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/quiz')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Нет интернета' })).toBeVisible({ timeout: 15_000 })
})

test('сборка: список файлов для офлайна без hls.js', () => {
  test.skip(test.info().project.name !== 'desktop', 'без браузера, достаточно одного прогона')
  const files = JSON.parse(readFileSync(new URL('../dist/precache.json', import.meta.url), 'utf8')) as string[]
  expect(files.length).toBeGreaterThan(20)
  expect(files.every((f) => f.startsWith('assets/'))).toBe(true)
  expect(files.some((f) => /^assets\/index-.+\.js$/.test(f))).toBe(true)
  expect(files.some((f) => f.startsWith('assets/hls'))).toBe(false)
})

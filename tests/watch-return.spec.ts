import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

// Конец серии работает на возврат: вход для гостя после второй серии, напоминание ботом, похожее после финала.

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

const logTwo = () => {
  const day = new Date().toISOString().slice(0, 10)
  localStorage.setItem(
    'anime.watchlog.v1',
    JSON.stringify({ entries: [1, 2].map((e) => ({ d: day, h: 20, at: Date.now(), a: '1', e, m: 24 })), titles: {} }),
  )
}

test('гость после второй серии: предложение войти через Telegram, «Не сейчас» прячет его насовсем', async ({ page }) => {
  await page.addInitScript(logTwo)
  await page.goto('/watch/1/2')
  const nudge = page.getByRole('complementary', { name: 'Сохранить прогресс' })
  await expect(nudge).toContainText('Прогресс сохранён в этом браузере')
  await expect(nudge.getByRole('link', { name: 'Войти через Telegram' })).toHaveAttribute('href', '/account')
  await nudge.getByRole('button', { name: 'Не сейчас' }).click()
  await expect(nudge).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Сохранить прогресс' })).toHaveCount(0)
})

test('гость на первой серии: не пристаём', async ({ page }) => {
  await page.goto('/watch/1/1')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('complementary', { name: 'Сохранить прогресс' })).toHaveCount(0)
})

test('досмотрел вышедший тайтл: три похожих, начатое не советуем', async ({ page }) => {
  const animes = fixture('animes')
  await page.addInitScript((card) => {
    localStorage.setItem('anime.mylist.v1', JSON.stringify([{ anime: card, status: 'completed', addedAt: Date.now() }]))
  }, { id: String(animes[0].id), title: animes[0].russian })
  await page.route(/\/api\/(shiki\/)?animes\/1\/similar/, (route) => route.fulfill({ json: animes.slice(0, 5) }))
  await page.goto('/watch/1/26')
  const similar = page.getByRole('region', { name: 'Что посмотреть дальше' })
  await expect(similar.getByRole('heading', { name: 'Досмотрели? Вот похожее' })).toBeVisible()
  await expect(similar.locator('.poster-card')).toHaveCount(3)
  await expect(similar).not.toContainText(animes[0].russian)
})

test('последняя вышедшая серия у вошедшего через Telegram: «Напоминать» включает бота', async ({ page }) => {
  const anime = fixture('anime')
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) =>
    route.fulfill({ json: { ...anime, status: 'ongoing', episodes: 12, episodes_aired: 7, next_episode_at: new Date(Date.now() + 86400_000).toISOString() } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'tg_123', name: 'Зритель', email: '', labels: [], prefs: {}, status: true } }),
  )
  const actions: string[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(JSON.parse(route.request().postData()!).body)
    actions.push(body.action)
    const reply = body.action === 'tg-status' ? { configured: true, on: false } : { ok: true }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
  })
  await page.goto('/watch/1/7')
  const reminder = page.getByRole('complementary', { name: 'Напоминание о серии' })
  await reminder.getByRole('button', { name: 'Напоминать' }).click()
  await expect(page.getByText('Готово: бот напишет о новых сериях')).toBeVisible()
  await expect(reminder).toHaveCount(0)
  expect(actions).toContain('tg-subscribe')
})

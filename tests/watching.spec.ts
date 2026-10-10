import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))
const byId = (id: number) => animes.find((a: { id: number }) => a.id === id)

async function seed(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    localStorage.setItem(
      'anime.mylist.v1',
      JSON.stringify([
        // Блич: вышло 8 серий, посмотрено 6 — ждут 7-я и 8-я.
        { anime: { id: '60636', title: 'Блич', kind: 'TV', ongoing: true, posterFill: '#333' }, status: 'watching', addedAt: 1, updatedAt: 1, watched: 6 },
        // Книжный червь: всё вышедшее (23) уже посмотрено, следующая серия завтра.
        { anime: { id: '57466', title: 'Книжный червь', kind: 'TV', ongoing: true, posterFill: '#333' }, status: 'watching', addedAt: 1, updatedAt: 1, watched: 23 },
      ]),
    )
    sessionStorage.setItem('seeded', '1')
  })
  await page.route(/shikimori\.(io|one)\/api\/calendar.*/, (route) =>
    route.fulfill({
      json: [{ next_episode: 24, next_episode_at: new Date(Date.now() + 26 * 3600_000).toISOString(), anime: byId(57466) }],
    }),
  )
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«Смотрю»: вышедшая серия открывается сразу в плеере, галочка отмечает её просмотренной', async ({ page }) => {
  await seed(page)
  await page.goto('/watching')
  await expect(page.getByRole('heading', { level: 1, name: 'Смотрю' })).toBeVisible()
  const ready = page.locator('.ep-list')
  await expect(ready.locator('.ep-card')).toHaveCount(1)
  await expect(ready).toContainText('Серия 7 · ещё 1 после неё')
  await expect(ready).toContainText('Новая серия')
  // Ближайшая серия онгоинга, у которого всё посмотрено.
  await expect(page.locator('.soon-list')).toContainText('Серия 24')

  await page.getByRole('button', { name: /Отметить 7 серию .* просмотренной/ }).click()
  await expect(ready).toContainText('Серия 8')
  await page.getByRole('link', { name: /смотреть 8 серию/ }).click()
  await expect(page).toHaveURL(/\/watch\/60636\/8$/)
})

test('счётчик новых серий на вкладке «Смотрю» в нижнем меню', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'нижнее меню только на телефоне')
  await seed(page)
  await page.goto('/catalog')
  const tab = page.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('link', { name: /Смотрю/ })
  await expect(tab).toHaveAccessibleName('Смотрю: новых серий 1', { timeout: 10_000 })
  await tab.click()
  await expect(page).toHaveURL(/\/watching$/)
  // Открыли вкладку — новости прочитаны, кружок пропал, а подсветка карточки осталась.
  await expect(tab).toHaveAccessibleName('Смотрю')
  await expect(page.locator('.ep-card--fresh')).toHaveCount(1)
})

test('пустая вкладка «Смотрю» подсказывает, что делать', async ({ page }) => {
  await page.goto('/watching')
  await expect(page.getByRole('heading', { name: 'Пока не за чем следить' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Выбрать онгоинг' })).toBeVisible()
})

test('шторка «Ещё»: профиль и остальные разделы', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'нижнее меню только на телефоне')
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Разделы сайта' })
  await nav.getByRole('button', { name: 'Ещё' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ещё разделы' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: /Войти/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await nav.getByRole('button', { name: 'Ещё' }).click()
  await sheet.getByRole('link', { name: /График/ }).click()
  await expect(page).toHaveURL(/\/schedule$/)
  await expect(sheet).toBeHidden()
  // Раздел из шторки подсвечивает «Ещё».
  await expect(nav.getByRole('button', { name: 'Ещё' })).toHaveClass(/active/)
})

test('нижнее меню уезжает при прокрутке вниз и возвращается при прокрутке вверх', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'нижнее меню только на телефоне')
  await page.goto('/catalog')
  await expect(page.locator('.poster-card').first()).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Разделы сайта' })
  await page.evaluate(() => document.documentElement.style.setProperty('min-height', '4000px'))
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect(nav).not.toBeInViewport()
  await page.evaluate(() => window.scrollTo(0, 500))
  await expect(nav).toBeInViewport()
})

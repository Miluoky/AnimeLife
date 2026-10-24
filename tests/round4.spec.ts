import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))
const bebop = { id: '1', title: 'Ковбой Бибоп', kind: 'TV', episodes: 26, ongoing: false, posterFill: '#333' }

async function seedList(page: Page, list: unknown[]) {
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('anime.mylist.v1', JSON.stringify(data))
      sessionStorage.setItem('seeded', '1')
    }
  }, list)
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«Не интересно»: тайтл пропадает из рекомендаций, можно отменить и вернуть все', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/animes\/\d+\/similar/, (route) => route.fulfill({ json: animes }))
  await seedList(page, [{ anime: bebop, status: 'completed', addedAt: 1, updatedAt: 1, rating: 9 }])
  await page.goto('/')
  const recs = page.locator('section', { has: page.getByRole('heading', { name: 'Вам понравится' }) })
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length)
  await recs.getByRole('button', { name: 'Не интересно: Ван-Пис' }).click()
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length - 1)
  await expect(recs.getByText('Скрыто: 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length)

  await recs.getByRole('button', { name: 'Не интересно: Син-тян' }).click()
  await page.reload()
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length - 1)
  await expect(recs.getByRole('button', { name: 'Не интересно: Син-тян' })).toHaveCount(0)
  await recs.getByRole('button', { name: 'Вернуть' }).click()
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length)
})

test('«Вам понравится» без списка: подбор по истории просмотра, начатое не советуем', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/animes\/\d+\/similar/, (route) => route.fulfill({ json: animes }))
  const started = animes[0]
  await page.addInitScript((history) => localStorage.setItem('anime.history.v1', JSON.stringify(history)), [
    { animeId: '1', title: 'Ковбой Бибоп', posterFill: '#333', episode: 4, totalEpisodes: 26, updatedAt: 2 },
    { animeId: String(started.id), title: started.russian || started.name, posterFill: '#333', episode: 1, totalEpisodes: 12, updatedAt: 1 },
  ])
  await page.goto('/')
  const recs = page.locator('section', { has: page.getByRole('heading', { name: 'Вам понравится' }) })
  await expect(recs.getByText(/Подобрали по тому, что вы смотрите/)).toContainText('«Ковбой Бибоп»')
  // Тайтл из истории уже в «Продолжить просмотр»: в советах его нет.
  await expect(recs.locator('.rec-card')).toHaveCount(animes.length - 1)
})

test('«Моя запись»: заметка, пересмотры и даты сохраняются, дата начала ставится сама', async ({ page }) => {
  await seedList(page, [])
  await page.goto('/anime/1')
  await page.getByRole('combobox', { name: 'Статус в моём списке' }).selectOption('watching')
  const entry = page.locator('details.my-entry')
  await entry.locator('summary').click()
  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await expect(entry.getByLabel('Начало просмотра')).toHaveValue(today)
  await entry.getByLabel('Заметка для себя').fill('Посоветовал друг, смотреть с саундтреком')
  await entry.getByRole('button', { name: 'Плюс пересмотр' }).click()
  await entry.getByRole('button', { name: 'Плюс пересмотр' }).click()
  await expect(entry.locator('output')).toHaveText('2 раз')
  await entry.getByLabel('Заметка для себя').blur()

  await page.reload()
  await expect(entry.locator('summary')).toContainText('пересмотрено 2 раз')
  await expect(entry.locator('summary')).toContainText('есть заметка')

  // Заметка видна и в «Моём списке».
  await page.goto('/my-list')
  await expect(page.locator('.list-item__note')).toHaveText('Посоветовал друг, смотреть с саундтреком')
})

test('главная: «Топ-10 онгоингов» с цифрами мест', async ({ page }) => {
  await page.goto('/')
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Топ-10 онгоингов' }) })
  await expect(shelf.locator('.top-ten')).toHaveCount(animes.length)
  await expect(shelf.locator('.top-ten__n').first()).toHaveText('1')
})

test('кадры: миниатюры лёгкие, фон баннера лёгкий на телефоне и оригинальный на компьютере', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/animes\/\d+\/screenshots/, (route) =>
    route.fulfill({
      json: ['a', 'b', 'c'].map((id) => ({ original: `/system/screenshots/original/${id}.jpg`, preview: `/system/screenshots/x332/${id}.jpg` })),
    }),
  )
  await page.goto('/anime/1')
  const banner = page.locator('.banner__img--shot')
  const phone = test.info().project.name === 'phone'
  await expect(banner).toHaveAttribute('src', phone ? /\/x332\/a\.jpg/ : /\/original\/a\.jpg/)
  await expect(page.locator('.shots-grid img').first()).toHaveAttribute('src', /\/x332\//)
})

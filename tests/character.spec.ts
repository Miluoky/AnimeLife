import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))
const image = { original: '/uploads/spike.jpg', preview: '/uploads/spike.jpg' }

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/\/api\/(shiki\/api\/)?animes\/1\/roles$/, (route) =>
    route.fulfill({
      json: [{ roles: ['Main'], character: { id: 1, name: 'Spike Spiegel', russian: 'Спайк Шпигель', image, url: '/characters/1' } }],
    }),
  )
  await page.route(/\/api\/(shiki\/api\/)?characters\/1$/, (route) =>
    route.fulfill({
      json: {
        id: 1,
        name: 'Spike Spiegel',
        russian: 'Спайк Шпигель',
        japanese: 'スパイク・スピーゲル',
        altname: null,
        image,
        url: '/characters/1',
        description: 'Охотник за головами. [h3]Прошлое[/h3]Бывший член синдиката. [spoiler=спойлер]Погибает в финале.[/spoiler]',
        seyu: [{ id: 5, name: 'Koichi Yamadera', russian: 'Коити Ямадэра', image, url: '/people/5' }],
        animes: [
          { ...animes[1], roles: ['Supporting'], role: 'Supporting' },
          { ...animes[0], roles: ['Main'], role: 'Main' },
        ],
      },
    }),
  )
})

test('персонаж: своя страница с описанием, спойлером под замком, сэйю и аниме с ролями', async ({ page }) => {
  await page.goto('/anime/1')
  await page.getByRole('link', { name: /Спайк Шпигель/ }).click()
  await expect(page).toHaveURL(/\/character\/1$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Спайк Шпигель')
  await expect(page.getByRole('heading', { name: 'Прошлое' })).toBeVisible()

  // Спойлер скрыт, пока не раскрыть.
  await expect(page.getByText('Погибает в финале.')).toBeHidden()
  await page.getByText('Спойлер', { exact: true }).click()
  await expect(page.getByText('Погибает в финале.')).toBeVisible()

  await expect(page.getByRole('link', { name: /Коити Ямадэра/ })).toHaveAttribute('href', 'https://shikimori.io/people/5')
  // Сначала тайтлы, где персонаж в главной роли.
  const cards = page.locator('.poster-card')
  await expect(cards.first()).toContainText('Главная роль')
  await expect(cards.first()).toContainText(animes[0].russian)
  await expect(cards.nth(1)).toContainText('Второстепенная')
})

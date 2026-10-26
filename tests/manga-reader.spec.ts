import { expect, test, type Page } from '@playwright/test'
import { mockServices } from './mocks'

// Манга «Берсерк» (Shikimori 2) и две главы на MangaDex по три страницы.
const manga = {
  id: 2,
  name: 'Berserk',
  russian: 'Берсерк',
  english: ['Berserk'],
  japanese: [],
  image: { original: '/system/mangas/original/2.jpg', preview: '' },
  kind: 'manga',
  score: '9.4',
  status: 'ongoing',
  volumes: 0,
  chapters: 0,
  aired_on: '1989-08-25',
  description: '',
  genres: [],
  publishers: [],
}
const chapter = (id: string, num: string) => ({
  id,
  attributes: { chapter: num, volume: '1', title: null, pages: 3, externalUrl: null },
  relationships: [{ type: 'scanlation_group', attributes: { name: 'Команда' } }],
})
const PIXEL = Buffer.from('R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBAAA=', 'base64')

async function mockManga(page: Page) {
  await mockServices(page)
  await page.route(/shikimori\.(io|one)\/api\/mangas\/2$/, (route) => route.fulfill({ json: manga }))
  await page.route(/api\.mangadex\.org\/manga\?.*/, (route) =>
    route.fulfill({ json: { data: [{ id: 'md-berserk', attributes: { links: { mal: '2' }, availableTranslatedLanguages: ['ru'] } }] } }),
  )
  await page.route(/api\.mangadex\.org\/manga\/md-berserk\/feed.*/, (route) =>
    route.fulfill({ json: { data: [chapter('ch-1', '1'), chapter('ch-2', '2')], total: 2 } }),
  )
  await page.route(/api\.mangadex\.org\/at-home\/server\/.*/, (route) =>
    route.fulfill({ json: { baseUrl: 'https://node.mangadex.network', chapter: { hash: 'h', data: ['1.png', '2.png', '3.png'], dataSaver: ['1.jpg', '2.jpg', '3.jpg'] } } }),
  )
  await page.route(/node\.mangadex\.network\/.*/, (route) => route.fulfill({ contentType: 'image/gif', body: PIXEL }))
}

test.beforeEach(async ({ page }) => {
  await mockManga(page)
})

test('читалка по страницам: листание, справа налево, конец главы и место чтения', async ({ page }) => {
  await page.goto('/manga/2/chapter/ch-1?lang=ru')
  await page.getByRole('button', { name: 'По страницам' }).click()
  const counter = page.locator('.reader__count')
  await expect(counter).toHaveText('1 / 3')
  await expect(page.locator('.reader__paged img')).toHaveAttribute('alt', 'Страница 1')

  // Слева направо: стрелка вправо и правая половина страницы листают вперёд.
  await page.keyboard.press('ArrowRight')
  await expect(counter).toHaveText('2 / 3')
  const box = (await page.locator('.reader__paged').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await expect(counter).toHaveText('3 / 3')

  // Справа налево: вперёд — левая половина и стрелка влево.
  await page.getByRole('button', { name: 'Справа налево' }).click()
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
  await expect(counter).toHaveText('2 / 3')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.reader__end')).toContainText('Глава дочитана')
  await page.locator('.reader__end').getByRole('link', { name: 'Глава 2 →' }).click()
  await expect(page).toHaveURL(/\/chapter\/ch-2/)
  await expect(counter).toHaveText('1 / 3')
  await page.keyboard.press('ArrowLeft')
  await expect(counter).toHaveText('2 / 3')

  // Место чтения: страница запомнилась, на странице манги «Продолжить» и прочитанная глава приглушена.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('anime.mangaProgress.v1') ?? '{}')['2']))
    .toMatchObject({ chapterId: 'ch-2', num: '2', page: 2, title: 'Берсерк' })
  await page.goto('/manga/2')
  await expect(page.getByRole('link', { name: 'Продолжить: Глава 2, стр. 2' })).toBeVisible()
  await expect(page.locator('.manga__chapters a.is-read')).toHaveText('Глава 1')
  await page.getByRole('link', { name: 'Продолжить: Глава 2, стр. 2' }).click()
  await expect(page.locator('.reader__count')).toHaveText('2 / 3')
  // Режим запоминается.
  expect(await page.evaluate(() => localStorage.getItem('anime.mangaView.v1'))).toBe('{"paged":true,"rtl":true}')
})

test('читалка лентой: все страницы подряд, стрелки листают главы', async ({ page }) => {
  await page.goto('/manga/2/chapter/ch-1?lang=ru')
  await expect(page.locator('.reader__pages img')).toHaveCount(3)
  await expect(page.locator('.reader__count')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Глава 2 →' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/chapter\/ch-2/)
})

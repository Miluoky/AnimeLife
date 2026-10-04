import { expect, test, type Page } from '@playwright/test'
import { mockServices } from './mocks'

/** Последний запрос списка тайтлов: по его параметрам видно, что фильтры дошли до Shikimori. */
function lastCatalogRequest(page: Page) {
  let last: URLSearchParams | undefined
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (/\/api\/(shiki\/api\/)?animes$/.test(url.pathname) && url.searchParams.get('limit') === '24') last = url.searchParams
  })
  return () => last
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/\/api\/(shiki\/api\/)?studios$/, (route) =>
    route.fulfill({
      json: [
        { id: 4, name: 'Bones', real: true },
        { id: 2, name: 'Kyoto Animation', real: true },
        { id: 999, name: 'Лейбл', real: false },
      ],
    }),
  )
})

/** На телефоне фильтры спрятаны за кнопкой «Фильтры». */
async function openFilters(page: import('@playwright/test').Page) {
  const toggle = page.locator('.filters-toggle')
  await toggle.waitFor({ state: 'attached' })
  if (await toggle.isVisible()) await toggle.click()
}

test('каталог: несколько жанров, сезон, возраст, студия и сортировка по алфавиту', async ({ page }) => {
  const last = lastCatalogRequest(page)
  await page.goto('/catalog')

  await openFilters(page)
  await page.getByRole('button', { name: /Жанры/ }).click()
  await page.getByRole('searchbox', { name: 'Найти: жанры' }).fill('экш')
  await page.getByRole('checkbox', { name: 'Экшен' }).check()
  await page.getByRole('searchbox', { name: 'Найти: жанры' }).fill('')
  await page.getByRole('checkbox', { name: 'Комедия' }).check()
  await expect(page).toHaveURL(/genre=1%2C4/)
  await expect.poll(() => last()?.get('genre')).toBe('1,4')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Жанры.*Комедия \+1/ })).toBeVisible()

  // Сезон появляется, только когда выбран один год.
  await expect(page.getByLabel('Сезон')).toHaveCount(0)
  await page.getByLabel('Год').selectOption('2024')
  await page.getByLabel('Сезон').selectOption('summer')
  await expect.poll(() => last()?.get('season')).toBe('summer_2024')

  await page.getByLabel('Возраст').selectOption('pg_13')
  await expect.poll(() => last()?.get('rating')).toBe('pg_13')

  // В списке студий только настоящие студии.
  await expect(page.getByLabel('Студия').locator('option')).toHaveText(['Любая', 'Bones', 'Kyoto Animation'])
  await page.getByLabel('Студия').selectOption('4')
  await expect.poll(() => last()?.get('studio')).toBe('4')

  await page.getByRole('button', { name: 'По алфавиту' }).click()
  await expect.poll(() => last()?.get('order')).toBe('name')
})

test('каталог: «Скрыть добавленные» убирает тайтлы из моего списка', async ({ page }) => {
  await page.addInitScript(() => {
    const anime = { id: '21', title: 'Ван-Пис', kind: 'ТВ-сериал', ongoing: true, posterFill: '#222' }
    localStorage.setItem('anime.mylist.v1', JSON.stringify([{ anime, status: 'watching', addedAt: 1 }]))
  })
  const last = lastCatalogRequest(page)
  await page.goto('/catalog')
  await openFilters(page)
  await page.getByLabel('Скрыть добавленные').check()
  await expect(page).toHaveURL(/hide=mine/)
  await expect.poll(() => last()?.get('exclude_ids')).toBe('21')
})

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

test('каталог: «Без жанров» исключает жанр, выбранные жанры в нём не предлагаются', async ({ page }) => {
  const last = lastCatalogRequest(page)
  await page.goto('/catalog?genre=4')
  await openFilters(page)
  await page.getByRole('button', { name: /Без жанров/ }).click()
  await expect(page.getByRole('group', { name: 'Без жанров' }).getByRole('checkbox', { name: 'Комедия' })).toHaveCount(0)
  await page.getByRole('group', { name: 'Без жанров' }).getByRole('checkbox', { name: 'Экшен' }).check()
  await expect(page).toHaveURL(/nogenre=1/)
  await expect.poll(() => last()?.get('genre')).toBe('4,!1')
})

test('каталог: на постерах виден статус из моего списка и сколько серий просмотрено', async ({ page }) => {
  await page.addInitScript(() => {
    const card = (id: string, title: string, episodes: number) => ({ id, title, kind: 'ТВ-сериал', episodes, posterFill: '#222' })
    localStorage.setItem(
      'anime.mylist.v1',
      JSON.stringify([
        { anime: card('60636', 'Блич', 10), status: 'watching', addedAt: 1, watched: 3 },
        { anime: card('21', 'Ван-Пис', 0), status: 'completed', addedAt: 2 },
      ]),
    )
  })
  await page.goto('/catalog')
  const bleach = page.locator('.poster-card', { hasText: 'Блич: Тысячелетняя' })
  await expect(bleach.locator('.poster-card__mine')).toHaveText('Смотрю · 3/10')
  await expect(bleach.locator('.poster-card__progress span')).toHaveAttribute('style', /width: 30%/)
  await expect(page.locator('.poster-card', { hasText: 'Ван-Пис' }).locator('.poster-card__mine')).toHaveText('Просмотрено')
  await expect(page.locator('.poster-card', { hasText: 'Детектив Конан' }).locator('.poster-card__mine')).toHaveCount(0)
})

test('пустой поиск: подсказки, куда пойти, и полка популярного', async ({ page }) => {
  await page.route(/\/api\/(shiki\/api\/)?animes\?/, (route) => {
    const url = new URL(route.request().url())
    return url.searchParams.get('search') ? route.fulfill({ json: [] }) : route.fallback()
  })
  await page.goto('/catalog?q=qqzzxx')
  await expect(page.getByText('Ничего не нашлось. Попробуйте другой запрос или фильтры.')).toBeVisible()
  await expect(page.getByRole('link', { name: '🎲 Подобрать по настроению' })).toHaveAttribute('href', '/random')
  await expect(page.getByRole('heading', { name: 'Популярно сейчас' })).toBeVisible()
  await expect(page.locator('.row-scroll__item').first()).toBeVisible()
})

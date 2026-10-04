import { expect, test, type Page } from '@playwright/test'
import { mockServices, shikimoriFixture } from './mocks'

/**
 * Подсказки поиска. Список тайтлов отвечает по тексту запроса: «наруто» и «бибоп» что-то находят,
 * остальное — пусто. Так проверяем исправление раскладки и пустой ответ.
 */
test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/\/api\/(shiki\/)?animes\?/, (route) => {
    const params = new URL(route.request().url()).searchParams
    const search = params.get('search')
    if (search && !['наруто', 'бибоп'].includes(search)) return route.fulfill({ json: [] })
    return route.fulfill({ json: shikimoriFixture('/animes', params) })
  })
})

async function searchInput(page: Page) {
  const desktop = page.locator('.search:not(.search--mobile) input')
  if (await desktop.isVisible()) return desktop
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  return page.locator('.search--mobile input')
}

test('подсказки: оценка и тип, стрелки и Enter открывают тайтл, потом он в «недавних»', async ({ page }) => {
  await page.goto('/')
  const input = await searchInput(page)
  await input.fill('бибоп')
  const hints = page.getByRole('listbox', { name: 'Подсказки' })
  await expect(hints.getByRole('option').first()).toContainText('Ван-Пис')
  await expect(hints.getByRole('option').first()).toContainText('★ 8.7')
  await expect(hints.getByRole('option').first()).toContainText('онгоинг')

  await input.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', /-0$/)
  await input.press('Enter')
  await expect(page).toHaveURL(/\/anime\/21$/)

  const again = await searchInput(page)
  await again.focus()
  await expect(page.getByText('Вы недавно открывали')).toBeVisible()
  await expect(page.getByRole('listbox', { name: 'Подсказки' }).getByRole('option').first()).toContainText('Ван-Пис')
  await page.getByRole('button', { name: 'Очистить' }).click()
  await expect(page.getByText('Сейчас смотрят')).toBeVisible()
})

test('подсказки: текст не в той раскладке ищется как надо', async ({ page }) => {
  await page.goto('/')
  const input = await searchInput(page)
  await input.fill('yfhenj')
  await expect(page.getByText('Показаны результаты для «наруто»')).toBeVisible()
  await input.press('Enter')
  await expect(page).toHaveURL(/\/catalog\?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE$/)
})

test('подсказки: пустой ответ и подсказка раскладки в каталоге', async ({ page }) => {
  await page.goto('/')
  const input = await searchInput(page)
  await input.fill('zzzz')
  await expect(page.getByText('Ничего не нашлось.')).toBeVisible()

  await page.goto('/catalog?q=yfhenj')
  await page.getByRole('link', { name: '«наруто»' }).click()
  await expect(page).toHaveURL(/\/catalog\?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «наруто»')
})

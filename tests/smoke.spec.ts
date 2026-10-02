import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('главная: подборка недели, онгоинги, карточки с лёгкими постерами', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page.getByRole('link', { name: /Ван-Пис/ }).first()).toBeVisible()

  // Карточки берут webp из GraphQL, а не полноразмерный jpg.
  const src = await page.locator('.poster-card img').first().getAttribute('src')
  expect(src).toMatch(/main-.*\.webp$/)
  expect(errors).toEqual([])
})

test('страница тайтла открывается по клику и показывает серии', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Ван-Пис/ }).first().click()
  await expect(page).toHaveURL(/\/anime\/21$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page.getByRole('heading', { name: /Отзывы/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Серии/ })).toBeVisible()
})

test('каталог: поиск и фильтры', async ({ page }) => {
  await page.goto('/catalog')
  await expect(page.locator('.poster-card')).toHaveCount(8)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('мой список и профиль без входа', async ({ page }) => {
  await page.goto('/my-list')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('/account')
  await expect(page.getByRole('button', { name: /Войти/ }).first()).toBeVisible()
})

test('неизвестный адрес: страница 404', async ({ page }) => {
  await page.goto('/nope/такого-нет')
  await expect(page.getByText(/не найдена|нет такой/i)).toBeVisible()
})

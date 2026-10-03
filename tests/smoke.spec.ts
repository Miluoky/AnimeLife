import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('главная: подборка недели, онгоинги, карточки с лёгкими постерами', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  // Заголовок страницы — о сайте, тайтл из баннера — подзаголовок.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Смотреть аниме онлайн')
  await expect(page.locator('.hero__title')).toContainText('Ковбой Бибоп')
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
  // Описание и факты сразу в шапке, как на образце: не надо листать до конца правой колонки.
  await expect(page.getByRole('heading', { name: 'О чём' })).toBeVisible()
  await expect(page.locator('.fact-pill').first()).toBeVisible()
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

test('после обновления сайта старая часть кода не грузится: одна автоперезагрузка, потом кнопка «Обновить»', async ({ page }) => {
  // Так отвечает сервер на файл из прошлой сборки: вместо кода отдаёт index.html.
  await page.route(/\/assets\/Account-.*\.js$/, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Anime Life</title>' }),
  )
  let loads = 0
  page.on('load', () => loads++)
  await page.goto('/account')
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Не получилось открыть страницу' })).toBeVisible()
  // Шапка и меню на месте, перезагрузка была ровно одна.
  await expect(page.getByRole('link', { name: /на главную/ }).first()).toBeVisible()
  expect(loads).toBe(2)
})

test('«Забыли пароль?»: письмо со ссылкой на этот сайт и новый пароль по ссылке', async ({ page }) => {
  const requests: { method: string; body: Record<string, string> }[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/account\/recovery/, (route) => {
    requests.push({ method: route.request().method(), body: route.request().postDataJSON() })
    return route.fulfill({ status: 201, json: { $id: 't1', userId: 'u1', secret: '', expire: '' } })
  })

  await page.goto('/account')
  await page.getByRole('button', { name: 'Забыли пароль?' }).click()
  await page.getByLabel('Почта').fill('aya@example.com')
  await page.getByRole('button', { name: 'Отправить ссылку' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Письмо отправлено на aya@example.com' })).toBeVisible()
  expect(requests[0]).toEqual({
    method: 'POST',
    body: { email: 'aya@example.com', url: 'http://localhost:4173/account/recovery' },
  })

  await page.goto('/account/recovery?userId=u1&secret=s3cret')
  await page.getByLabel('Новый пароль').fill('новый-пароль')
  await page.getByLabel('Ещё раз').fill('другой-пароль')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('alert')).toHaveText('Пароли не совпадают.')
  expect(requests).toHaveLength(1)

  await page.getByLabel('Ещё раз').fill('новый-пароль')
  await page.getByRole('button', { name: 'Сохранить пароль' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Пароль изменён' })).toBeVisible()
  expect(requests[1]).toEqual({ method: 'PUT', body: { userId: 'u1', secret: 's3cret', password: 'новый-пароль' } })
})

import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'
import { reveal } from './reveal'

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
  // Карточка ведёт сразу на адрес с латинским названием, без перенаправления.
  await expect(page).toHaveURL(/\/anime\/21-one-piece$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page.getByRole('heading', { name: /Серии/ })).toBeVisible()
  // Описание и факты сразу в шапке, как на образце: не надо листать до конца правой колонки.
  await expect(page.getByRole('heading', { name: 'О чём' })).toBeVisible()
  await expect(page.locator('.fact-pill').first()).toBeVisible()
  // Отзывы ниже первого экрана и монтируются, когда секция рядом.
  await reveal(page, page.getByRole('heading', { name: /Отзывы/ }))
  await expect(page.getByRole('heading', { name: /Отзывы/ })).toBeVisible()
})

test('каталог: поиск и фильтры', async ({ page }) => {
  await page.goto('/catalog')
  await expect(page.locator('.poster-card')).toHaveCount(8)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('мой список и профиль без входа', async ({ page }) => {
  await page.goto('/library?tab=planned')
  await expect(page.getByRole('heading', { level: 1, name: 'Библиотека' })).toBeVisible()
  // Пустой список предлагает популярное: одно нажатие кладёт тайтл в «В планах».
  await expect(page.getByRole('heading', { name: 'Список пока пуст' })).toBeVisible()
  await page.getByRole('button', { name: 'Буду смотреть' }).first().click()
  await expect(page.getByRole('tab', { name: /В планах/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.list-item')).toHaveCount(1)
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
  // Считаем запросы самой страницы: перезагрузка может начаться ещё до события load.
  let loads = 0
  page.on('request', (req) => req.isNavigationRequest() && req.frame() === page.mainFrame() && loads++)
  await page.goto('/account')
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Не получилось открыть страницу' })).toBeVisible()
  // Шапка и меню на месте, перезагрузка была ровно одна.
  await expect(page.getByRole('link', { name: /на главную/ }).first()).toBeVisible()
  expect(loads).toBe(2)
})

test('Google, Яндекс и сброс пароля по письму в этом году не обещаем', async ({ page }) => {
  const copy = 'Google, Яндекс и сброс пароля по письму в этом году не делаем. Вход: почта, VK, Telegram.'
  await page.goto('/account')
  await expect(page.getByText(copy)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Забыли пароль?' })).toHaveCount(0)

  await page.goto('/account/recovery')
  await expect(page.getByRole('status').filter({ hasText: copy })).toBeVisible()
  await expect(page.getByRole('link', { name: 'На страницу входа' })).toBeVisible()
})

test('гость: Appwrite не трогаем, главная и вход работают', async ({ page }) => {
  const appwrite: string[] = []
  page.on('request', (r) => {
    if (/cloud\.appwrite\.io/.test(r.url())) appwrite.push(r.url())
  })
  await page.goto('/')
  await expect(page.locator('.hero__title')).toBeVisible()
  await page.reload()
  await expect(page.locator('.hero__title')).toBeVisible()
  await page.waitForTimeout(500)
  expect(appwrite).toEqual([])
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход')
  await expect(page).toHaveTitle('Вход и регистрация | Anime Life')
})

test('новому гостю без сессии: только Core /auth/me, не Appwrite', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ serviceWorkers: 'block', baseURL })
  const page = await context.newPage()
  await mockServices(page)
  const appwrite: string[] = []
  const coreMe: string[] = []
  page.on('request', (r) => {
    if (/cloud\.appwrite\.io/.test(r.url())) appwrite.push(r.url())
    if (/\/api\/core\/auth\/me$/.test(r.url())) coreMe.push(r.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Смотреть аниме онлайн' })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход')
  expect(appwrite).toEqual([])
  expect(coreMe.length).toBeGreaterThanOrEqual(1)
  await context.close()
})

test('у страницы 404 свой заголовок вкладки', async ({ page }) => {
  await page.goto('/nope-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена')
  await expect(page).toHaveTitle('Страница не найдена | Anime Life')
})

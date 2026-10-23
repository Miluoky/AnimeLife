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
  // Карточка ведёт сразу на адрес с латинским названием, без перенаправления.
  await expect(page).toHaveURL(/\/anime\/21-one-piece$/)
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
  // Пустой список предлагает популярное: одно нажатие кладёт тайтл в «Буду смотреть» и открывает этот раздел.
  await expect(page.getByRole('heading', { name: 'Список пока пуст' })).toBeVisible()
  await page.getByRole('button', { name: 'Буду смотреть' }).first().click()
  await expect(page.getByRole('tab', { name: /Буду смотреть/ })).toHaveAttribute('aria-selected', 'true')
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
    body: { email: 'aya@example.com', url: new URL('/account/recovery', test.info().project.use.baseURL).href },
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

test('гостю при повторном заходе не грузим вход: ни запроса аккаунта, ни библиотеки Appwrite', async ({ page }) => {
  const account: string[] = []
  page.on('request', (r) => {
    if (/appwrite\.io\/v1\/account$/.test(r.url())) account.push(r.url())
  })
  await page.goto('/')
  await expect.poll(() => account.length).toBe(1)
  await expect(page.locator('.hero__title')).toBeVisible()

  const sdk: string[] = []
  page.on('request', (r) => {
    if (/\/assets\/appwrite-.*\.js$/.test(r.url())) sdk.push(r.url())
  })
  await page.reload()
  await expect(page.locator('.hero__title')).toBeVisible()
  await page.waitForTimeout(500)
  expect(account).toHaveLength(1)
  expect(sdk).toEqual([])
  // Страница входа по-прежнему предлагает войти.
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход')
  await expect(page).toHaveTitle('Вход и регистрация | Anime Life')
})

test('новому гостю профиль не запрашиваем совсем: в консоли нет 401', async ({ browser, baseURL }) => {
  // Отдельный контекст без cookieFallback: в этом браузере никто не входил.
  const context = await browser.newContext({ serviceWorkers: 'block', baseURL })
  const page = await context.newPage()
  await page.route(/shikimori\.(io|one)\/.*/, (route) => route.fulfill({ json: [] }))
  const account: string[] = []
  page.on('request', (r) => {
    if (/appwrite\.io\/v1\/account$/.test(r.url())) account.push(r.url())
  })
  await page.route(/cloud\.appwrite\.io\/.*/, (route) => route.fulfill({ status: 401, json: { message: 'guests' } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Смотреть аниме онлайн' })).toBeVisible()
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход')
  await page.waitForTimeout(800)
  expect(account).toEqual([])
  await context.close()
})

test('у страницы 404 свой заголовок вкладки', async ({ page }) => {
  await page.goto('/nope-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена')
  await expect(page).toHaveTitle('Страница не найдена | Anime Life')
})

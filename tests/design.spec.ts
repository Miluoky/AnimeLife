import { devices, expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('публичная главная отрисовывается до загрузки Appwrite SDK', async ({ page }) => {
  const accountRequests: string[] = []
  page.on('request', (request) => {
    if (/cloud\.appwrite\.io\/v1\/account$/.test(request.url())) accountRequests.push(request.url())
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Смотреть аниме онлайн' })).toBeVisible()
  expect(accountRequests).toHaveLength(0)
})

test('прямой вход в профиль не откладывает проверку сессии', async ({ page }) => {
  const accountRequest = page.waitForRequest((request) => /cloud\.appwrite\.io\/v1\/account$/.test(request.url()))
  await page.goto('/account', { waitUntil: 'domcontentloaded' })
  await accountRequest
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
})

test('нижнее меню на телефоне ведёт по разделам', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Разделы сайта' })
  await expect(nav).toBeVisible()
  await nav.getByRole('link', { name: 'Мой список' }).click()
  await expect(page).toHaveURL(/\/my-list$/)
  await expect(nav.getByRole('link', { name: 'Мой список' })).toHaveClass(/active/)
})

test.describe('iPhone', () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13']
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch })

  test('баннер «Anime Life на телефоне» стоит над нижним меню и не закрывает его', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog', { name: 'Установить приложение' })
    await expect(banner).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Разделы сайта' })
    const [b, n] = await Promise.all([banner.boundingBox(), nav.boundingBox()])
    expect(b!.y + b!.height).toBeLessThanOrEqual(n!.y)
    await nav.getByRole('link', { name: 'Мой список' }).click()
    await expect(page).toHaveURL(/\/my-list$/)
  })
})

test('Ctrl+K ставит курсор в поиск', async ({ page, isMobile }) => {
  test.skip(isMobile, 'на телефоне поиск открывается из меню')
  await page.goto('/')
  await page.keyboard.press('Control+k')
  await expect(page.locator('.search:not(.search--mobile) input')).toBeFocused()
})

test('тема и цвет сохраняются между заходами', async ({ page }) => {
  await page.goto('/account')
  await page.getByRole('button', { name: 'Чёрный' }).click()
  await page.getByRole('radio', { name: 'Бирюзовый' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
})

test('добавление в список показывает уведомление с отменой', async ({ page }) => {
  await page.goto('/anime/1')
  await page.getByLabel('Статус в моём списке').selectOption('watching')
  const toast = page.getByRole('status').filter({ hasText: 'Смотрю' })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Отменить' }).click()
  await expect(page.getByLabel('Статус в моём списке')).toHaveValue('')
})

test('баннер «Сейчас в эфире» переключает тайтлы постерами', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Сейчас в эфире')).toBeVisible()
  const dots = page.getByRole('tab')
  await expect(dots).toHaveCount(5)
  await dots.nth(2).click()
  await expect(dots.nth(2)).toHaveAttribute('aria-selected', 'true')
})

test('у страницы тайтла свой заголовок вкладки и кнопка «Поделиться»', async ({ page }) => {
  await page.goto('/anime/1')
  await expect(page).toHaveTitle('Ковбой Бибоп — смотреть аниме онлайн бесплатно все серии | Anime Life')
  await expect(page.getByRole('button', { name: 'Поделиться' })).toBeVisible()
  await page.goto('/catalog')
  await expect(page).toHaveTitle('Каталог аниме — поиск по жанрам, годам и рейтингу | Anime Life')
})

test('шапка уезжает при прокрутке вниз и возвращается при прокрутке вверх', async ({ page }) => {
  await page.goto('/catalog')
  await expect(page.locator('.poster-card').first()).toBeVisible()
  const header = page.locator('.site-header')
  await page.evaluate(() => document.documentElement.style.setProperty('min-height', '4000px'))
  await page.evaluate(() => window.scrollTo(0, 600))
  await expect(header).toHaveClass(/site-header--hidden/)
  await expect.poll(() => header.evaluate((h) => h.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1)
  await page.evaluate(() => window.scrollTo(0, 500))
  await expect(header).not.toHaveClass(/site-header--hidden/)
  await expect.poll(() => header.evaluate((h) => h.getBoundingClientRect().top)).toBe(0)
})

test.describe('вёрстка на телефоне', () => {
  // Узкие iPhone, обычный и большой: ни одна страница не шире экрана (иначе её можно сдвинуть пальцем вбок).
  for (const width of [360, 390, 430]) {
    test(`ничего не вылезает за край экрана шириной ${width}`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'только телефон')
      await page.setViewportSize({ width, height: 844 })
      // Серия с очень длинным названием: раньше из-за него страница плеера уезжала влево.
      const release = fixture('anilibria-release')
      release.episodes[0].name = 'Я — Луффи! Тот, кто станет королём пиратов! И очень длинное продолжение названия серии'
      await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: fixture('anilibria-search') }))
      await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))
      await page.route(/cache\.libria\.fun\/.*/, () => {})

      const routes: [string, string][] = [
        ['/', '.poster-card'],
        ['/catalog', '.poster-card'],
        ['/anime/1', '.episode-card'],
        ['/watch/1/1', '.vp-bar'],
        ['/account', '.auth-card'],
        ['/together', 'main'],
        ['/schedule', 'main'],
        ['/my-list', 'main'],
      ]
      for (const [path, ready] of routes) {
        await page.goto(path)
        await expect(page.locator(ready).first()).toBeVisible()
        if (path.startsWith('/watch')) await expect(page.getByText(/Луффи/).first()).toBeAttached()
        const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
        expect(scroll, `ширина страницы ${path}`).toBeLessThanOrEqual(client)
      }
    })
  }
})

test('меню в шапке на телефоне открывается листом и закрывается по фону', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const menu = page.locator('#mobile-menu')
  await expect(menu.getByRole('link', { name: 'Смотрю' })).toBeVisible()
  // Страница под меню не прокручивается.
  await expect(page.locator('html')).toHaveClass(/scroll-lock/)
  await page.locator('.menu-backdrop').click({ position: { x: 20, y: 700 } })
  await expect(menu).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveClass(/scroll-lock/)
})

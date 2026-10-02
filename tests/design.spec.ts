import { devices, expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
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

test('баннер «Сейчас в эфире» переключает тайтлы точками', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Сейчас в эфире')).toBeVisible()
  const dots = page.getByRole('tab')
  await expect(dots).toHaveCount(5)
  await dots.nth(2).click()
  await expect(dots.nth(2)).toHaveAttribute('aria-selected', 'true')
})

test('у страницы тайтла свой заголовок вкладки и кнопка «Поделиться»', async ({ page }) => {
  await page.goto('/anime/1')
  await expect(page).toHaveTitle('Ковбой Бибоп — Anime Life')
  await expect(page.getByRole('button', { name: 'Поделиться' })).toBeVisible()
  await page.goto('/catalog')
  await expect(page).toHaveTitle('Каталог аниме — Anime Life')
})

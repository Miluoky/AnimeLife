import { expect, test } from '@playwright/test'
import { mockServices } from '../mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test.describe('Tier 1: UI Navigation', () => {
  test('primary navigation routes render and navigate correctly on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-specific header navigation')
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Основное меню' })
    await expect(nav).toBeVisible()

    // Check presence of primary navigation links
    await expect(nav.getByRole('link', { name: 'Главная' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Каталог' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Расписание' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Сообщество' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Мой список' })).toBeVisible()

    // Navigate to Catalog
    await nav.getByRole('link', { name: 'Каталог' }).click()
    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Navigate to Schedule
    await nav.getByRole('link', { name: 'Расписание' }).click()
    await expect(page).toHaveURL(/\/schedule$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Navigate to Community
    await nav.getByRole('link', { name: 'Сообщество' }).click()
    await expect(page).toHaveURL(/\/community$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Сообщество')
  })

  test('mobile bottom dock navigation and more sheet drawer interaction', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific dock navigation')
    await page.goto('/')

    const dock = page.getByRole('navigation', { name: 'Разделы сайта' })
    await expect(dock).toBeVisible()

    // Navigate to Catalog via mobile dock
    await dock.getByRole('link', { name: 'Каталог' }).click()
    await expect(page).toHaveURL(/\/catalog$/)

    // Navigate to MyList via mobile dock
    await dock.getByRole('link', { name: 'Мой список' }).click()
    await expect(page).toHaveURL(/\/my-list$/)

    // Open More sheet
    const moreBtn = dock.getByRole('button', { name: 'Ещё' })
    await expect(moreBtn).toBeVisible()
    await moreBtn.click()

    // Verify more sheet options
    const sheet = page.getByRole('dialog', { name: 'Ещё разделы' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('link', { name: /График/ })).toBeVisible()
    await expect(sheet.getByRole('link', { name: /Сообщество/ })).toBeVisible()
  })

  test('search shortcut Ctrl+K focuses search on desktop or opens search on mobile', async ({ page, isMobile }) => {
    await page.goto('/')
    if (isMobile) {
      // Mobile header search button
      const openMenuBtn = page.getByRole('button', { name: 'Открыть меню' })
      await expect(openMenuBtn).toBeVisible()
      await openMenuBtn.click()
      const mobileSearch = page.locator('.search--mobile input')
      await expect(mobileSearch).toBeVisible()
    } else {
      await page.keyboard.press('Control+k')
      const desktopSearch = page.locator('.search:not(.search--mobile) input')
      await expect(desktopSearch).toBeFocused()
    }
  })

  test('sticky header hides on scroll down and reveals on scroll up', async ({ page }) => {
    await page.goto('/catalog')
    await expect(page.locator('.poster-card').first()).toBeVisible()
    const header = page.locator('.site-header')

    // Inject tall content to enable scrolling
    await page.evaluate(() => document.documentElement.style.setProperty('min-height', '3000px'))

    // Scroll down past threshold
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect(header).toHaveClass(/site-header--hidden/)

    // Scroll slightly up
    await page.evaluate(() => window.scrollTo(0, 480))
    await expect(header).not.toHaveClass(/site-header--hidden/)
  })

  test('404 not found page renders friendly error and returns home', async ({ page }) => {
    await page.goto('/non-existent-route-xyz')
    await expect(page.getByText(/не найдена|нет такой/i)).toBeVisible()

    // Click link to return home
    const homeLink = page.getByRole('link', { name: /На главную|Главная/i }).first()
    await expect(homeLink).toBeVisible()
    await homeLink.click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('theme and accent customization persists in storage and across reload', async ({ page }) => {
    await page.goto('/account')
    await page.getByRole('button', { name: 'Чёрный' }).click()
    await page.getByRole('radio', { name: 'Бирюзовый' }).click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')

    // Reload page to verify persistence
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
  })
})

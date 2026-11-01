import { expect, test } from '@playwright/test'
import { mockServices } from '../mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test.describe('Tier 1: SEO & Meta', () => {
  test('document title updates dynamically across SPA navigation', async ({ page }) => {
    // Home page title
    await page.goto('/')
    await expect(page).toHaveTitle(/Anime Life/)

    // Catalog page title
    await page.goto('/catalog')
    await expect(page).toHaveTitle(/Каталог/)

    // Title details page
    await page.goto('/anime/1')
    await expect(page).toHaveTitle(/Ковбой Бибоп/)

    // Community page
    await page.goto('/community')
    await expect(page).toHaveTitle(/Сообщество/)
  })

  test('meta description tag exists and synchronizes with current route', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/)

    // Navigate to catalog and verify description content
    await page.goto('/catalog')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/)
  })

  test('canonical link element reflects absolute canonical URL', async ({ page }) => {
    await page.goto('/catalog')
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveAttribute('href', 'https://animelife.top/catalog')

    // Preserves ?page=N on pagination routes
    await page.goto('/genre/romance?page=2')
    await expect(canonical).toHaveAttribute('href', 'https://animelife.top/genre/romance?page=2')
  })

  test('OpenGraph metadata tags are present in DOM', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Anime Life/)

    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Anime Life')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/)
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/)
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /https:\/\/animelife\.top/)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /.+/)
  })

  test('Twitter card meta tag is correctly defined', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Anime Life/)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  })

  test('robots meta directive specifies search crawler parameters', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /max-image-preview:large/)
  })
})

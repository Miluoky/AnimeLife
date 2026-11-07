import { expect, test } from '@playwright/test'
import { mockServices } from '../mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test.describe('Tier 1: Search & Catalog', () => {
  test('catalog search query updates page title and heading', async ({ page }) => {
    await page.goto('/catalog?q=cowboy')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «cowboy»')
    await expect(page).toHaveTitle(/Поиск: «cowboy»/)
    await expect(page.locator('.poster-card').first()).toBeVisible()
  })

  test('search redirect /search?q=query normalizes to /catalog?q=query', async ({ page }) => {
    await page.goto('/search?q=Bebop')
    await expect(page).toHaveURL(/\/catalog\?q=Bebop$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «Bebop»')
  })

  test('catalog sorting filter selection updates URL query parameter', async ({ page }) => {
    await page.goto('/catalog')
    await expect(page.locator('.poster-card').first()).toBeVisible()

    // Select 'С высоким рейтингом' sorting option
    const rankedBtn = page.getByRole('button', { name: 'С высоким рейтингом' })
    await expect(rankedBtn).toBeVisible()
    await rankedBtn.click()

    await expect(page).toHaveURL(/order=ranked/)
    await expect(rankedBtn).toHaveClass(/active/)
    await expect(rankedBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('reset search button clears active query and restores default catalog', async ({ page }) => {
    await page.goto('/catalog?q=test')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «test»')

    // Click 'Сбросить поиск' button
    const resetBtn = page.getByRole('button', { name: 'Сбросить поиск' })
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()

    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Поиск')
  })

  test('catalog card grid renders responsive cards with titles and links to title pages', async ({ page }) => {
    await page.goto('/catalog')

    const cards = page.locator('.poster-card')
    await expect(cards).toHaveCount(8)

    const firstCard = cards.first()
    await expect(firstCard).toBeVisible()
    // OptimizedImage: при сбое постера — SVG-заглушка с role=img, без <img>.
    await expect(firstCard.getByRole('img').first()).toBeVisible()

    // Clicking card opens title details page
    await firstCard.click()
    await expect(page).toHaveURL(/\/anime\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('status filter chips select status and update URL parameter', async ({ page }) => {
    await page.goto('/catalog')

    const ongoingBtn = page.getByRole('button', { name: 'Онгоинг' })
    await expect(ongoingBtn).toBeVisible()
    await ongoingBtn.click()

    await expect(page).toHaveURL(/status=ongoing/)
    await expect(ongoingBtn).toHaveClass(/active/)
    await expect(ongoingBtn).toHaveAttribute('aria-pressed', 'true')
  })
})

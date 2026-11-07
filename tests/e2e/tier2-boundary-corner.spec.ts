import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from '../mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))
const search = fixture('anilibria-search')

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/api\.dreamerscast\.com\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/api\.dreamcast\.fun\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/dcast\.online\/.*/, (r) => r.fulfill({ json: [] }))
})

test.describe('Tier 2: Boundary & Corner Cases', () => {
  test('empty search results show helpful suggestions without crashing', async ({ page }) => {
    // Route Shikimori /animes to empty array when query doesn't match
    await page.route(/shikimori\.(io|one)\/api\/animes\?.*/, (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('search')?.includes('nonexistent_query_xyz')) {
        return route.fulfill({ json: [] })
      }
      return route.fulfill({ json: fixture('animes') })
    })

    await page.goto('/catalog?q=nonexistent_query_xyz')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «nonexistent_query_xyz»')
    await expect(page.getByRole('button', { name: 'Сбросить поиск' })).toBeVisible()

    // Verify presence of helpful empty state notice and suggestions
    await expect(page.getByRole('heading', { name: /ничего не нашлось/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Подобрать по настроению/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Популярно сейчас' })).toBeVisible()
  })

  test('invalid and out-of-bound page parameters normalize safely', async ({ page }) => {
    // Test negative page parameter
    await page.goto('/catalog?page=-10')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.poster-card').first()).toBeVisible()

    // Test non-numeric page parameter
    await page.goto('/catalog?page=invalid_string')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.poster-card').first()).toBeVisible()
  })

  test('narrow mobile viewport (320px) maintains layout integrity with zero horizontal scroll', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-specific viewport boundary test')
    await page.setViewportSize({ width: 320, height: 640 })

    await page.goto('/')
    await expect(page.locator('.hero__title')).toBeVisible()

    // Measure horizontal scroll overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalOverflow).toBe(false)
  })

  test('stream failover when episode is unavailable displays notice and trailer fallback', async ({ page }) => {
    // Release with only 3 episodes
    await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: search }))
    await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) =>
      route.fulfill({ json: fixture('anilibria-release') }),
    )

    // Request episode 10 (not in release)
    await page.goto('/watch/1/10')

    // Expect fallback notice and trailer embed
    await expect(page.getByText(/Серии 10 пока нет в AniLibria — вот трейлер/)).toBeVisible()
    await expect(page.locator('video.player-video')).toHaveCount(0)
    await expect(page.locator('iframe[title*="Трейлер"]')).toBeVisible()
  })

  test('adversarial input strings in search input are escaped properly without XSS execution', async ({ page }) => {
    const errorLogs: string[] = []
    page.on('pageerror', (err) => errorLogs.push(err.message))

    const attackVector = `<script>window.__xss_compromised = true;</script>' OR '1'='1`
    await page.goto(`/catalog?q=${encodeURIComponent(attackVector)}`)

    // Verify script was not executed
    const isCompromised = await page.evaluate(() => (window as unknown as { __xss_compromised?: boolean }).__xss_compromised)
    expect(isCompromised).toBeUndefined()

    // Verify heading safely renders text
    await expect(page.getByRole('heading', { level: 1 })).toContainText(attackVector)
    expect(errorLogs).toEqual([])
  })
})

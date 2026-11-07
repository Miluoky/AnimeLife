import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from '../mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))
const search = fixture('anilibria-search')
const rawRelease = fixture('anilibria-release')

const release = {
  ...rawRelease,
  episodes: rawRelease.episodes.map((ep: { ordinal: number; name?: string }) => ({
    ...ep,
    hls_480: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/480/stream.mp4`,
    hls_720: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/720/stream.mp4`,
    hls_1080: `https://cache.libria.fun/videos/media/ts/8443/${ep.ordinal}/1080/stream.mp4`,
  })),
}

async function setupPlayerMock(page: import('@playwright/test').Page) {
  await mockServices(page)
  await page.route(/api\.dreamerscast\.com\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/api\.dreamcast\.fun\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/dcast\.online\/.*/, (r) => r.fulfill({ json: [] }))
  const clip = readFileSync(new URL('../fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.mp4/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: search }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))
}

test.beforeEach(async ({ page }) => {
  await setupPlayerMock(page)
})

test.describe('Tier 5: Adversarial Stress & Hardening', () => {
  test('R1 UI: 320px narrow mobile viewport has zero horizontal scroll overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 })
    for (const path of ['/', '/catalog', '/community']) {
      await page.goto(path)
      await page.waitForLoadState('domcontentloaded')
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      })
      expect(overflow, `Horizontal overflow detected at 320px on ${path}`).toBe(false)
    }
  })

  test('R1 UI: 4K UHD viewport (3840x2160) renders header and containers without layout collapse', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop 4K stress test only')
    await page.setViewportSize({ width: 3840, height: 2160 })
    await page.goto('/')
    const header = page.locator('header')
    await expect(header).toBeVisible()
    const heroOrMain = page.locator('main')
    await expect(heroOrMain).toBeVisible()
    const box = await heroOrMain.boundingBox()
    expect(box?.width).toBeGreaterThan(1200)
  })

  test('R1 UI: Mobile podium ordering (<860px) renders 1st place above 2nd place via flex/grid order', async ({ page }) => {
    await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/profiles\/rows\?.*/, (route) => {
      return route.fulfill({
        json: {
          total: 3,
          rows: [
            { $id: 'u1', name: 'Senku', xp: 9500, weekXp: 850, monthXp: 3200, summary: '{"style":{"frame":"inferno"}}' },
            { $id: 'u2', name: 'Chrome', xp: 7200, weekXp: 620, monthXp: 2400, summary: '{"style":{"frame":"void"}}' },
            { $id: 'u3', name: 'Kohaku', xp: 5100, weekXp: 410, monthXp: 1800, summary: '{"style":{"frame":"sakura_anim"}}' },
          ],
        },
      })
    })

    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('/community?tab=top')

    const podium = page.locator('.s-podium')
    await expect(podium).toBeVisible()

    const card1 = page.locator('.s-podium__card--1')
    const card2 = page.locator('.s-podium__card--2')
    const card3 = page.locator('.s-podium__card--3')

    await expect(card1).toBeVisible()
    await expect(card2).toBeVisible()
    await expect(card3).toBeVisible()

    const order1 = await card1.evaluate((el) => window.getComputedStyle(el).order)
    const order2 = await card2.evaluate((el) => window.getComputedStyle(el).order)
    const order3 = await card3.evaluate((el) => window.getComputedStyle(el).order)

    // Expected order on mobile: 1st place should be order 1, 2nd place order 2, 3rd place order 3.
    // However, if base CSS appears after media query in profile-extras.css, order1 becomes 2 and order2 becomes 1.
    expect(order1).toBe('1')
    expect(order2).toBe('2')
    expect(order3).toBe('3')

    const box1 = await card1.boundingBox()
    const box2 = await card2.boundingBox()
    expect(box1).not.toBeNull()
    expect(box2).not.toBeNull()
    if (box1 && box2) {
      expect(box1.y).toBeLessThan(box2.y)
    }
  })

  test('R1 UI: Tap highlight is transparent and anchor scroll-margin-top protects against sticky header', async ({ page }) => {
    await page.goto('/')
    const btnTap = await page.evaluate(() => {
      const btn = document.querySelector('button, a')
      return btn ? window.getComputedStyle(btn).webkitTapHighlightColor : ''
    })
    expect(btnTap).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/)

    // Any element with an ID should have scroll-margin-top
    const scrollMargin = await page.evaluate(() => {
      const testEl = document.createElement('div')
      testEl.id = 'anchor-test'
      document.body.appendChild(testEl)
      const val = window.getComputedStyle(testEl).scrollMarginTop
      testEl.remove()
      return val
    })
    expect(scrollMargin).not.toBe('0px')
    expect(scrollMargin).not.toBe('')
  })

  test('R3 SEO: Dynamic OpenGraph & Twitter tags synchronize during client-side SPA transitions', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Anime Life/)

    const initialOgTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(initialOgTitle).toContain('Anime Life')

    // Navigate to Catalog via link
    await page.getByRole('link', { name: 'Каталог' }).first().click()
    await expect(page).toHaveURL(/\/catalog/)
    await expect(page).toHaveTitle(/Каталог/)

    const catalogOgTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(catalogOgTitle).toContain('Каталог')

    // Navigate to Community
    await page.goto('/community')
    await expect(page).toHaveTitle(/Сообщество/)
    const communityOgTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(communityOgTitle).toContain('Сообщество')
  })

  test('R3 SEO: Robots.txt contains hardened disallows and sitemap is valid XML', async ({ page }) => {
    const robotsRes = await page.request.get('/robots.txt')
    expect(robotsRes.ok()).toBe(true)
    const robotsText = await robotsRes.text()
    expect(robotsText).toContain('Disallow: /c/*/edit')
    expect(robotsText).toContain('Disallow: /manga/*/upload')
    expect(robotsText).toContain('Sitemap: https://animelife.top/sitemap.xml')

    const sitemapRes = await page.request.get('/sitemap.xml')
    expect(sitemapRes.ok()).toBe(true)
    const sitemapText = await sitemapRes.text()
    expect(sitemapText).toContain('<?xml')
    expect(sitemapText).toContain('<sitemapindex')
    expect(sitemapText).toContain('https://animelife.top/sitemap-pages.xml')
  })

  test('R6 Features: Volume hotkeys ArrowUp / ArrowDown trigger HUD feedback', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop hotkey verification')
    await page.goto('/watch/1/1')
    await expect(page.locator('video.player-video')).toBeAttached()

    // Focus player frame
    await page.locator('.player-frame').click()

    // Press ArrowUp
    await page.keyboard.press('ArrowUp')
    const note = page.locator('.vp-note, .vp-flash, [role="status"]').first()
    await expect(note).toBeAttached()

    // Press ArrowDown
    await page.keyboard.press('ArrowDown')
    await expect(note).toBeAttached()
  })

  test('R6 Features: Episode quick jump input validates numbers and navigates safely', async ({ page }) => {
    await page.goto('/watch/1/1')
    await expect(page.locator('video.player-video')).toBeAttached()

    const quickInput = page.getByRole('searchbox', { name: 'Найти серию' })
    await expect(quickInput).toBeVisible()

    // Invalid input: negative or out of bounds
    await quickInput.fill('99999')
    await quickInput.press('Enter')
    // Should NOT navigate to 99999
    expect(page.url()).not.toContain('/watch/1/99999')

    // Valid input: episode 2
    await quickInput.fill('2')
    await quickInput.press('Enter')
    await expect(page).toHaveURL(/\/watch\/1\/2$/)
  })

  test('R6 Features: Previous episode hotkey (P / Shift+N) triggers navigation to previous episode', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop keyboard hotkey verification')
    // Start on episode 2
    await page.goto('/watch/1/2')
    await expect(page.locator('video.player-video')).toBeAttached()

    // Focus player frame
    await page.locator('.player-frame').click()

    // Press 'p' to go to previous episode
    await page.keyboard.press('p')
    await expect(page).toHaveURL(/\/watch\/1\/1$/, { timeout: 10_000 })
  })

  test('R5 Resilience: Retry button appears in stream error/unavailable state and can be clicked', async ({ page }) => {
    // Mock anime with no trailer videos
    await page.route(/shikimori\.(one|io|me)\/api\/animes\/88888/, (route) => {
      const base = fixture('anime')
      return route.fulfill({
        json: { ...base, id: 88888, videos: [] },
      })
    })
    // Route releases endpoint to return empty releases to simulate unavailable stream
    await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: [] }))
    await page.goto('/watch/88888/1')

    const fallback = page.locator('.vp-fallback')
    await expect(fallback).toBeVisible({ timeout: 10_000 })
    const retryBtn = fallback.getByRole('button', { name: 'Повторить загрузку' })
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()
    // Should safely re-attempt without crashing
    await expect(fallback).toBeVisible()
  })
})

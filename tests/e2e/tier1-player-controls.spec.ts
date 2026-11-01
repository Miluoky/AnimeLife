import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from '../mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))
const search = fixture('anilibria-search')
const rawRelease = fixture('anilibria-release')

// Use .mp4 stream URLs so Chromium native media engine plays clip.webm directly
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

test.describe('Tier 1: Player Controls', () => {
  test('video player mounts native video element with AniLibria stream', async ({ page }) => {
    await page.goto('/watch/1/1')

    const video = page.locator('video.player-video')
    await expect(video).toBeAttached()
    await expect(page.locator('.vp-bar')).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Перемотка' })).toBeVisible()
  })

  test('episode navigation highlights active episode and switches episode on click', async ({ page }) => {
    await page.goto('/watch/1/1')

    const epNav = page.getByRole('navigation', { name: 'Серии' })
    await expect(epNav).toBeVisible()

    // First episode is active
    await expect(epNav.locator('[aria-current="page"]')).toHaveText('1')

    // Click episode 2
    const ep2Link = epNav.getByRole('link', { name: /^Серия 2/ }).first()
    await expect(ep2Link).toBeVisible()
    await ep2Link.click()

    await expect(page).toHaveURL(/\/watch\/1\/2$/)
    await expect(epNav.locator('[aria-current="page"]')).toHaveText('2')
  })

  test('playback controls toggle play and pause state', async ({ page }) => {
    await page.goto('/watch/1/1')

    const video = page.locator('video.player-video')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

    const bar = page.locator('.vp-bar')
    const initialPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)

    // Click play/pause button
    await bar.getByRole('button', { name: initialPaused ? 'Смотреть' : 'Пауза' }).click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(!initialPaused)

    // Click again to toggle back
    await bar.getByRole('button', { name: initialPaused ? 'Пауза' : 'Смотреть' }).click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(initialPaused)
  })

  test('playback speed menu alters video playbackRate and displays HUD feedback', async ({ page }) => {
    await page.goto('/watch/1/1')
    const video = page.locator('video.player-video')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

    // Open speed & quality menu
    const speedMenuBtn = page.getByRole('button', { name: 'Качество и скорость' })
    await expect(speedMenuBtn).toBeVisible()
    await speedMenuBtn.click()

    // Select 1.5x speed
    const speed15Btn = page.getByRole('button', { name: '1.5×' })
    await expect(speed15Btn).toBeVisible()
    await speed15Btn.click()

    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5)
  })

  test('keyboard hotkeys toggle play/pause, mute, and speed step', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard shortcuts apply to desktop environments')
    await page.goto('/watch/1/1')
    const video = page.locator('video.player-video')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

    // Press 'm' to mute
    await page.keyboard.press('m')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true)

    // Press 'm' again to unmute
    await page.keyboard.press('m')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false)

    // Press 'k' to toggle play/pause
    const wasPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    await page.keyboard.press('k')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(!wasPaused)

    // Step rate up with Shift+Period
    await page.keyboard.press('Shift+Period')
    await expect(page.getByRole('status').filter({ hasText: /Скорость/ })).toBeVisible()
  })

  test('playback time position persists across navigation', async ({ page }) => {
    // Navigate with explicit timestamp parameter ?t=45
    await page.goto('/watch/1/1?t=45')

    const video = page.locator('video.player-video')
    await expect(video).toBeAttached()

    // Verify stored position in localStorage
    const savedPos = await page.evaluate(() => {
      const store = localStorage.getItem('anime.positions.v1')
      return store ? JSON.parse(store) : null
    })
    expect(savedPos).not.toBeNull()
    expect(savedPos['1:1']).toBeDefined()
    expect(savedPos['1:1'].t).toBe(45)
  })
})

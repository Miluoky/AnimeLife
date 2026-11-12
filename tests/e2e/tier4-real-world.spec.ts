import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockCoreProfile, mockCoreTop, mockServices } from '../mocks'

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

async function setupFullEnvironmentMock(page: import('@playwright/test').Page) {
  await mockServices(page)
  await page.route(/api\.dreamerscast\.com\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/api\.dreamcast\.fun\/.*/, (r) => r.fulfill({ json: [] }))
  await page.route(/dcast\.online\/.*/, (r) => r.fulfill({ json: [] }))

  const clip = readFileSync(new URL('../fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.mp4/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: search }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))

  await mockCoreTop(page, [
    { $id: 'u_senku', name: 'Ishigami Senku', xp: 9999, weekXp: 990, monthXp: 3900, summary: '{"style":{"frame":"inferno"}}' },
    { $id: 'u_ryusui', name: 'Nanami Ryusui', xp: 8888, weekXp: 880, monthXp: 3400, summary: '{"style":{"frame":"void"}}' },
    { $id: 'u_gen', name: 'Asagiri Gen', xp: 7777, weekXp: 770, monthXp: 2900, summary: '{"style":{"frame":"sakura_anim"}}' },
  ])

  await mockCoreProfile(page, {
    who: {
      $id: 'who',
      name: 'Ishigami Senku',
      about: 'Kingdom of Science',
      updatedAt: 1700000000000,
      summary: JSON.stringify({
        xp: 9999,
        style: { frame: 'inferno', nameColor: 'orange' },
        counts: { watching: 3, planned: 12, completed: 42, dropped: 0 },
        facts: { episodes: 950, total: 57, ratings: {} },
        watching: [],
        recent: [],
        favorites: [],
        achievements: [],
      }),
    },
  })

  await page.addInitScript(() => {
    localStorage.setItem(
      'anime.profile.wall.v2',
      JSON.stringify({
        who: [
          {
            id: 'c1',
            userId: 'u_gen',
            name: 'Asagiri Gen',
            text: 'Наука побеждает магию!',
            at: Date.now() - 3600000,
            likes: 5,
            liked: false,
          },
        ],
      }),
    )
  })
}

test.beforeEach(async ({ page }) => {
  await setupFullEnvironmentMock(page)
})

test.describe('Tier 4: Real-World Scenarios', () => {
  test('end-to-end visitor journey: home hero -> catalog discovery -> title details -> player experience', async ({ page }) => {
    // Step 1: Arrive on Home page
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Смотреть аниме онлайн')

    // Step 2: Hero banner is interactive
    const heroTitle = page.locator('.hero__title')
    await expect(heroTitle).toBeVisible()
    const dots = page.getByRole('tab')
    if ((await dots.count()) > 1) {
      await dots.nth(1).click()
      await expect(dots.nth(1)).toHaveAttribute('aria-selected', 'true')
    }

    // Step 3: Navigate to Catalog via link or search
    await page.goto('/catalog?q=Cowboy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Поиск: «Cowboy»')

    // Step 4: Open Title Details page
    const card = page.locator('.poster-card').first()
    await expect(card).toBeVisible()
    await card.click()

    await expect(page).toHaveURL(/\/anime\//)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
    await expect(page.getByRole('heading', { name: 'О чём' })).toBeVisible()

    // Step 5: Launch player on episode 1
    const watchLink = page.getByRole('link', { name: /Смотреть|Серия 1/ }).first()
    await expect(watchLink).toBeVisible()
    await watchLink.click()

    await expect(page).toHaveURL(/\/watch\/.*\/1$/)
    const video = page.locator('video.player-video')
    await expect(video).toBeAttached()

    // Step 6: Verify player controls bar and episode navigation
    const epNav = page.getByRole('navigation', { name: 'Серии' })
    await expect(epNav.locator('[aria-current="page"]')).toHaveText('1')
  })

  test('community and social journey: leaderboard podium -> profile wall -> clubs -> chat', async ({ page }) => {
    // Step 1: Open Community page
    await page.goto('/community?tab=top')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сообщество')

    // Step 2: Leaderboard podium is rendered with top 3 users
    const podium = page.locator('.s-podium')
    await expect(podium).toBeVisible()
    await expect(podium).toContainText('Ishigami Senku')
    await expect(podium).toContainText('Nanami Ryusui')
    await expect(podium).toContainText('Asagiri Gen')

    // Step 3: Inspect user profile wall
    await page.goto('/u/who')
    await page.getByRole('button', { name: 'Стена' }).click()
    await expect(page.locator('.pf-wall-wrap')).toBeVisible()
    await expect(page.locator('.pf-wall-comment').first()).toBeVisible()

    // Step 4: Navigate to Community Clubs
    await page.goto('/community?tab=clubs')
    await expect(page.getByRole('link', { name: /Войдите, чтобы создать клуб/ })).toBeVisible()

    // Step 5: Navigate to general community chat
    await page.goto('/chat')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Общий чат')
    // Unauthenticated guest sees read-only notification
    await expect(page.getByText(/Войдите.*чтобы написать в чат/)).toBeVisible()
  })
})

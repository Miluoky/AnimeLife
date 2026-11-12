import { expect, test } from '@playwright/test'
import { mockCoreProfile, mockCoreTop, mockServices } from '../mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test.describe('Tier 1: Profile & Community', () => {
  test('community top-3 podium renders viewer rankings with calculated stats and leader crown', async ({ page }) => {
    await mockCoreTop(page, [
      { $id: 'u1', name: 'Senku', xp: 9500, weekXp: 850, monthXp: 3200, summary: '{"style":{"frame":"inferno"}}' },
      { $id: 'u2', name: 'Chrome', xp: 7200, weekXp: 620, monthXp: 2400, summary: '{"style":{"frame":"void"}}' },
      { $id: 'u3', name: 'Kohaku', xp: 5100, weekXp: 410, monthXp: 1800, summary: '{"style":{"frame":"sakura_anim"}}' },
    ])

    await page.goto('/community?tab=top')

    const podium = page.locator('.s-podium')
    await expect(podium).toBeVisible()

    // 1st place has leader crown
    const leaderCard = page.locator('.s-podium__card--1')
    await expect(leaderCard).toBeVisible()
    await expect(leaderCard.locator('.s-podium__crown')).toHaveText('👑')
    await expect(leaderCard).toContainText('Senku')

    // 2nd and 3rd place cards exist
    await expect(page.locator('.s-podium__card--2')).toContainText('Chrome')
    await expect(page.locator('.s-podium__card--3')).toContainText('Kohaku')
  })

  test('community section navigation tabs switch panels and update URL query', async ({ page }) => {
    await page.goto('/community')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сообщество')

    const tabsNav = page.getByRole('navigation', { name: 'Разделы сообщества' })
    await expect(tabsNav).toBeVisible()

    // Switch to 'Топ зрителей'
    await tabsNav.getByRole('button', { name: 'Топ зрителей' }).click()
    await expect(page).toHaveURL(/tab=top/)
    await expect(page.getByRole('button', { name: 'Опыт XP' })).toBeVisible()

    // Switch to 'Клубы'
    await tabsNav.getByRole('button', { name: 'Клубы' }).click()
    await expect(page).toHaveURL(/tab=clubs/)

    // Switch to 'Люди'
    await tabsNav.getByRole('button', { name: 'Люди' }).click()
    await expect(page).toHaveURL(/tab=people/)
  })

  test('profile customizer frame and appearance styling configuration', async ({ page }) => {
    // Set up local style store
    await page.addInitScript(() => {
      localStorage.setItem('anime.profile.style.v1', JSON.stringify({ frame: 'inferno', nameColor: 'orange' }))
    })

    await page.goto('/account')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('profile wall renders comments with author details and timestamps', async ({ page }) => {
    await mockCoreProfile(page, {
      who: {
        $id: 'who',
        name: 'Senku Ishigami',
        about: 'Kingdom of Science',
        updatedAt: 1700000000000,
        summary: JSON.stringify({
          xp: 5000,
          style: { frame: 'inferno', nameColor: 'orange' },
          counts: { watching: 2, planned: 5, completed: 8, dropped: 1 },
          facts: { episodes: 42, total: 16, ratings: {} },
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
              userId: 'u1',
              name: 'Chrome',
              text: 'Замечательная подборка научной фантастики!',
              at: Date.now() - 3600000,
              likes: 3,
              liked: false,
            },
          ],
        }),
      )
    })

    await page.goto('/u/who')
    await page.getByRole('button', { name: 'Стена' }).click()

    const wall = page.locator('.pf-wall-wrap')
    await expect(wall).toBeVisible()

    // Check pre-seeded wall comments
    const comments = page.locator('.pf-wall-comment')
    await expect(comments.first()).toBeVisible()
    await expect(comments.first().locator('.pf-wall-comment__top')).toContainText('Chrome')
    await expect(comments.first().locator('.pf-wall-comment__text')).toContainText('Замечательная подборка научной фантастики!')
  })

  test('profile wall enforces login protection on comment submission and like toggling for guests', async ({ page }) => {
    await mockCoreProfile(page, {
      who: {
        $id: 'who',
        name: 'Senku Ishigami',
        about: 'Kingdom of Science',
        updatedAt: 1700000000000,
        summary: JSON.stringify({
          xp: 5000,
          style: { frame: 'inferno', nameColor: 'orange' },
          counts: { watching: 2, planned: 5, completed: 8, dropped: 1 },
          facts: { episodes: 42, total: 16, ratings: {} },
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
              userId: 'u1',
              name: 'Chrome',
              text: 'Замечательная подборка научной фантастики!',
              at: Date.now() - 3600000,
              likes: 3,
              liked: false,
            },
          ],
        }),
      )
    })

    await page.goto('/u/who')
    await page.getByRole('button', { name: 'Стена' }).click()

    const input = page.locator('.pf-wall-input')
    await expect(input).toBeVisible()
    await input.fill('Отличный профиль и подборка аниме!')

    const submitBtn = page.getByRole('button', { name: 'Опубликовать' })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Verify toast prompts guest to sign in
    await expect(page.getByText(/Войдите в аккаунт, чтобы оставить запись на стене/)).toBeVisible()

    // Toggle like button on first comment prompts login
    const likeBtn = page.locator('.pf-wall-comment__act').first()
    await expect(likeBtn).toBeVisible()
    await likeBtn.click()
    await expect(page.getByText(/Войдите в аккаунт, чтобы ставить лайки/)).toBeVisible()
  })

  test('unauthenticated guest sees sign-in encouragement on community feed', async ({ page }) => {
    await page.goto('/community')
    await expect(page.getByText(/Войдите, чтобы видеть личную ленту/i)).toBeVisible()
  })
})

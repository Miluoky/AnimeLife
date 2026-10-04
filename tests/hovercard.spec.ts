import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('карточка при наведении: описание и «Буду смотреть» кладёт тайтл в список', async ({ page, isMobile }) => {
  test.skip(isMobile, 'только для мыши')
  await page.goto('/catalog')
  const card = page.locator('a.poster-card').first()
  await expect(card).toBeVisible()
  // Карточки подключаются, когда браузер свободен: ждём, пока часть загрузится, и наводим ещё раз.
  await expect(async () => {
    await page.mouse.move(0, 0)
    await card.hover()
    await expect(page.locator('.hovercard')).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 10000 })
  const pop = page.locator('.hovercard')
  await expect(pop.locator('.hovercard__title')).toHaveText('Ковбой Бибоп')
  await pop.getByRole('button', { name: 'Буду смотреть' }).click()
  await expect(pop.getByRole('link', { name: 'Буду смотреть' })).toBeVisible()

  await page.mouse.move(5, 5)
  await expect(pop).toHaveCount(0)
})

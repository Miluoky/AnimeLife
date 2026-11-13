import type { Locator, Page } from '@playwright/test'

/**
 * Блоки ниже первого экрана (DeferNear) появляются только рядом с зоной видимости.
 * Прокручиваем, пока локатор не смонтируется.
 */
export async function reveal(page: Page, target: Locator) {
  for (let i = 0; i < 16 && (await target.count()) === 0; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.max(700, Math.round(window.innerHeight * 0.85))))
    await page.waitForTimeout(40)
  }
}

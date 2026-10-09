import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

// Ни одна страница не должна давать горизонтальную прокрутку: от самого узкого телефона (320 px)
// до широкого монитора и телефона, повёрнутого боком. SHOTS=папка сохраняет скриншоты для просмотра глазами.
const SCREENS = [
  { name: '320', width: 320, height: 640 },
  { name: '375', width: 375, height: 740 },
  { name: '430', width: 430, height: 900 },
  { name: 'landscape', width: 740, height: 360 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
]

const ROUTES = ['/', '/catalog', '/anime/21', '/watch/21/1', '/schedule', '/top', '/random', '/together', '/my-list', '/account', '/quiz', '/collections', '/changelog', '/privacy', '/ongoing']

for (const screen of SCREENS) {
  test(`без горизонтальной прокрутки: ${screen.name}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'размеры экрана задаются в самом тесте')
    test.setTimeout(90_000)
    await mockServices(page)
    await page.setViewportSize({ width: screen.width, height: screen.height })
    const wide: string[] = []
    for (const route of ROUTES) {
      await page.goto(route)
      await page.locator('main').first().waitFor({ timeout: 5000 })
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        if (document.documentElement.scrollWidth <= width) return null
        // Первые элементы, вылезающие за правый край, чтобы сразу было видно виновника.
        const culprits = [...document.querySelectorAll('body *')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.right > width + 1 && getComputedStyle(el).position !== 'fixed'
          })
          .filter((el) => !el.closest('[class*="scroll"], [class*="shelf"], [class*="rail"]') || el.closest('main') === null)
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}`)
        return `${document.documentElement.scrollWidth}px: ${culprits.join(', ')}`
      })
      if (overflow) wide.push(`${route} ${overflow}`)
      if (process.env.SHOTS) {
        await page.screenshot({ path: `${process.env.SHOTS}/${screen.name}${route.replace(/\//g, '_') || '_home'}.png` })
      }
    }
    expect(wide).toEqual([])
  })
}

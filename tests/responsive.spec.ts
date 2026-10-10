import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

// Ни одна страница не должна давать горизонтальную прокрутку: от самого узкого телефона (320 px)
// через ноутбук 1024 px до широкого монитора и телефона, повёрнутого боком. SHOTS=папка сохраняет скриншоты для просмотра глазами.
const SCREENS = [
  { name: '320', width: 320, height: 640 },
  { name: '375', width: 375, height: 740 },
  { name: '430', width: 430, height: 900 },
  { name: 'landscape', width: 740, height: 360 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'small-laptop', width: 1024, height: 700 },
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
      // Шапка обрезает лишнее, поэтому её проверяем отдельно: на 920–1180 px кнопка входа уезжала за край.
      const header = await page.evaluate(() => {
        const el = document.querySelector('.site-header__inner')
        return el && el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0
      })
      if (header) wide.push(`${route} шапка ${header}px`)
      if (process.env.SHOTS) {
        await page.screenshot({ path: `${process.env.SHOTS}/${screen.name}${route.replace(/\//g, '_') || '_home'}.png` })
      }
    }
    expect(wide).toEqual([])
  })
}

// Короткие подписи не обрезаются многоточием и не наезжают друг на друга (баг с iPhone: «Мой спис…»,
// строка «Смотреть аниме онлайн» под «Продолжить просмотр», «мотреть вместе» в узкой ячейке под плеером).
for (const width of [320, 390]) {
  test(`подписи целиком: ${width}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'размеры экрана задаются в самом тесте')
    await mockServices(page)
    await page.addInitScript(() => {
      const entry = (id: string, title: string) => ({ animeId: id, title, posterFill: '#333', episode: 1, totalEpisodes: 1155, updatedAt: 1 })
      localStorage.setItem('anime.history.v1', JSON.stringify([entry('1', 'Первый'), entry('2', 'Второй')]))
    })
    await page.setViewportSize({ width, height: 760 })
    const cut: string[] = []
    for (const route of ['/', '/watch/21/1', '/account', '/catalog']) {
      await page.goto(route)
      await page.locator('main').first().waitFor({ timeout: 5000 })
      await page.waitForTimeout(400)
      cut.push(
        ...(await page.evaluate(() => {
          const out: string[] = []
          const els = document.querySelectorAll('.bottom-nav__item span, .watch-actions .btn, .seg__item, .poster-card__meta, .continue-card .poster-card__meta')
          for (const el of els) {
            const r = el.getBoundingClientRect()
            if (r.width === 0) continue
            if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > innerWidth + 1) out.push(`${location.pathname} «${el.textContent?.trim()}»`)
          }
          const title = document.querySelector('.home-title')?.getBoundingClientRect()
          const shelf = document.querySelector('.home__personal h2')?.getBoundingClientRect()
          if (title && shelf && title.bottom > shelf.top) out.push('«Смотреть аниме онлайн» наезжает на «Продолжить просмотр»')
          return out
        })),
      )
    }
    expect(cut).toEqual([])
  })
}

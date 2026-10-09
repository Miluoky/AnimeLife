import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('главная: смену тайтлов в баннере можно остановить и продолжить', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/')
  // Какой тайтл сейчас в баннере — по выбранной миниатюре: подробности тайтла в заготовках у всех одинаковые.
  const title = page.locator('.hero__thumbs [aria-selected="true"]')
  await expect(page.locator('.hero__title')).toBeVisible()
  const initialTitle = await title.getAttribute('aria-label')

  await page.clock.fastForward(8100)
  await expect(title).not.toHaveAttribute('aria-label', initialTitle ?? '')

  await page.getByRole('button', { name: 'Поставить смену тайтлов на паузу' }).click()
  // Preact снимает таймер в эффекте после отрисовки (rAF или setTimeout), а часы в тесте ненастоящие:
  // чуть прокручиваем их, чтобы пауза точно вступила в силу до следующей смены через 8 с.
  await expect(page.getByRole('button', { name: 'Продолжить смену тайтлов' })).toBeVisible()
  await page.clock.runFor(200)
  const pausedTitle = await title.getAttribute('aria-label')
  await page.clock.fastForward(16000)
  await expect(title).toHaveAttribute('aria-label', pausedTitle ?? '')

  await page.getByRole('button', { name: 'Продолжить смену тайтлов' }).click()
  await page.clock.runFor(8100)
  await expect(title).not.toHaveAttribute('aria-label', pausedTitle ?? '')
})

test('главная: историю просмотра показывает перед баннером', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'anime.history.v1',
      JSON.stringify([{ animeId: '1', title: 'Первый', posterFill: '#333', episode: 3, totalEpisodes: 12, updatedAt: 1 }]),
    )
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Продолжить просмотр' })).toBeVisible()
  await expect(page.locator('.hero')).toBeVisible()
  const positions = await page.evaluate(() => ({
    personal: document.querySelector('.home__personal')!.getBoundingClientRect().top,
    hero: document.querySelector('.hero')!.getBoundingClientRect().top,
  }))
  expect(positions.personal).toBeLessThan(positions.hero)
})

test('главная: при reduced motion баннер стоит на паузе, но его можно запустить вручную', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Продолжить смену тайтлов' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Продолжить смену тайтлов' }).click()
  await expect(page.getByRole('button', { name: 'Поставить смену тайтлов на паузу' })).toHaveAttribute('aria-pressed', 'false')
})

test('главная: полка «Ближайшие серии» по расписанию на сутки вперёд', async ({ page }) => {
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
  const calendar = [
    { next_episode: 5, next_episode_at: hours(3), duration: 24, anime: animes[1] },
    { next_episode: 2, next_episode_at: hours(1), duration: 24, anime: animes[0] },
    { next_episode: 9, next_episode_at: hours(30), duration: 24, anime: animes[2] },
    { next_episode: 7, next_episode_at: hours(5), duration: 24, anime: animes[3] },
    { next_episode: 3, next_episode_at: hours(8), duration: 24, anime: animes[4] },
  ]
  await page.route(/\/api\/(shiki\/)?calendar/, (route) => route.fulfill({ json: calendar }))
  await page.goto('/')
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Ближайшие серии' }) })
  // Четыре серии в пределах суток, по времени выхода; та, что через 30 часов, не попадает.
  await expect(shelf.locator('.poster-card')).toHaveCount(4)
  await expect(shelf.locator('.poster-card').first()).toContainText('2 эп.')
  await expect(shelf.getByRole('link', { name: /Расписание/ })).toHaveAttribute('href', '/schedule')
})

test('главная: «Новые серии в вашем списке» по расписанию и прогрессу', async ({ page }) => {
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
  await page.route(/\/api\/(shiki\/)?calendar/, (route) =>
    route.fulfill({
      json: [
        { next_episode: 6, next_episode_at: hours(2), duration: 24, anime: animes[0] },
        { next_episode: 4, next_episode_at: hours(5), duration: 24, anime: animes[1] },
      ],
    }),
  )
  const entry = (a: { id: number; russian: string }, watched: number) => ({
    anime: { id: String(a.id), title: a.russian, kind: 'TV', ongoing: true, posterFill: '#333', genres: [] },
    status: 'watching',
    addedAt: 1,
    watched,
  })
  // Первый тайтл: вышло 5 серий, просмотрено 3. Второй: вышло 3, просмотрено 3 — на полку не попадает.
  await page.addInitScript((list) => localStorage.setItem('anime.mylist.v1', JSON.stringify(list)), [entry(animes[0], 3), entry(animes[1], 3)])
  await page.goto('/')
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Новые серии в вашем списке' }) })
  await expect(shelf.locator('.poster-card')).toHaveCount(1)
  await expect(shelf.locator('.poster-card__tag')).toHaveText('Новых серий: 2')
  const positions = await page.evaluate(() => ({
    shelf: document.querySelector('.home__personal')!.getBoundingClientRect().top,
    hero: document.querySelector('.hero')!.getBoundingClientRect().top,
  }))
  expect(positions.shelf).toBeLessThan(positions.hero)
})

test('главная: плитки жанров ведут на страницы жанров', async ({ page }) => {
  await page.goto('/')
  const tiles = page.locator('.genre-tile')
  await expect(tiles).toHaveCount(12)
  await expect(tiles.filter({ hasText: 'Экшен' }).locator('img')).toHaveAttribute('src', /40748\.jpg$/)
  await expect(tiles.filter({ hasText: 'Романтика' }).locator('img')).toHaveAttribute('loading', 'lazy')
  await expect(tiles.filter({ hasText: 'Романтика' })).toHaveAttribute('href', '/genre/romance')
  await tiles.filter({ hasText: 'Меха' }).click()
  await expect(page).toHaveURL(/\/genre\/mecha$/)
})

test('главная: карточки «Ещё на сайте» ведут в мини-игру, подбор и подборки', async ({ page }) => {
  await page.goto('/')
  const cards = page.getByRole('region', { name: 'Ещё на сайте' }).getByRole('link')
  await expect(cards).toHaveCount(3)
  await cards.filter({ hasText: 'Угадай по кадру' }).click()
  await expect(page).toHaveURL(/\/quiz$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Угадай аниме по кадру')
})

test('главная: тайтл можно убрать из «Продолжить просмотр» и вернуть', async ({ page }) => {
  await page.addInitScript(() => {
    const entry = (id: string, title: string) => ({ animeId: id, title, posterFill: '#333', episode: 3, totalEpisodes: 12, updatedAt: 1 })
    localStorage.setItem('anime.history.v1', JSON.stringify([entry('1', 'Первый'), entry('2', 'Второй')]))
    localStorage.setItem('anime.positions.v1', JSON.stringify({ '2:3': { t: 754, d: 1420, at: 1 } }))
  })
  await page.goto('/')
  const cards = page.locator('.continue-item')
  await expect(cards).toHaveCount(2)
  // Плеер запомнил место внутри серии: оно видно на карточке.
  await expect(cards.nth(1)).toContainText('Серия 3 из 12 · с 12:34')
  await expect(cards.nth(0)).not.toContainText(' · с ')
  await page.getByRole('button', { name: 'Убрать «Первый» из продолжения' }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Второй')
  await page.getByRole('button', { name: 'Вернуть' }).click()
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Первый')
})

test('главная: заголовок полки сезона ведёт на страницу только этого сезона', async ({ page }) => {
  await page.goto('/')
  const link = page.locator('.shelf__title-link', { hasText: /^(Зима|Весна|Лето|Осень) \d{4}$/ })
  await link.scrollIntoViewIfNeeded()
  await expect(link).toHaveAttribute('href', /^\/year\/\d{4}\/(winter|spring|summer|fall)$/)
  await link.click()
  await expect(page).toHaveURL(/\/year\/\d{4}\/(winter|spring|summer|fall)$/)
  await expect(page.locator('h1')).toContainText(/Аниме (зимы|весны|лета|осени) \d{4}/i)
})

test('«назад» со страницы тайтла возвращает на то же место главной', async ({ page }) => {
  await page.goto('/')
  // Полки грузятся по мере прокрутки: сначала докручиваем до жанров, потом берём постер полки над ними.
  await page.getByRole('heading', { name: 'Жанры' }).scrollIntoViewIfNeeded()
  const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Лучшее за всё время' }) })
  await shelf.scrollIntoViewIfNeeded()
  const poster = shelf.locator('a[href^="/anime/"]').first()
  await expect(poster).toBeVisible()
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(500)
  await poster.click()
  await expect(page).toHaveURL(/\/anime\//)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(100)
  await page.goBack()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 50)
})

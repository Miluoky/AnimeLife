import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
// Поиск отдаёт сначала фильм с похожим названием (другой id Shikimori), потом сам сериал (id 1, как у тайтла в anime.json).
const search = fixture('anilibria-search')
const release = fixture('anilibria-release')

/** Подменяет API AniLibria v1: выдачу поиска и релиз 8443. Плейлисты HLS не отвечают — проверяем только запрос. */
async function mockAniLibria(page: Page, found: unknown[]) {
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: found }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))
  await page.route(/cache\.libria\.fun\/.*/, () => {})
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('плеер: AniLibria берёт релиз с тем же id Shikimori и играет нужную серию', async ({ page }) => {
  await mockAniLibria(page, search)
  const stream = page.waitForRequest(/cache\.libria\.fun\/videos\/media\/ts\/8443\/2\/1080\/.*\.m3u8/)
  await page.goto('/watch/1/2')
  await stream
  await expect(page.locator('video.player-video')).toBeAttached()
  // В полосе серий подсвечена вторая, рядом название серии из AniLibria.
  const episodes = page.getByRole('navigation', { name: 'Серии' })
  await expect(episodes.locator('[aria-current="page"]')).toHaveText('2')
  await expect(episodes.getByRole('link', { name: 'Серия 2: Потерявшийся Пёс' })).toBeVisible()
  // Вкладка источника без обещания «без рекламы»: в новых потоках AniLibria она бывает.
  await expect(page.getByRole('tab', { name: 'AniLibria', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(/вот трейлер/)).toHaveCount(0)
})

test('плеер: нет релиза с тем же id Shikimori — трейлер и пояснение вместо пустого экрана', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.goto('/watch/1/1')
  await expect(page.getByText('Серий этого аниме пока нет в доступных источниках — вот трейлер.')).toBeVisible()
  await expect(page.getByTitle('Трейлер: Ковбой Бибоп')).toHaveAttribute('src', 'https://youtube.com/embed/TdBfgwHmQsQ')
  await expect(page.locator('video')).toHaveCount(0)
  // Других источников без токенов Kodik/Alloha нет — и кнопки переключения тоже.
  await expect(page.getByRole('button', { name: 'Попробовать другой источник' })).toHaveCount(0)
})

test('плеер: серии нет в релизе AniLibria — так и говорим, а не включаем первую', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.goto('/watch/1/5')
  await expect(page.getByText('Серии 5 пока нет в AniLibria — вот трейлер.')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test('плеер: поиск по одному названию не ответил — ищем по следующему', async ({ page }) => {
  await mockAniLibria(page, search)
  let searches = 0
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) =>
    ++searches === 1 ? route.fulfill({ status: 503, body: '' }) : route.fallback(),
  )
  const stream = page.waitForRequest(/cache\.libria\.fun\/videos\/media\/ts\/8443\/1\/1080\/.*\.m3u8/)
  await page.goto('/watch/1/1')
  await stream
  expect(searches).toBe(2)
})

test('плеер: свои кнопки поверх видео — пауза и воспроизведение, перемотка, переход по сериям', async ({ page }) => {
  await mockAniLibria(page, search)
  // Притворяемся браузером с HLS «из коробки» и вместо плейлиста отдаём короткий ролик webm:
  // так видео в тестовом Chromium действительно грузится и играет.
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return type === 'application/vnd.apple.mpegurl' ? 'maybe' : original.call(this, type)
    }
  })
  const clip = readFileSync(new URL('./fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.m3u8/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.goto('/watch/1/1')

  const video = page.locator('video.player-video')
  await expect(video).not.toHaveAttribute('controls')
  await expect(page.getByRole('slider', { name: 'Перемотка' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Качество и скорость' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'На весь экран' })).toBeVisible()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

  // Кнопка в панели переключает воспроизведение и меняет подпись.
  const bar = page.locator('.vp-bar')
  const wasPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
  await bar.getByRole('button', { name: wasPaused ? 'Смотреть' : 'Пауза' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(!wasPaused)
  await expect(bar.getByRole('button', { name: wasPaused ? 'Пауза' : 'Смотреть' })).toBeVisible()
  await bar.getByRole('button', { name: wasPaused ? 'Пауза' : 'Смотреть' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(wasPaused)

  // Меню качества и скорости: скорость применяется к видео.
  await page.getByRole('button', { name: 'Качество и скорость' }).click()
  await page.getByRole('button', { name: '1.5×' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5)

  // Номер серии в полосе ведёт на её страницу.
  await page.getByRole('navigation', { name: 'Серии' }).getByRole('link', { name: /^Серия 3/ }).click()
  await expect(page).toHaveURL(/\/watch\/1\/3$/)
  await expect(page.getByRole('heading', { name: 'Серия 3' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Серии' }).locator('[aria-current="page"]')).toHaveText('3')
})

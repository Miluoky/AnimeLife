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
  // Источник выбирается в списке озвучек сбоку от видео.
  await expect(page.getByRole('button', { name: /^AniLibria/ })).toHaveAttribute('aria-pressed', 'true')
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
  // Полоса серий не делает вид, что озвучены все: у AniLibria только 1–3 из 26, остальные приглушены.
  await expect(page.getByText('В озвучке AniLibria: 3 из 26.')).toBeVisible()
  const episodes = page.getByRole('navigation', { name: 'Серии' })
  await expect(episodes.getByRole('link', { name: 'Серия 5, нет в озвучке AniLibria' })).toHaveClass(/ep-chip--missing/)
  await expect(episodes.getByRole('link', { name: /^Серия 2: / })).not.toHaveClass(/ep-chip--missing/)
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
  await expect(page.getByRole('button', { name: '0.25×' })).toBeVisible()
  await expect(page.getByRole('button', { name: '3×' })).toBeVisible()
  await page.getByRole('button', { name: '1.5×' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5)
  // Shift + > — на шаг быстрее, с подсказкой поверх видео.
  await page.keyboard.press('Escape')
  await page.locator('body').press('Shift+Period')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.75)
  await expect(page.getByRole('status').filter({ hasText: 'Скорость 1.75×' })).toBeVisible()

  // Номер серии в полосе ведёт на её страницу.
  await page.getByRole('navigation', { name: 'Серии' }).getByRole('link', { name: /^Серия 3/ }).click()
  await expect(page).toHaveURL(/\/watch\/1\/3$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ковбой Бибоп Серия 3' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Серии' }).locator('[aria-current="page"]')).toHaveText('3')
})

test('плеер: таймер сна ставит видео на паузу через выбранное время', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return type === 'application/vnd.apple.mpegurl' ? 'maybe' : original.call(this, type)
    }
  })
  const clip = readFileSync(new URL('./fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.m3u8/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.clock.install()
  await page.goto('/watch/1/1')
  const video = page.locator('video.player-video')
  // Дожидаемся, пока ролик правда играет (по кругу, он короткий): иначе пауза таймера смешается с автозапуском.
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) => {
        v.loop = true
        if (v.paused) void v.play().catch(() => undefined)
        return !v.paused && v.currentTime > 0
      }),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Качество и скорость' }).click()
  await page.getByRole('button', { name: '15 мин' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Таймер сна: 15 мин' })).toBeVisible()
  await expect(page.locator('.vp-menu__title').filter({ hasText: 'Таймер сна' })).toContainText('15 мин')

  await page.clock.fastForward('15:01')
  await expect(page.getByRole('status').filter({ hasText: 'Таймер сна: видео на паузе' })).toBeVisible()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
})

test('плеер: озвучки списком сбоку и поиск серии по номеру или названию', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.goto('/watch/1/1')
  const voices = page.getByRole('region', { name: 'Выберите студию' })
  await expect(voices.getByRole('button', { name: /^AniLibria/ })).toHaveAttribute('aria-pressed', 'true')
  const episodes = page.getByRole('navigation', { name: 'Серии' })
  await expect(episodes.getByRole('link', { name: /^Серия 2: / })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Найти серию' }).fill('Пёс')
  await expect(episodes.getByRole('link')).toHaveCount(1)
  await expect(episodes.getByRole('link')).toHaveText('2')
  await page.getByRole('searchbox', { name: 'Найти серию' }).fill('99')
  await expect(page.getByText('Такой серии нет')).toBeVisible()
})

test('плеер: опенинг по разметке AniLibria — кнопка «Пропустить», метка на полосе и автопропуск', async ({ page }) => {
  const withOpening = {
    ...release,
    episodes: release.episodes.map((e: object, i: number) => (i === 0 ? { ...e, opening: { start: 0, stop: 5 } } : e)),
  }
  await mockAniLibria(page, search)
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: withOpening }))
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
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await expect(page.locator('.vp-seek__mark')).toHaveCount(1)

  // Подменённый ролик нельзя перематывать (сервер заготовки не отдаёт куски), поэтому время серии
  // в тесте живёт в переменной: плеер читает и меняет его как обычно.
  await video.evaluate((v: HTMLVideoElement) => {
    v.pause()
    let t = 0
    Object.defineProperty(v, 'currentTime', {
      configurable: true,
      get: () => t,
      set: (x: number) => {
        t = x
        v.dispatchEvent(new Event('timeupdate'))
      },
    })
    v.dispatchEvent(new Event('timeupdate'))
  })

  // Кнопка переносит в конец опенинга (опенинг — первые 5 секунд).
  await page.getByRole('button', { name: 'Пропустить опенинг' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(5)
  await expect(page.getByRole('button', { name: 'Пропустить опенинг' })).toBeHidden()

  // Автопропуск: включаем в меню, с начала серии видео само перепрыгивает опенинг, «Вернуть» откатывает.
  await page.getByRole('button', { name: 'Качество и скорость' }).click()
  await page.getByRole('button', { name: 'Пропускать сами' }).click()
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true
    v.currentTime = 0
    return v.play()
  })
  await expect(page.getByRole('status').filter({ hasText: 'Опенинг пропущен' })).toBeVisible()
  await page.getByRole('button', { name: 'Вернуть' }).click()
  await expect(page.getByRole('button', { name: 'Пропустить опенинг' })).toBeVisible()
})

test('обсуждение: таймкод в комментарии переводит плеер, «Вставить время» пишет текущий момент', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u1', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/comments\/rows\?.*/, (route) =>
    route.fulfill({
      json: {
        total: 1,
        rows: [{ $id: 'c1', animeId: '1', episode: 1, userId: 'u2', name: 'Боря', text: 'На 1:05 лучший момент', spoiler: false, at: Date.now() }],
      },
    }),
  )
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
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  // Ролик-заглушка не перематывается: время серии живёт в переменной, длительность — 24 минуты.
  await video.evaluate((v: HTMLVideoElement) => {
    v.pause()
    v.play = () => Promise.resolve()
    let t = 0
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 1440 })
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => t, set: (x: number) => (t = x) })
  })

  const block = page.getByRole('region', { name: 'Обсуждение серии 1' })
  await block.getByRole('button', { name: 'Перейти к 1:05' }).click()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(65)

  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 754))
  const field = block.getByRole('textbox', { name: 'Комментарий к серии' })
  await field.fill('Смотрите')
  await block.getByRole('button', { name: 'Вставить время' }).click()
  await expect(field).toHaveValue('Смотрите 12:34 ')
})

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

test('плеер: AniLibria берёт релиз с тем же id Shikimori и играет нужную серию', async ({ page, isMobile }) => {
  await mockAniLibria(page, search)
  // На узком экране видео стартует в 720p, на компьютере в 1080p (src/data/saver.ts).
  const quality = isMobile ? 720 : 1080
  const stream = page.waitForRequest(new RegExp(`cache\\.libria\\.fun/videos/media/ts/8443/2/${quality}/.*\\.m3u8`))
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
  const stream = page.waitForRequest(/cache\.libria\.fun\/videos\/media\/ts\/8443\/1\/(1080|720)\/.*\.m3u8/)
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

test('плеер: подсказка с горячими клавишами и переход цифрами к части серии', async ({ page, isMobile }) => {
  test.skip(isMobile, 'клавиатура только на компьютере')
  await mockAniLibria(page, search)
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
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration || 0)).toBeGreaterThan(0)

  await page.locator('body').press('Shift+Slash')
  const help = page.getByRole('dialog', { name: 'Горячие клавиши' })
  await expect(help).toBeVisible()
  await expect(help).toContainText('Следующая серия')
  await page.locator('body').press('Escape')
  await expect(help).toBeHidden()

  // Заготовку нельзя перематывать: время и длина серии живут в переменных, как в тесте опенинга.
  await video.evaluate((v: HTMLVideoElement) => {
    v.pause()
    let t = 0
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 1440 })
    Object.defineProperty(v, 'currentTime', {
      configurable: true,
      get: () => t,
      set: (x: number) => {
        t = x
        v.dispatchEvent(new Event('timeupdate'))
      },
    })
  })
  await page.locator('body').press('5')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(720)
})

test('плеер: в конце серии отсчёт до следующей, «Отмена» и автопереход', async ({ page }) => {
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
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

  // Серия «закончилась»: так ролик не надо досматривать.
  const finish = () =>
    video.evaluate((v: HTMLVideoElement) => {
      v.pause()
      Object.defineProperty(v, 'ended', { configurable: true, get: () => true })
      v.dispatchEvent(new Event('ended'))
    })
  await finish()
  const card = page.getByRole('status').filter({ hasText: /2 серия через \d/ })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Отмена' }).click()
  await expect(card).toBeHidden()
  await expect(page).toHaveURL(/\/watch\/1\/1$/)

  // Снова с начала и до конца: теперь ждём отсчёт до конца.
  await video.evaluate((v: HTMLVideoElement) => {
    Object.defineProperty(v, 'ended', { configurable: true, get: () => false })
    v.dispatchEvent(new Event('play'))
  })
  await finish()
  await expect(page.getByRole('status').filter({ hasText: '2 серия через 8' })).toBeVisible()
  for (let i = 0; i < 9; i++) await page.clock.runFor(1000)
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
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

  // Жалоба на чужой комментарий уходит в функцию community, кнопка больше не нажимается.
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    sent.push(JSON.parse(route.request().postDataJSON().body))
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: '{"ok":true,"hidden":false}' } })
  })
  page.once('dialog', (d) => d.accept())
  await block.getByRole('button', { name: 'Пожаловаться' }).click()
  await expect(block.getByRole('button', { name: 'Жалоба отправлена' })).toBeDisabled()
  expect(sent).toEqual([{ action: 'comment-report', commentId: 'c1' }])
})

test('последняя серия: «Дальше по порядку» ведёт на следующую основную часть франшизы', async ({ page }) => {
  const node = (id: number, year: number, kind: string, name: string) => ({
    id,
    date: Date.UTC(year, 0, 1) / 1000,
    name,
    image_url: `https://shikimori.io/system/animes/x96/${id}.jpg`,
    year,
    kind,
  })
  await page.route(/\/api\/(shiki\/)?animes\/1\/franchise/, (route) =>
    route.fulfill({
      json: {
        current_id: 1,
        nodes: [node(1, 1998, 'TV Сериал', 'Ковбой Бибоп'), node(9, 1999, 'OVA', 'Спецвыпуск'), node(5, 2001, 'Фильм', 'Ковбой Бибоп: Фильм')],
      },
    }),
  )
  await page.goto('/watch/1/26')
  const next = page.getByRole('complementary', { name: 'Следующая часть' })
  await expect(next).toContainText('Ковбой Бибоп: Фильм')
  await expect(next.getByRole('link', { name: 'Смотреть' })).toHaveAttribute('href', '/watch/5/1')
  await page.goto('/watch/1/25')
  await expect(page.getByRole('complementary', { name: 'Следующая часть' })).toHaveCount(0)
})

test('серии с таким номером нет: сколько вышло и кнопка к последней серии', async ({ page }) => {
  await page.goto('/watch/1/999')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Серия ещё не вышла')
  await expect(page.locator('main')).toContainText('Всего серий: 26.')
  await page.getByRole('link', { name: 'Последняя серия' }).click()
  await expect(page).toHaveURL(/\/watch\/1\/26$/)
})

test('плеер: нет в AniLibria, но есть в AnimeVost — включается AnimeVost в 720p по https', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  const searches: string[] = []
  await page.route(/api\.animevost\.org\/v1\/search/, (route) => {
    searches.push(new URLSearchParams(route.request().postData() ?? '').get('name') ?? '')
    return route.fulfill({
      json: {
        state: { status: 'ok' },
        data: [
          { id: 7, title: 'Ковбой Бибоп: Фильм / Cowboy Bebop: Tengoku no Tobira [1 из 1]', year: '2001' },
          { id: 8, title: 'Ковбой Бибоп / Cowboy Bebop [1-26 из 26]', year: '1998' },
        ],
      },
    })
  })
  await page.route(/api\.animevost\.org\/v1\/playlist/, (route) => {
    expect(new URLSearchParams(route.request().postData() ?? '').get('id')).toBe('8')
    return route.fulfill({
      json: [2, 1, 3].map((n) => ({ name: `${n} серия`, hd: `http://video.animetop.info/720/${n}.mp4`, std: `http://video.animetop.info/${n}.mp4` })),
    })
  })
  await page.route(/video\.animetop\.info\/.*/, () => {})
  const stream = page.waitForRequest('https://video.animetop.info/720/2.mp4')
  await page.goto('/watch/1/2')
  await stream
  expect(searches[0]).toBe('Ковбой Бибоп')
  await expect(page.getByRole('button', { name: /^AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /^AnimeVost/ })).toContainText('3 из 26')
  // AniLibria без релиза в списке не показываем.
  await expect(page.getByRole('button', { name: /^AniLibria/ })).toHaveCount(0)
  await expect(page.getByText(/вот трейлер/)).toHaveCount(0)
})

test('плеер: озвучки студий из Anixart, серия играет во встроенном плеере', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        content: [
          { id: 30, title_ru: 'Ковбой Бибоп: Фильм', title_original: 'Cowboy Bebop: Tengoku no Tobira', year: '2001' },
          { id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' },
        ],
      },
    }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        types: [
          { id: 2, name: 'AniLibria', is_sub: false, episodes_count: 26 },
          { id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26, icon: 'https://s3.anixmirai.com/voiceovers/studio-band.jpg' },
          { id: 46, name: 'Субтитры | CR', is_sub: true, episodes_count: 20 },
        ],
      },
    }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+$/, (route) =>
    route.fulfill({ json: { code: 0, sources: [{ id: 5, name: 'Sovet (не работает)', episodes_count: 26 }, { id: 30, name: 'Kodik', episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [1, 2].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true, is_filler: n === 2 })) } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await page.goto('/watch/1/2')
  // Филлеры размечены в Anixart: вторая серия отмечена в списке, под ним подсказка.
  await expect(page.getByRole('link', { name: /^Серия 2, филлер/ })).toHaveClass(/ep-chip--filler/)
  await expect(page.getByText(/Филлеры: 1 из 26/)).toContainText('Эта серия филлер.')
  // AniLibria без релиза: её студия приходит из Anixart, субтитры подписаны без префикса.
  await expect(page.getByRole('button', { name: /^AniLibria/ })).toContainText('26 эп.')
  // Субтитры на своей вкладке, как на Senku.
  await page.getByRole('button', { name: /^Субтитры/ }).click()
  await expect(page.getByRole('button', { name: /^CR/ })).toContainText('Субтитры')
  await page.getByRole('button', { name: /^Озвучка/ }).click()
  // У студии есть логотип: он вместо буквы.
  await expect(page.getByRole('button', { name: /^Studio Band/ }).locator('img')).toHaveAttribute('src', /studio-band\.jpg$/)
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', 'https://kodikplayer.com/seria/2/hash/720p')
  await expect(page.getByText(/вот трейлер/)).toHaveCount(0)
})

  // Ссылка на старый домен Kodik (kodik.info) должна открыться на рабочем kodikplayer.com.
test('плеер: AniLibria не ответила — включается другая озвучка, а AniLibria уходит в конец списка', async ({ page }) => {
  await page.route(/anilibria\.top\/api\/v1\/.*/, (route) => route.fulfill({ status: 500, body: '' }))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [{ position: 1, url: 'https://kodik.info/seria/1/hash/720p', iframe: true }] } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await page.goto('/watch/1/1')
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', 'https://kodikplayer.com/seria/1/hash/720p')
  await expect(page.locator('.voices__list .voice__title')).toHaveText(['Studio Band', 'AniLibria'])
})

test('плеер: Kodik продолжает с места, запоминает время, а после конца серии включает отсчёт до следующей', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [1, 2, 3].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true })) } }),
  )
  // Поддельный Kodik: шлёт события, как настоящий. Вторая серия начинает играть и после перемотки сообщает время,
  // первая сразу заканчивается.
  await page.route(/kodikplayer\.com\/seria\/(\d)\//, (route) => {
    const ep = route.request().url().match(/seria\/(\d)/)![1]
    const script =
      ep === '1'
        ? `parent.postMessage({ key: 'kodik_player_video_ended' }, '*')`
        : `parent.postMessage({ key: 'kodik_player_duration_update', value: 1400 }, '*')
           parent.postMessage({ key: 'kodik_player_play' }, '*')
           addEventListener('message', (e) => {
             if (e.data?.key !== 'kodik_player_api' || e.data.value.method !== 'seek') return
             document.title = 'seek:' + e.data.value.seconds
             parent.postMessage({ key: 'kodik_player_time_update', value: 600 }, '*')
           })`
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Kodik</title><script>${script}</script>` })
  })
  await page.addInitScript(() => {
    if (!localStorage.getItem('anime.positions.v1')) localStorage.setItem('anime.positions.v1', JSON.stringify({ '1:2': { t: 300, d: 1400, at: 1 } }))
  })
  await page.goto('/watch/1/2')
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  await expect(page.getByText('Продолжили с 5:00')).toBeVisible()
  await expect.poll(() => page.frames().find((f) => f.url().includes('seria/2'))?.title()).toBe('seek:300')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('anime.positions.v1')!)['1:2']?.t)).toBe(600)

  // Тайтл в списке: досмотренная до конца серия отмечается сразу, не дожидаясь следующей.
  await page.evaluate(() =>
    localStorage.setItem(
      'anime.mylist.v1',
      JSON.stringify([{ anime: { id: '1', title: 'Ковбой Бибоп', episodes: 26, posterFill: '#333' }, status: 'planned', watched: 0, addedAt: 1, updatedAt: 1 }]),
    ),
  )
  await page.goto('/watch/1/1')
  await expect(page.getByText('2 серия через')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('anime.mylist.v1')!)[0])).toMatchObject({ watched: 1, status: 'watching' })
  await page.getByRole('button', { name: 'Смотреть сейчас' }).click()
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
})

test('плеер: смена озвучки без паузы — новая готовится под прежней и встаёт на её место; смена серии без перезагрузки страницы', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        types: [
          { id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 },
          { id: 30, name: 'AniDUB', is_sub: false, episodes_count: 26 },
        ],
      },
    }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/(\d+)$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/(\d+)\/30$/, (route) => {
    const type = route.request().url().match(/31\/(\d+)\/30$/)![1]
    return route.fulfill({ json: { code: 0, episodes: [1, 2].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${type}${n}/hash/720p`, iframe: true })) } })
  })
  // Поддельный Kodik: серия идёт с 5:00, команды сайта он записывает в заголовок, на get_time отвечает 5:12.
  // Новый плеер отвечает не сразу — видно, как прежний играет, пока новый готовится.
  let delay = 0
  // stuck — в новом плеере ещё идёт реклама: «play» он не слушает, время стоит.
  let stuck = false
  await page.route(/kodikplayer\.com\/seria\//, async (route) => {
    await new Promise((r) => setTimeout(r, delay))
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Kodik</title><script>
        const log = []
        addEventListener('message', (e) => {
          if (e.data?.key !== 'kodik_player_api') return
          const v = e.data.value
          log.push(v.method + (v.seconds != null ? ':' + v.seconds : ''))
          document.title = log.join(',')
          // Время идёт, пока плеер играет; до первой перемотки он на 5:12.
          if (v.method === 'seek') (moved = true), (t = v.seconds), (at = performance.now())
          if (v.method === 'play' && !playing && !${stuck}) (t = now()), (at = performance.now()), (playing = true)
          if (v.method === 'pause') (t = now()), (playing = false)
          if (v.method === 'get_time') parent.postMessage({ key: 'kodik_player_time', value: moved ? now() : 312 }, '*')
        })
        let t = 300, at = 0, playing = false, moved = false
        const now = () => (playing ? t + (performance.now() - at) / 1000 : t)
        // Реклама позади (Kodik шлёт это, даже когда рекламы не было), видео идёт.
        parent.postMessage({ key: 'kodik_player_advert_ended' }, '*')
        parent.postMessage({ key: 'kodik_player_time_update', value: 300 }, '*')
        if (!${stuck}) parent.postMessage({ key: 'kodik_player_time_update', value: 301 }, '*')
        // Во второй серии Kodik шлёт время и дальше, как настоящий раз в секунду: сайт узнаёт, где серия идёт.
        if (location.pathname.endsWith('2/hash/720p')) setInterval(() => parent.postMessage({ key: 'kodik_player_time_update', value: 300 }, '*'), 500)
      </script>`,
    })
  })
  await page.goto('/watch/1/1')
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /seria\/291\//)
  await page.evaluate(() => ((document.querySelector('.page') as HTMLElement).dataset.mark = 'same'))
  await page.waitForTimeout(300)

  delay = 1500
  await page.getByRole('button', { name: /^AniDUB/ }).click()
  // Прежняя озвучка играет дальше, новая готовится под ней без звука с того же места.
  await expect(page.locator('iframe[data-role="live"]')).toHaveAttribute('src', /seria\/291\//)
  await expect(page.locator('iframe.player-iframe--prep')).toHaveAttribute('src', 'https://kodikplayer.com/seria/301/hash/720p?start_from=301')
  await expect(page.getByText('Подключаем озвучку…')).toBeVisible()
  // Новая пошла — она встаёт на место прежней точно с её времени и со звуком, прежняя уходит.
  const fresh = page.locator('iframe.player-iframe:not(.player-iframe--old)')
  await expect(page.locator('iframe.player-iframe')).toHaveCount(1, { timeout: 8000 })
  await expect(fresh).toHaveAttribute('src', /seria\/301\//)
  await expect.poll(() => page.frames().find((f) => f.url().includes('seria/301'))?.title()).toMatch(/^mute,.*seek:312\.3,play,(mute,|get_time,)*unmute,play$/)
  await expect(page.getByText('Подключаем озвучку…')).toHaveCount(0)
  // Прежняя озвучка не выгружена: она прогрета на паузе без звука и ждёт под новой.
  const warm = page.locator('iframe.player-warm')
  await expect(warm).toHaveAttribute('src', /seria\/291\//)
  await expect.poll(() => page.frames().find((f) => f.url().includes('seria/291'))?.title()).toMatch(/pause,mute(,mute)*$/)
  await warm.evaluate((el) => (el.dataset.mark = 'warm'))

  // Возврат к ней — без загрузки и без «Подключаем озвучку…»: тот же iframe перематывается на место и получает звук.
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  await expect(page.getByText('Подключаем озвучку…')).toHaveCount(0)
  await expect(page.locator('iframe[data-role="live"]')).toHaveAttribute('data-mark', 'warm', { timeout: 6000 })
  await expect.poll(() => page.frames().find((f) => f.url().includes('seria/291'))?.title()).toMatch(/pause,(mute,)+seek:31\d\.\d,play,(mute,|get_time,)*unmute,play$/)
  await expect(warm).toHaveAttribute('src', /seria\/301\//)

  // Другая серия: та же страница, без перехода и без прокрутки наверх; новая серия — с начала.
  delay = 0
  // Дальше в новых плеерах «реклама»: так прогретая заранее озвучка второй серии не успеет тронуться.
  stuck = true
  await page.getByRole('navigation', { name: 'Серии' }).getByRole('link', { name: 'Серия 2', exact: true }).click()
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
  await expect(fresh).toHaveAttribute('src', 'https://kodikplayer.com/seria/292/hash/720p')
  expect(await page.evaluate(() => (document.querySelector('.page') as HTMLElement).dataset.mark)).toBe('same')
  // Озвучки прошлой серии больше не нужны.
  await expect(page.locator('iframe.player-warm')).toHaveCount(0)

  // Новая озвучка не тронулась после перемотки (реклама): подмену отменяем, прежняя играет дальше со звуком.
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /^AniDUB/ }).click()
  await expect(page.locator('iframe.player-iframe--prep')).toHaveAttribute('src', /seria\/302\//)
  await page.waitForTimeout(4500)
  await expect(page.locator('iframe[data-role="live"]')).toHaveAttribute('src', /seria\/292\//)
  await expect(page.getByText('Подключаем озвучку…')).toBeVisible()
  expect(await page.frames().find((f) => f.url().includes('seria/292'))?.title()).not.toMatch(/pause|mute/)
})

test('плеер: ближе к концу серии следующая уже загружена и включается тем же плеером, без новой загрузки', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [1, 2, 3].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true })) } }),
  )
  // Поддельный Kodik: серия на 23 минуты, идёт 20-я минута; команды сайта пишет в заголовок.
  await page.route(/kodikplayer\.com\/seria\//, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Kodik</title><script>
        const log = []
        addEventListener('message', (e) => {
          if (e.data?.key !== 'kodik_player_api') return
          const v = e.data.value
          log.push(v.method + (v.seconds != null ? ':' + v.seconds : ''))
          document.title = log.join(',')
          if (v.method === 'seek') (t = v.seconds), (at = performance.now())
          if (v.method === 'play' && !playing) (t = now()), (at = performance.now()), (playing = true)
          if (v.method === 'pause') (t = now()), (playing = false)
          if (v.method === 'get_time') parent.postMessage({ key: 'kodik_player_time', value: now() }, '*')
        })
        let t = 0, at = 0, playing = false
        const now = () => (playing ? t + (performance.now() - at) / 1000 : t)
        const start = Number(new URL(location.href).searchParams.get('start_from') ?? 0)
        parent.postMessage({ key: 'kodik_player_duration_update', value: 1400 }, '*')
        parent.postMessage({ key: 'kodik_player_advert_ended' }, '*')
        const first = location.pathname.includes('/1/') ? 1200 : start
        parent.postMessage({ key: 'kodik_player_time_update', value: first }, '*')
        parent.postMessage({ key: 'kodik_player_time_update', value: first + 1 }, '*')
      </script>`,
    }),
  )
  await page.goto('/watch/1/1')
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  // Вторая серия грузится заранее, невидимо, но не запускается: в начале серии Kodik крутит рекламу.
  const warm = page.locator('iframe.player-warm')
  await expect(warm).toHaveAttribute('src', 'https://kodikplayer.com/seria/2/hash/720p', { timeout: 8000 })
  await page.waitForTimeout(1500)
  expect(await page.frames().find((f) => f.url().includes('seria/2/'))?.title()).toBe('Kodik')
  await warm.evaluate((el) => (el.dataset.mark = 'warm'))

  await page.getByRole('button', { name: 'Следующая серия' }).click()
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
  // Тот же iframe, без новой загрузки: запускается со звуком.
  await expect(page.locator('iframe[data-role="live"]')).toHaveAttribute('data-mark', 'warm')
  await expect.poll(() => page.frames().find((f) => f.url().includes('seria/2/'))?.title()).toMatch(/^unmute,play/)
  await expect(page.locator('iframe.player-iframe')).toHaveCount(1)
})

test('плеер: широкий экран на компьютере — видео во всю ширину, выбор запоминается', async ({ page }, info) => {
  await page.goto('/watch/1/1')
  const button = page.getByRole('button', { name: 'Широкий экран' })
  if (info.project.name === 'phone') {
    // На телефоне видео и так во всю ширину: кнопки нет.
    await expect(button).toBeHidden()
    return
  }
  // Заглушка плеера сменяется самим плеером, поэтому ширину читаем с повтором: boundingBox сам не ждёт.
  const width = async () => (await page.locator('.video-player').boundingBox())?.width ?? 0
  await expect.poll(width).toBeGreaterThan(0)
  const before = await width()
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('main')).toHaveClass(/player-page--wide/)
  await expect.poll(width).toBeGreaterThan(before)
  await page.reload()
  await expect(page.locator('main')).toHaveClass(/player-page--wide/)
})

/** Ответы YummyAnime для «Ковбоя Бибопа»: [озвучка, плеер, серии]. */
async function mockYummy(page: Page, videos: [string, string, number[], object?][]) {
  await page.route(/api\.yani\.tv\/search/, (route) =>
    route.fulfill({ json: { response: [{ anime_id: 7, remote_ids: { shikimori_id: 999 } }, { anime_id: 8, remote_ids: { shikimori_id: 1 } }] } }),
  )
  await page.route(/api\.yani\.tv\/anime\/8\/videos/, (route) =>
    route.fulfill({
      json: {
        response: videos.flatMap(([dubbing, player, numbers, extra]) =>
          numbers.map((n) => ({
            number: String(n),
            iframe_url: `//${player.toLowerCase()}.example/${encodeURIComponent(dubbing)}/${n}`,
            data: { player: `Плеер ${player}`, dubbing },
            ...extra,
          })),
        ),
      },
    }),
  )
  await page.route(/\.example\//, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Плеер</title>' }))
}

test('плеер: у студии есть запасные плееры YummyAnime, а новые студии добавляются в список', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [1, 2].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true })) } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await mockYummy(page, [
    ['Озвучка StudioBand', 'Kodik', [1, 2]],
    ['Озвучка StudioBand', 'CVH', [1, 2]],
    ['Озвучка StudioBand', 'Alloha', [1]],
    ['Озвучка OnWave', 'CVH', [1, 2, 3]],
  ])
  await page.goto('/watch/1/2')
  // Прежний Kodik ненадолго остаётся под новым плеером (на паузе): смотрим на тот, что сейчас играет.
  const playing = page.locator('iframe.player-iframe:not(.player-iframe--old)')
  await page.getByRole('button', { name: /^Studio Band/ }).click()
  const hosts = page.getByRole('group', { name: 'Плеер' })
  // Kodik у студии уже есть из Anixart: второй не показываем.
  await expect(hosts.getByRole('button')).toHaveText(['Kodik', 'CVH', 'Alloha'])
  await expect(hosts.getByRole('button', { name: 'Kodik' })).toHaveAttribute('aria-pressed', 'true')
  await hosts.getByRole('button', { name: 'CVH' }).click()
  await expect(playing).toHaveAttribute('src', 'https://cvh.example/%D0%9E%D0%B7%D0%B2%D1%83%D1%87%D0%BA%D0%B0%20StudioBand/2')
  // Второй серии в Alloha нет: так и пишем, а плеер можно сменить.
  await hosts.getByRole('button', { name: 'Alloha' }).click()
  await expect(page.getByText(/Серии 2 пока нет в плеере Alloha \(Studio Band\)/)).toBeVisible()
  // Студии, которой нет в других источниках, — в конце списка, со своим плеером.
  await page.getByRole('button', { name: /^OnWave/ }).click()
  await expect(playing).toHaveAttribute('src', /^https:\/\/cvh\.example\/.*OnWave\/2$/)
  await expect(page.getByRole('group', { name: 'Плеер' })).toHaveCount(0)
})

test('плеер: своих источников нет — серия из YummyAnime вместо трейлера', async ({ page }) => {
  await mockYummy(page, [['Озвучка AniDUB', 'Kodik', [1, 2]]])
  await page.goto('/watch/1/1')
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', 'https://kodik.example/%D0%9E%D0%B7%D0%B2%D1%83%D1%87%D0%BA%D0%B0%20AniDUB/1')
  await expect(page.getByText(/вот трейлер/)).toHaveCount(0)
  await expect(page.locator('.voices__list .voice__title')).toHaveText(['AniDUB'])
})

test('плеер: «Пропускать филлеры» — «Следующая серия» перескакивает филлеры подряд', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({
      json: { code: 0, episodes: [1, 2, 3, 4].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true, is_filler: n === 2 || n === 3 })) },
    }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await page.goto('/watch/1/1')
  const skip = page.getByRole('checkbox', { name: /Пропускать филлеры/ })
  await skip.check()
  await page.getByRole('button', { name: 'Следующая серия' }).click()
  await expect(page).toHaveURL(/\/watch\/1\/4$/)
  // Выбор запоминается: без него снова по порядку.
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Пропускать филлеры/ })).toBeChecked()
  await page.getByRole('checkbox', { name: /Пропускать филлеры/ }).uncheck()
  await page.goto('/watch/1/1')
  await page.getByRole('button', { name: 'Следующая серия' }).click()
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
})

/** AnimeVost с одной серией-заглушкой (ролик на 8 секунд) для «Ковбоя Бибопа». */
async function mockAnimeVost(page: Page) {
  await page.route(/api\.animevost\.org\/v1\/search/, (route) =>
    route.fulfill({ json: { state: { status: 'ok' }, data: [{ id: 8, title: 'Ковбой Бибоп / Cowboy Bebop [1-26 из 26]', year: '1998' }] } }),
  )
  await page.route(/api\.animevost\.org\/v1\/playlist/, (route) =>
    route.fulfill({ json: [{ name: '1 серия', hd: 'http://video.animetop.info/720/1.mp4' }] }),
  )
  const clip = readFileSync(new URL('./fixtures/clip.webm', import.meta.url))
  await page.route(/video\.animetop\.info\/.*/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
}

test('плеер: в AnimeVost опенинг пропускается по разметке YummyAnime для того же файла', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await mockAnimeVost(page)
  await mockYummy(page, [['Озвучка AnimeVost', 'Kodik', [1], { duration: 8, skips: { opening: { time: 0, length: 5 }, ending: null } }]])
  await page.goto('/watch/1/1')
  await expect(page.getByRole('button', { name: /^AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')
  const video = page.locator('video.player-video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await expect(page.locator('.vp-seek__mark')).toHaveCount(1)
  await video.evaluate((v: HTMLVideoElement) => {
    v.pause()
    v.dispatchEvent(new Event('timeupdate'))
  })
  await expect(page.getByRole('button', { name: 'Пропустить опенинг' })).toBeVisible()
})

test('плеер: разметку YummyAnime для файла другой длины не используем', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await mockAnimeVost(page)
  await mockYummy(page, [['Озвучка AnimeVost', 'Kodik', [1], { duration: 1420, skips: { opening: { time: 0, length: 5 } } }]])
  await page.goto('/watch/1/1')
  const video = page.locator('video.player-video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  await expect(page.locator('.vp-seek__mark')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Пропустить опенинг' })).toHaveCount(0)
})

test('плеер: «Чётче» рисует видео через фильтр на видеокарте, кнопки плеера остаются доступны', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return type === 'application/vnd.apple.mpegurl' ? 'maybe' : original.call(this, type)
    }
  })
  const clip = readFileSync(new URL('./fixtures/clip.webm', import.meta.url))
  // Как настоящий сервер AniLibria: видео отдаётся с разрешением CORS.
  await page.route(/cache\.libria\.fun\/.*\.m3u8/, (route) =>
    route.fulfill({ contentType: 'video/webm', body: clip, headers: { 'Access-Control-Allow-Origin': '*' } }),
  )
  await page.goto('/watch/1/1')
  const video = page.locator('video.player-video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(1)

  await page.getByRole('button', { name: 'Качество и скорость' }).click()
  await page.getByRole('button', { name: 'Чётче' }).click()
  // Видео перезагрузилось с crossOrigin, поверх него холст фильтра нужного размера.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.crossOrigin)).toBe('anonymous')
  const canvas = page.locator('canvas.player-canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0)
  await expect(page.getByRole('status').filter({ hasText: 'не умеет улучшать' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Чётче' })).toHaveAttribute('aria-pressed', 'true')

  // Выбор запоминается, «Без фильтра» убирает фильтр.
  await page.getByRole('button', { name: 'Без фильтра' }).click()
  await expect(canvas).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('anime.enhance.v1'))).toBe('false')
})

test('плеер: источник не может показать серию — сам включаем запасной плеер той же озвучки', async ({ page }) => {
  await mockAniLibria(page, search.slice(0, 1))
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  // В Kodik у Anixart второй серии нет, а в CVH у той же студии есть.
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [{ position: 1, url: 'https://kodikplayer.com/seria/1/hash/720p', iframe: true }] } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await mockYummy(page, [['Озвучка StudioBand', 'CVH', [1, 2]]])
  // Сбой источника уходит в статистику качества (data/quality.ts).
  const quality: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    if (body.action === 'quality-track') quality.push(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: '{"ok":true}' } })
  })
  await page.addInitScript(() => ((window as Window & { __reportQuality?: boolean }).__reportQuality = true))
  await page.goto('/watch/1/2')
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /^https:\/\/cvh\.example\/.*StudioBand\/2$/, { timeout: 15000 })
  await expect(page.getByText('Плеер Kodik не грузится, включили CVH')).toBeVisible()
  await expect.poll(() => quality.filter((q) => q.kind === 'player' && q.ok === false).length).toBe(1)
  await expect(page.getByRole('group', { name: 'Плеер' }).getByRole('button', { name: 'CVH' })).toHaveAttribute('aria-pressed', 'true')
  // Ушли со страницы серии, а запасной плеер так и не пошёл: серия считается несработавшей.
  await page.getByRole('link', { name: 'Anime Life, на главную' }).first().click()
  await expect.poll(() => quality.find((q) => q.kind === 'episode')?.result).toBe('failed')
})

/** Anixart с четырьмя студиями «Ковбоя Бибопа»: субтитры, Studio Band, Persona99 и Shachiburi (12 серий). */
async function mockBebopVoices(page: Page) {
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        types: [
          // Субтитров больше всего и они первые, но по умолчанию включается озвучка.
          { id: 46, name: 'Субтитры | CR', is_sub: true, episodes_count: 26 },
          { id: 29, name: 'Studio Band', is_sub: false, episodes_count: 25 },
          { id: 30, name: 'Persona99', is_sub: false, episodes_count: 26 },
          { id: 31, name: 'Shachiburi', is_sub: false, episodes_count: 12 },
        ],
      },
    }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [1, 2].map((n) => ({ position: n, url: `https://kodikplayer.com/seria/${n}/hash/720p`, iframe: true })) } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
}

test('плеер: по умолчанию популярная озвучка, а не субтитры; выбор помнится для тайтла', async ({ page }) => {
  await mockBebopVoices(page)
  await page.goto('/watch/1/1')
  // Studio Band популярнее по Anixart, и у неё почти все серии (25 из 26).
  await expect(page.getByRole('button', { name: /^Studio Band/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Persona99/ }).click()
  await page.goto('/watch/1/2')
  await expect(page.getByRole('button', { name: /^Persona99/ })).toHaveAttribute('aria-pressed', 'true')
  // Над списком серий оба числа: сколько вышло по Shikimori и сколько есть у источников.
  await expect(page.locator('.episodes__head', { hasText: 'Серии' })).toContainText('26 серий · 26 доступно')
})

test('плеер: любимая студия зрителя с других тайтлов включается на новом тайтле', async ({ page }) => {
  await mockBebopVoices(page)
  // На двух других тайтлах зритель сам выбирал Shachiburi — на новом она первая, хоть серий у неё меньше.
  await page.addInitScript(() => {
    if (localStorage.getItem('anime.voice.v1')) return
    const at = Date.now()
    localStorage.setItem(
      'anime.voice.v1',
      JSON.stringify({ '5': { key: 'kodik:9', at, studio: 'shachiburi' }, '6': { key: 'title:voice:shachiburi', at, studio: 'shachiburi' } }),
    )
  })
  await page.goto('/watch/1/1')
  await expect(page.getByRole('button', { name: /^Shachiburi/ })).toHaveAttribute('aria-pressed', 'true')
  // Серии 13 у неё нет — тогда как обычно, популярная с полным набором серий.
  await page.goto('/watch/1/13')
  await expect(page.getByRole('button', { name: /^Studio Band/ })).toHaveAttribute('aria-pressed', 'true')
})

test('плеер: серия на экране блокировки — название, пауза и следующая серия из системы', async ({ page }) => {
  await mockAniLibria(page, search)
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return type === 'application/vnd.apple.mpegurl' ? 'maybe' : original.call(this, type)
    }
    // Запоминаем обработчики, которые сайт отдал системе, чтобы нажать их «как с экрана блокировки».
    const handlers: Record<string, MediaSessionActionHandler | null> = {}
    ;(window as unknown as { msHandlers: typeof handlers }).msHandlers = handlers
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession)
    navigator.mediaSession.setActionHandler = (action, handler) => {
      handlers[action] = handler
      set(action, handler)
    }
  })
  const clip = readFileSync(new URL('./fixtures/clip.webm', import.meta.url))
  await page.route(/cache\.libria\.fun\/.*\.m3u8/, (route) => route.fulfill({ contentType: 'video/webm', body: clip }))
  await page.goto('/watch/1/1')

  const video = page.locator('video.player-video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('1 серия')
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.album)).toBe('Anime Life')

  const press = (action: string) =>
    page.evaluate((a) => (window as unknown as { msHandlers: Record<string, ((d: object) => void) | null> }).msHandlers[a]?.({ action: a }), action)
  await press('play')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
  await press('pause')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  await press('nexttrack')
  await expect(page).toHaveURL(/\/watch\/1\/2$/)
})

test('последняя вышедшая серия онгоинга: таймер до следующей и «Следить за сериями»', async ({ page }) => {
  const anime = fixture('anime')
  const nextAt = new Date(Date.now() + 3 * 86400_000).toISOString()
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) =>
    route.fulfill({ json: { ...anime, status: 'ongoing', episodes: 12, episodes_aired: 7, next_episode_at: nextAt } }),
  )
  await page.goto('/watch/1/7')
  const follow = page.locator('.watch-follow')
  await expect(follow.getByRole('timer')).toContainText('Серия 8 выйдет через')
  await follow.getByRole('button', { name: 'Следить за сериями' }).click()
  await expect(follow).toContainText('Тайтл в «Смотрю»')
  const status = await page.evaluate(() => JSON.parse(localStorage.getItem('anime.mylist.v1') ?? '[]')[0]?.status)
  expect(status).toBe('watching')
  // На предпоследней серии блока нет.
  await page.goto('/watch/1/6')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Серия 6')
  await expect(page.locator('.watch-follow')).toHaveCount(0)
})

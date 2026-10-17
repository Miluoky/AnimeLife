import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const anime = JSON.parse(readFileSync(new URL('./fixtures/anime.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('тайтл-онгоинг: таймер до следующей серии и фильтр видео по виду', async ({ page }) => {
  const nextAt = new Date(Date.now() + (2 * 86400 + 3 * 3600 + 5 * 60) * 1000).toISOString()
  const ongoing = {
    ...anime,
    status: 'ongoing',
    episodes_aired: 7,
    next_episode_at: nextAt,
    videos: [
      ...anime.videos,
      { id: 9, kind: 'op', name: 'Tank!', hosting: 'youtube', player_url: 'http://youtube.com/embed/n2rVnRwW0h8', url: '', image: '' },
    ],
  }
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) => route.fulfill({ json: ongoing }))
  // Тестовый браузер сразу отвечает «уведомления запрещены»: делаем вид, что пользователь ещё не решал.
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }))
  await page.goto('/anime/1')

  const timer = page.getByRole('timer')
  await expect(timer).toContainText('Серия 8 выйдет через')
  await expect(timer.locator('.next-ep__part').first()).toHaveText(/^2\s*дн$/)

  // Колокольчик есть только у онгоингов и анонсов.
  await expect(page.getByRole('button', { name: 'Сообщить о новой серии' })).toHaveAttribute('aria-pressed', 'false')

  const kinds = page.getByRole('group', { name: 'Какие видео показать' })
  await expect(kinds.getByRole('button')).toHaveText(['Все · 3', 'Трейлер · 2', 'Опенинг · 1'])
  await kinds.getByRole('button', { name: 'Опенинг · 1' }).click()
  await expect(page.locator('.video-card')).toHaveCount(1)
  await expect(page.locator('.video-card')).toContainText('Опенинг: Tank!')
})

test('вышедший тайтл: без таймера и без фильтра, когда видео одного вида', async ({ page }) => {
  await page.goto('/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page.locator('.video-card').first()).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Сообщить о новой серии' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Какие видео показать' })).toHaveCount(0)
})

test('карточки серий: кадры и названия из AniLibria', async ({ page }) => {
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  const release = fixture('anilibria-release')
  release.episodes[0].preview = {
    src: '/storage/1.jpg',
    optimized: { preview: '/storage/1-720.webp', thumbnail: '/storage/1-200.webp' },
  }
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: fixture('anilibria-search') }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: release }))
  await page.route(/anilibria\.top\/storage\/.*/, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/anime/1')

  const first = page.locator('.episode-card').first()
  await expect(first).toContainText('Блюз малых планет')
  await expect(first).toHaveAttribute('title', 'Серия 1: Блюз малых планет')
  const frame = first.locator('.episode-card__shot--frame')
  await expect(frame).toHaveAttribute('src', 'https://anilibria.top/storage/1-720.webp')
  await expect(frame).toHaveAttribute('srcset', /1-200\.webp 200w/)
  // У второй серии кадра нет — остаётся скриншот Shikimori, но название серии есть.
  await expect(page.locator('.episode-card').nth(1).locator('.episode-card__shot--frame')).toHaveCount(0)
  await expect(page.locator('.episode-card').nth(1)).toContainText('Потерявшийся Пёс')
})

test('длинный сериал на телефоне: диапазоны серий не раздвигают страницу', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) => route.fulfill({ json: { ...anime, episodes: 64, episodes_aired: 64 } }))
  await page.goto('/anime/1')
  await expect(page.getByRole('button', { name: '61–64' })).toBeAttached()
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scroll).toBeLessThanOrEqual(client)
})

test('порядок просмотра: франшиза по дате, текущая часть отмечена, OVA по кнопке', async ({ page }) => {
  const node = (id: number, year: number, kind: string, name: string) => ({
    id,
    date: Date.UTC(year, 0, 1) / 1000,
    name,
    image_url: `https://shikimori.io/system/animes/x96/${id}.jpg`,
    url: `/animes/${id}`,
    year,
    kind,
    weight: 1,
  })
  await page.route(/\/api\/(shiki\/)?animes\/1\/franchise/, (route) =>
    route.fulfill({
      json: {
        current_id: 1,
        links: [],
        nodes: [
          node(5, 2001, 'Фильм', 'Ковбой Бибоп: Фильм'),
          node(1, 1998, 'TV Сериал', 'Ковбой Бибоп'),
          node(7, 1999, 'Спецвыпуск', 'Ковбой Бибоп: Сессия'),
          node(9, 2021, 'ONA', 'Ковбой Бибоп: Новое'),
          node(11, 2000, 'Клип', 'Клип'),
        ],
      },
    }),
  )
  await page.goto('/anime/1')
  const cards = page.locator('.order-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.locator('.order-card__title')).toHaveText(['Ковбой Бибоп', 'Ковбой Бибоп: Фильм', 'Ковбой Бибоп: Новое'])
  await expect(cards.first()).toHaveAttribute('aria-current', 'page')
  await expect(cards.first()).toContainText('Вы здесь')
  await page.getByRole('button', { name: 'Все части · 4' }).click()
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(1)).toContainText('Сессия')
  await expect(cards.nth(1)).toHaveAttribute('href', '/anime/7')
})

test('тайтл: блок «Над аниме работали» из ролей Shikimori', async ({ page }) => {
  const person = (id: number, name: string, russian: string) => ({ id, name, russian, url: `/people/${id}` })
  await page.route(/\/api\/(shiki\/)?animes\/1\/roles/, (route) =>
    route.fulfill({
      json: [
        { roles: ['Director', 'Storyboard'], roles_russian: [], person: person(1, 'Shinichiro Watanabe', 'Синъитиро Ватанабэ'), character: null },
        { roles: ['Music'], roles_russian: [], person: person(2, 'Yoko Kanno', 'Ёко Канно'), character: null },
        { roles: ['Main'], roles_russian: [], person: null, character: { id: 1, name: 'Spike', russian: 'Спайк', url: '/characters/1' } },
      ],
    }),
  )
  await page.goto('/anime/1')
  const staff = page.locator('.staff-list')
  await expect(staff.locator('dt')).toHaveText(['Режиссёр', 'Музыка'])
  await expect(staff.getByRole('link', { name: 'Ёко Канно' })).toHaveAttribute("href", /\/person\/2$/)
})

test('тайтл: озвучки и субтитры, длинный список раскрывается кнопкой', async ({ page }) => {
  await page.goto('/anime/1')
  const dub = page.locator('.voices', { has: page.getByRole('heading', { name: /Озвучка/ }) })
  await expect(dub.getByRole('heading')).toHaveText('Озвучка 10')
  await expect(dub.locator('li', { hasText: 'AniLibria' })).toHaveCount(0)
  await dub.getByRole('button', { name: 'Ещё 4' }).click()
  await expect(dub.locator('li', { hasText: 'AniLibria' })).toBeVisible()
  await expect(dub.getByRole('button', { name: 'Свернуть' })).toHaveAttribute('aria-expanded', 'true')
  const subs = page.locator('.voices', { has: page.getByRole('heading', { name: /Субтитры/ }) })
  await expect(subs.locator('li')).toHaveText(["Dragon'Drop", 'Max Skuratov', 'Сергей Светличный', 'Suzaku', 'Faddeich', 'Netflix'])
})

test('тайтл: сколько времени займёт весь сериал и сколько осталось', async ({ page }) => {
  await page.goto('/anime/1')
  const facts = page.locator('.fact-pills')
  await expect(facts.locator('div', { hasText: 'Всего' })).toContainText('≈ 10 ч 24 мин')
  await page.evaluate(() =>
    localStorage.setItem(
      'anime.history.v1',
      JSON.stringify([{ animeId: '1', title: 'Ковбой Бибоп', posterFill: '#222', episode: 6, totalEpisodes: 26, updatedAt: Date.now() }]),
    ),
  )
  await page.reload()
  await expect(facts.locator('div', { hasText: 'Всего' })).toContainText('≈ 10 ч 24 мин')
  await expect(facts.locator('div', { hasText: 'Осталось' })).toContainText('8 ч 24 мин')
})

test('тайтл: в порядке просмотра у длинной франшизы видно, чем части отличаются', async ({ page }) => {
  const node = (id: number, year: number, kind: string, name: string) => ({
    id, date: year * 1000, name, image_url: `/system/animes/x96/${id}.jpg`, url: `/animes/${id}`, year, kind, weight: 1,
  })
  await page.route(/\/api\/(shiki\/)?animes\/1\/franchise/, (route) =>
    route.fulfill({
      json: {
        current_id: 1,
        links: [],
        nodes: [
          node(1, 2023, 'TV Сериал', 'Провожающая в последний путь Фрирен'),
          node(2, 2023, 'ONA', 'Провожающая в последний путь Фрирен: Магия'),
          node(3, 2026, 'TV Сериал', 'Провожающая в последний путь Фрирен 2'),
        ],
      },
    }),
  )
  await page.goto('/anime/1')
  const titles = page.locator('.order-card__title')
  await expect(titles).toHaveText(['Провожающая в последний путь Фрирен', '…Фрирен: Магия', '…Фрирен 2'])
  await expect(titles.nth(2)).toHaveAttribute('title', 'Провожающая в последний путь Фрирен 2')
})

test('тайтл: озвучки, которые есть в плеере, открывают серию сразу в выбранной', async ({ page }) => {
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        types: [
          { id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26, icon: 'https://s3.anixmirai.com/voiceovers/studio-band.jpg' },
          { id: 46, name: 'Субтитры | CR', is_sub: true, episodes_count: 20 },
        ],
      },
    }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/\d+\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [{ position: 1, url: 'https://kodikplayer.com/seria/1/hash/720p', iframe: true }] } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Kodik</title>' }))
  await page.goto('/anime/1')
  const site = page.locator('.voices', { has: page.getByRole('heading', { name: /Озвучки на сайте/ }) })
  await expect(site.getByRole('heading')).toHaveText('Озвучки на сайте 2')
  await expect(site.getByRole('link', { name: /CR/ })).toContainText('субтитры · 20 из 26')
  await expect(site.getByRole('link', { name: /Studio Band/ })).not.toContainText(' из ')
  await site.getByRole('link', { name: /Studio Band/ }).click()
  await expect(page).toHaveURL(/\/watch\/1\/1$/)
  await expect(page.getByRole('button', { name: /^Studio Band/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', 'https://kodikplayer.com/seria/1/hash/720p')
})

test('тайтл: «Все плееры» догружают студии Kodik и YummyAnime, которых нет в Anixart', async ({ page }) => {
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  const yummy: string[] = []
  await page.route(/api\.yani\.tv\/search/, (route) => {
    yummy.push(route.request().url())
    return route.fulfill({ json: { response: [{ anime_id: 8, remote_ids: { shikimori_id: 1 } }] } })
  })
  await page.route(/api\.yani\.tv\/anime\/8\/videos/, (route) =>
    route.fulfill({
      json: {
        response: [
          // Studio Band уже есть из Anixart, OnWave — только в YummyAnime.
          ...[1, 2].map((n) => ({ number: String(n), iframe_url: `//cvh.example/band/${n}`, data: { player: 'Плеер CVH', dubbing: 'Озвучка StudioBand' } })),
          ...[1, 2].map((n) => ({ number: String(n), iframe_url: `//cvh.example/onwave/${n}`, data: { player: 'Плеер CVH', dubbing: 'Озвучка OnWave' } })),
        ],
      },
    }),
  )
  await page.route(/\.example\//, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Плеер</title>' }))
  await page.goto('/anime/1')
  const site = page.locator('.voices', { has: page.getByRole('heading', { name: /Озвучки на сайте/ }) })
  await expect(site.getByRole('heading')).toHaveText('Озвучки на сайте 1')
  // Пока не попросили — YummyAnime не спрашиваем.
  expect(yummy).toEqual([])
  await site.getByRole('button', { name: 'Все плееры' }).click()
  await expect(site.getByRole('heading')).toHaveText('Озвучки на сайте 2')
  await expect(site.getByRole('link', { name: /OnWave/ })).toContainText('озвучка · 2 из 26')
  await site.getByRole('link', { name: /OnWave/ }).click()
  await expect(page).toHaveURL(/\/watch\/1\/1$/)
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', 'https://cvh.example/onwave/1')
})

test('тайтл: Anixart находит релиз по английскому названию и без года в скобках', async ({ page }) => {
  const renamed = { ...anime, russian: 'Ковбой Бибоп (1998)', name: 'Kaubōi Bibappu', english: ['Cowboy Bebop'] }
  await page.route(/\/api\/(shiki\/)?animes\/1(\?|$)/, (route) => route.fulfill({ json: renamed }))
  const queries: string[] = []
  await page.route(/api\.anixart\.tv\/search/, (route) => {
    queries.push(JSON.parse(route.request().postData() ?? '{}').query)
    return route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } })
  })
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.goto('/anime/1')
  await expect(page.getByRole('heading', { name: /Озвучки на сайте/ })).toHaveText('Озвучки на сайте 1')
  // Год в скобках в запрос не попадает.
  expect(queries[0]).toBe('Ковбой Бибоп')
})

test('адрес тайтла с названием: /anime/1 меняется на /anime/1-cowboy-bebop, постер подписан', async ({ page }) => {
  await page.goto('/anime/1#reviews')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ковбой Бибоп')
  await expect(page).toHaveURL(/\/anime\/1-cowboy-bebop#reviews$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://animelife.top/anime/1-cowboy-bebop')
  await expect(page.getByAltText('Постер аниме «Ковбой Бибоп»').first()).toBeAttached()
  // Назад ведёт туда, откуда пришли, а не на старый адрес: замена без новой записи в истории.
  await page.goto('/anime/1-cowboy-bebop')
  await expect(page).toHaveURL(/\/anime\/1-cowboy-bebop$/)
})

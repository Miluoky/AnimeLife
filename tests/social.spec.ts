import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('сообщество: вкладки ленты, топа, клубов и людей без входа', async ({ page }) => {
  await page.goto('/community')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сообщество')
  await expect(page.getByText('Здесь появятся новости зрителей')).toBeVisible()
  await page.getByRole('button', { name: 'Топ зрителей' }).click()
  await expect(page).toHaveURL(/tab=top/)
  await expect(page.getByText('Опыт: 10 за серию')).toBeVisible()
  await page.getByRole('button', { name: 'Клубы' }).click()
  await expect(page.getByRole('link', { name: 'Войти, чтобы создать клуб' })).toBeVisible()
})

test('топ зрителей за месяц: запрос по monthKey и опыт за месяц', async ({ page }) => {
  const asked: string[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/profiles\/rows\?.*/, (route) => {
    const url = decodeURIComponent(route.request().url())
    asked.push(url)
    const month = url.includes('"monthKey"')
    return route.fulfill({
      json: { total: 1, rows: [{ $id: 'u1', name: 'Мика', xp: 5000, weekXp: 70, monthXp: month ? 420 : 0, summary: '{}' }] },
    })
  })
  await page.goto('/community?tab=top')
  await page.getByRole('button', { name: 'Этот месяц' }).click()
  await expect(page.locator('.s-leaders__xp')).toHaveText('420 XP')
  const d = new Date()
  expect(asked.some((u) => u.includes(`"monthKey","values":[${d.getUTCFullYear() * 100 + d.getUTCMonth() + 1}]`))).toBe(true)
  await expect(page.getByText('в последний день называем в нашем Telegram-канале')).toBeVisible()
})

test('новости: заголовок, текст и переход к тайтлу', async ({ page }) => {
  await page.route(/shikimori\.(io|one)\/api\/topics.*/, (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          topic_title: 'Анонс второго сезона',
          html_body: 'Студия объявила <strong>второй сезон</strong>.<br>Премьера в январе.',
          created_at: '2026-10-10T12:00:00+03:00',
          comments_count: 3,
          linked_type: 'Anime',
          linked_id: 1,
          linked: { id: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп' },
        },
      ],
    }),
  )
  await page.goto('/news')
  await expect(page.getByRole('heading', { name: 'Анонс второго сезона' })).toBeVisible()
  await expect(page.getByText('Премьера в январе.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ковбой Бибоп' })).toHaveAttribute('href', '/anime/1')
})

test('новости на телефоне: длинное название тайтла не раздвигает страницу вбок', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const long = 'Я получил читерские способности в другом мире и стал непревзойдённым в реальном мире: повышение уровня меняет жизнь'
  await page.route(/shikimori\.(io|one)\/api\/topics.*/, (route) =>
    route.fulfill({
      json: [
        {
          id: 2,
          topic_title: 'Второй сезон',
          html_body: 'Анонс.',
          created_at: '2026-10-10T12:00:00+03:00',
          comments_count: 0,
          linked_type: 'Anime',
          linked_id: 1,
          linked: { id: 1, name: 'Long', russian: long },
        },
      ],
    }),
  )
  await page.goto('/news')
  await expect(page.getByRole('link', { name: long })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('поиск по кадру: результат ведёт на серию с нужной секунды', async ({ page }) => {
  await page.route(/api\.trace\.moe\/.*/, (route) =>
    route.fulfill({
      json: {
        result: [
          {
            anilist: { id: 1, idMal: 1, title: { romaji: 'Cowboy Bebop', native: 'カウボーイビバップ' }, isAdult: false },
            episode: 5,
            from: 754.3,
            similarity: 0.95,
            video: 'https://media.trace.moe/video/1/x.mp4?t=1',
            image: 'https://media.trace.moe/image/1/x.jpg?t=1',
          },
        ],
      },
    }),
  )
  await page.route(/media\.trace\.moe\/.*/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.goto('/scene')
  await page.getByPlaceholder('или ссылка на картинку').fill('https://example.com/frame.jpg')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.getByText('Серия 5, 12:34')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Смотреть с этого места' })).toHaveAttribute('href', '/watch/1/5?t=754')
})

test('итоги года собираются из журнала просмотра', async ({ page }) => {
  const year = new Date().getFullYear()
  await page.addInitScript((y) => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ d: `${y}-03-${String(i + 1).padStart(2, '0')}`, h: 23, at: Date.now(), a: '1', e: i + 1, m: 25, v: 'AniDUB' }))
    localStorage.setItem('anime.watchlog.v1', JSON.stringify({ entries, titles: { 1: { t: 'Ковбой Бибоп', k: 'tv', g: ['Фантастика', 'Экшен'] } } }))
  }, year)
  await page.goto('/recap')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Мои итоги ${year}`)
  await expect(page.locator('.recap__big').nth(1)).toHaveText('12')
  await expect(page.getByText('Любимая озвучка: AniDUB')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ковбой Бибоп' })).toBeVisible()
  await expect(page.getByText('12 дней подряд без перерыва')).toBeVisible()
})

test('тайтл: опенинги и кнопка «В подборку»', async ({ page }) => {
  await page.route(/api\.animethemes\.moe\/.*/, (route) =>
    route.fulfill({
      json: {
        anime: [
          {
            animethemes: [
              {
                id: 7,
                type: 'OP',
                sequence: 1,
                slug: 'OP1',
                song: { title: 'Tank!', artists: [{ name: 'The Seatbelts' }] },
                animethemeentries: [{ episodes: '1-25', spoiler: false, videos: [{ link: 'https://v.animethemes.moe/x.webm' }] }],
              },
            ],
          },
        ],
      },
    }),
  )
  await page.goto('/anime/1')
  await expect(page.getByRole('heading', { name: 'Опенинги и эндинги' })).toBeVisible()
  await expect(page.getByText('Tank!')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Я.Музыка' })).toHaveAttribute('href', /music\.yandex\.ru\/search\?text=The%20Seatbelts%20Tank!/)
  await expect(page.getByRole('link', { name: '+ В подборку' })).toHaveAttribute('href', '/collections/my?add=1')
})

test('ссылка на момент: ?t= становится местом, откуда продолжить', async ({ page }) => {
  await page.goto('/watch/1/2?t=300')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Серия 2')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('anime.positions.v1') ?? '{}'))
  expect(saved['1:2']?.t).toBe(300)
})

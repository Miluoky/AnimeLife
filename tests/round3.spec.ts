import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const image = { original: '/uploads/p.jpg', preview: '/uploads/p.jpg' }

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

const seasonItem = (id: number, russian: string, extra: Record<string, unknown> = {}) => ({
  id: String(id),
  name: `Title ${id}`,
  russian,
  kind: 'tv',
  score: 8 - id / 10,
  status: 'ongoing',
  episodes: 12,
  episodesAired: 2,
  airedOn: { date: '2026-10-02' },
  nextEpisodeAt: new Date(Date.now() + id * 3_600_000).toISOString(),
  duration: 24,
  poster: { mainUrl: 'https://shikimori.io/uploads/p.webp', main2xUrl: 'https://shikimori.io/uploads/p2.webp' },
  genres: [
    { russian: id % 2 ? 'Драма' : 'Комедия', kind: 'genre' },
    { russian: 'Сёнен', kind: 'demographic' },
  ],
  studios: [{ name: 'MAPPA' }],
  description: `Описание [character=1]героя[/character] номер ${id}.`,
  ...extra,
})

test('сезонный чарт: карточки с отсчётом, формат и сезон в адресе, фильтр по жанру', async ({ page }) => {
  const queries: string[] = []
  await page.route(/\/api\/(shiki\/api\/)?graphql$/, async (route) => {
    const { query } = route.request().postDataJSON() as { query: string }
    if (!query.includes('season:')) return route.fulfill({ json: fixture('posters') })
    queries.push(query)
    const movie = query.includes('kind: "movie"')
    return route.fulfill({
      json: { data: { animes: movie ? [seasonItem(9, 'Фильм сезона', { kind: 'movie', status: 'anons', nextEpisodeAt: null })] : [seasonItem(1, 'Первый'), seasonItem(2, 'Второй')] } },
    })
  })
  await page.goto('/season?s=fall_2026')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Осень 2026')
  const cards = page.locator('.season-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Первый')
  await expect(cards.first()).toContainText(/Серия 3 через (59 мин|1 ч)/)
  await expect(cards.first()).toContainText('Описание героя номер 1.')
  // Демография (Сёнен) не жанр — её на карточке нет.
  await expect(cards.first()).not.toContainText('Сёнен')
  expect(queries[0]).toContain('season: "fall_2026"')

  await page.getByLabel('Жанр').selectOption('Комедия')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Второй')
  await expect(page).toHaveURL(/genre=/)

  await page.getByRole('tab', { name: /Фильмы/ }).click()
  await expect(page).toHaveURL(/f=movie/)
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Фильм сезона')
  await expect(cards.first()).toContainText('Старт 2 октября')

  await page.getByRole('button', { name: /Следующий сезон/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Зима 2027')
  await expect(page).toHaveURL(/s=winter_2027/)

  // Добавление в список прямо из чарта.
  await page.getByRole('button', { name: 'Добавить «Фильм сезона» в «Буду смотреть»' }).click()
  await expect(page.locator('.season-card__add.is-in')).toContainText('Буду смотреть')
})

test('страница сэйю: роли с персонажами, работы, ссылка со страницы персонажа', async ({ page }) => {
  const animes = fixture('animes')
  await page.route(/\/api\/(shiki\/api\/)?people\/5$/, (route) =>
    route.fulfill({
      json: {
        id: 5,
        name: 'Koichi Yamadera',
        russian: 'Коити Ямадэра',
        japanese: '山寺 宏一',
        image,
        job_title: 'Сэйю',
        birth_on: { day: 17, month: 6, year: 1961 },
        deceased_on: {},
        website: 'https://example.com/',
        groupped_roles: [['Сэйю', 2]],
        roles: [
          { characters: [{ id: 1, name: 'Spike Spiegel', russian: 'Спайк Шпигель', image }], animes: [animes[0], animes[1]] },
          { characters: [{ id: 2, name: 'Togusa', russian: 'Тогуса', image }], animes: [animes[2]] },
        ],
        works: [{ anime: animes[3], manga: null, role: 'Исполнение гл. муз. темы' }],
      },
    }),
  )
  await page.goto('/person/5')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Коити Ямадэра')
  await expect(page.getByText('День рождения: 17 июня 1961')).toBeVisible()
  await expect(page.locator('.person-role')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Спайк Шпигель' })).toHaveAttribute('href', '/character/1')
  await expect(page.locator('.person-role').filter({ hasText: 'Спайк Шпигель' })).toContainText('ещё 1 тайтл')
  await expect(page.locator('.poster-card')).toHaveCount(1)
  await expect(page.locator('.poster-card')).toContainText('Исполнение гл. муз. темы')
})

test('«Без спойлеров»: дальние серии без кадра и названия, настройка запоминается', async ({ page }) => {
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: fixture('anilibria-search') }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: fixture('anilibria-release') }))
  await page.route(/anilibria\.top\/storage\/.*/, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/anime/1')
  const second = page.locator('.episode-card').nth(1)
  await expect(second).toContainText('Потерявшийся Пёс')
  await page.getByRole('button', { name: 'Без спойлеров' }).click()
  await expect(second).toHaveClass(/episode-card--hidden/)
  await expect(second).toContainText('Название скрыто')
  await expect(second).not.toHaveAttribute('title', /Потерявшийся/)
  // Первая серия — та, с которой начнёте, — видна как есть.
  await expect(page.locator('.episode-card').first()).not.toHaveClass(/episode-card--hidden/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Без спойлеров' })).toHaveAttribute('aria-pressed', 'true')
})

test('профиль: карта активности за год из журнала просмотра', async ({ page }) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = (offset: number) => {
    const d = new Date(Date.now() - offset * 86_400_000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  await page.addInitScript(
    ([d0, d1, d2]) => {
      const entry = (d: string, e: number) => ({ d, h: 20, at: Date.now(), a: '1', e, m: 24 })
      localStorage.setItem('anime.watchlog.v1', JSON.stringify({ entries: [entry(d0, 1), entry(d0, 2), entry(d1, 3), entry(d2, 4)], titles: {} }))
      localStorage.setItem(
        'anime.mylist.v1',
        JSON.stringify([{ anime: { id: '1', title: 'Ковбой Бибоп', kind: 'TV', ongoing: false, posterFill: '#222' }, status: 'watching', addedAt: Date.now() }]),
      )
    },
    [day(0), day(1), day(2)],
  )
  await page.goto('/account')
  const map = page.getByRole('region', { name: 'Активность за год' })
  await expect(map).toContainText('4 серии · подряд 3 дня')
  await expect(map.locator('.heatmap__cell--2')).toHaveCount(2)
})

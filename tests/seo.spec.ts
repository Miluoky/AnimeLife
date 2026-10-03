import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'
import { titlePageDescription, titlePageTitle, watchPageTitle } from '../src/data/seo'
import { landingFor, landingPaths } from '../src/data/landings'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

const canonical = (page: import('@playwright/test').Page) => page.locator('link[rel="canonical"]')

test('шаблоны заголовков: не длиннее 70 знаков, лишнее отбрасывается по порядку', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона')
  // С оригиналом и годом выходит 82 знака, с одним годом 71: остаётся полный хвост без скобок.
  expect(titlePageTitle({ title: 'Ван-Пис', original: 'One Piece', year: 1999 })).toBe(
    'Ван-Пис — смотреть аниме онлайн бесплатно все серии | Anime Life',
  )
  expect(titlePageTitle({ title: 'Нана', original: 'Nana', year: 2006 })).toBe(
    'Нана (2006) — смотреть аниме онлайн бесплатно все серии | Anime Life',
  )
  const long = titlePageTitle({ title: 'Провожающая в последний путь Фрирен', original: 'Sousou no Frieren', year: 2023 })
  expect(long).toBe('Провожающая в последний путь Фрирен — смотреть онлайн | Anime Life')
  expect(titlePageTitle({ title: 'Твоё имя', year: 2016, movie: true })).toBe('Твоё имя (2016) — смотреть аниме онлайн бесплатно | Anime Life')
  expect(titlePageTitle({ title: 'Дандадан 3', original: 'Dandadan 3', year: 2027, upcoming: true })).toBe('Дандадан 3 (Dandadan 3, 2027) — дата выхода и трейлер | Anime Life')
  expect(watchPageTitle({ title: 'Ван-Пис' }, 1150)).toBe('Ван-Пис 1150 серия — смотреть онлайн бесплатно | Anime Life')
  const description = titlePageDescription({
    title: 'Ковбой Бибоп',
    year: 1998,
    kind: 'ТВ-сериал',
    episodes: 26,
    studio: 'Sunrise',
    genres: ['Экшен', 'Фантастика'],
    description: 'Охотники за головами [character=1]Спайк[/character] и Джет. '.repeat(10),
  })
  expect(description.length).toBeLessThanOrEqual(160)
  expect(description).toMatch(/^«Ковбой Бибоп» — ТВ-сериал, 1998, 26 серий, студия Sunrise\. Жанры: экшен, фантастика\. Охотники за головами Спайк/)
})

test('посадочные страницы: свои тексты и полный список для карты сайта', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона')
  const now = new Date('2026-10-03T12:00:00Z')
  expect(landingFor('/genre/romance', now)?.query).toEqual({ genre: 22 })
  expect(landingFor('/year/2026/fall', now)?.h1).toBe('Аниме осени 2026')
  expect(landingFor('/year/2026/fall', now)?.query).toEqual({ season: 'fall_2026' })
  expect(landingFor('/type/movie', now)?.h1).toBe('Аниме-фильмы')
  expect(landingFor('/genre/nope', now)).toBeUndefined()
  expect(landingFor('/year/2030', now)).toBeUndefined()
  const paths = landingPaths(now)
  expect(new Set(paths).size).toBe(paths.length)
  expect(paths).toContain('/year/2027/winter')
  expect(paths).not.toContain('/year/2027/spring')
  expect(paths).toContain('/year/2024/winter')
  // У каждой страницы свой вводный текст, а не копия соседней.
  const intros = paths.map((p) => landingFor(p, now)!.intro)
  expect(intros.every(Boolean)).toBe(true)
  expect(new Set(paths.filter((p) => p.startsWith('/genre/')).map((p) => landingFor(p, now)!.intro)).size).toBe(
    paths.filter((p) => p.startsWith('/genre/')).length,
  )
})

test('страница жанра: заголовок, вводный текст, тайтлы и ссылки на страницы списка', async ({ page }) => {
  const requests: URL[] = []
  page.on('request', (r) => r.url().includes('/api/animes?') && requests.push(new URL(r.url())))

  await page.goto('/genre/romance?page=2')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аниме в жанре «Романтика», страница 2')
  await expect(page.locator('.poster-card')).toHaveCount(8)
  await expect(page).toHaveTitle('Аниме в жанре романтика — смотреть онлайн бесплатно, страница 2 | Anime Life')
  await expect(canonical(page)).toHaveAttribute('href', 'https://animelife.top/genre/romance?page=2')
  expect(requests.some((u) => u.searchParams.get('genre') === '22' && u.searchParams.get('page') === '2')).toBe(true)

  // Ссылки обычные: поисковик пройдёт по ним без JavaScript-обработчиков.
  const pager = page.getByRole('navigation', { name: 'Страницы' })
  await expect(pager.getByRole('link', { name: '← Назад' })).toHaveAttribute('href', '/genre/romance')
  await pager.getByRole('link', { name: '← Назад' }).click()
  await expect(page).toHaveURL(/\/genre\/romance$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аниме в жанре «Романтика»')
  await expect(page.getByText(/Первая любовь, признания/)).toBeVisible()
  await expect(canonical(page)).toHaveAttribute('href', 'https://animelife.top/genre/romance')
  // На первой странице всего 8 тайтлов из 24: следующей страницы нет.
  await expect(pager).toHaveCount(0)

  await page.getByRole('link', { name: 'Комедия', exact: true }).first().click()
  await expect(page).toHaveURL(/\/genre\/comedy$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аниме в жанре «Комедия»')
})

test('сезон, тип и онгоинги открываются как посадочные, незнакомый жанр — 404', async ({ page }) => {
  await page.goto('/year/2026/fall')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аниме осени 2026')
  await expect(page.getByRole('navigation', { name: 'Хлебные крошки' }).getByRole('link', { name: 'Аниме 2026 года' })).toBeVisible()
  await page.goto('/type/movie')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аниме-фильмы')
  await page.goto('/ongoing')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Онгоинги аниме')
  await expect(page.getByRole('heading', { name: 'Выходят сейчас' })).toBeVisible()
  await expect(page.locator('.poster-card').first()).toBeVisible()
  await page.goto('/genre/nope')
  await expect(page.getByText(/не найдена/i)).toBeVisible()
})

test('каталог: ?page=N с первой страницы сетки, canonical со страницей, смена фильтра сбрасывает страницу', async ({ page }) => {
  await page.goto('/catalog?page=3')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Каталог аниме')
  await expect(canonical(page)).toHaveAttribute('href', 'https://animelife.top/catalog?page=3')
  await expect(page.getByRole('navigation', { name: 'Страницы' }).getByRole('link', { name: '2' })).toHaveAttribute('href', '/catalog?page=2')
  await page.getByRole('button', { name: 'Онгоинг' }).click()
  await expect(page).toHaveURL(/\/catalog\?status=ongoing$/)
  // С фильтрами канонический адрес — каталог без параметров.
  await expect(canonical(page)).toHaveAttribute('href', 'https://animelife.top/catalog')
})

test('тайтл и серия: заголовки по шаблону, жанры и год ведут на посадочные, у постера есть подпись', async ({ page }) => {
  await page.goto('/anime/1')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('img', { name: 'Постер аниме «Ковбой Бибоп»' })).toBeAttached()
  await expect(page.locator('.title-head').getByRole('link', { name: 'Космос' })).toHaveAttribute('href', '/genre/space')
  await expect(page.locator('.title-head').getByRole('link', { name: '1998' })).toHaveAttribute('href', '/year/1998')

  await page.goto('/watch/1/3')
  await expect(page).toHaveTitle('Ковбой Бибоп 3 серия — смотреть онлайн бесплатно | Anime Life')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 }).getByRole('link', { name: 'Ковбой Бибоп' })).toHaveAttribute('href', '/anime/1')
  await expect(canonical(page)).toHaveAttribute('href', 'https://animelife.top/watch/1/3')
  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description).toContain('Смотрите 3 серию из 26 аниме «Ковбой Бибоп»')
})

test('один h1 на главной и ссылки на жанры и годы в подвале', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  const footer = page.getByRole('navigation', { name: 'Подборки' })
  await expect(footer.getByRole('link', { name: 'Романтика' })).toHaveAttribute('href', '/genre/romance')
  await expect(footer.getByRole('link', { name: 'Аниме-фильмы' })).toHaveAttribute('href', '/type/movie')
  await expect(footer.getByRole('link', { name: /^Аниме \d{4} года$/ }).first()).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { mockServices, shikimoriFixture } from './mocks'
import worker from '../worker/index.js'
import { enDescription, enTitle } from '../src/data/en'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('/en: английская главная, lang="en", ссылки на английские страницы тайтлов', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1, name: 'Watch anime online' })).toBeVisible()
  await expect(page).toHaveTitle(/Watch anime online free/)
  const card = page.locator('.en-grid a').first()
  await expect(card).toHaveAttribute('href', /^\/en\/anime\/\d+/)
  await page.getByRole('link', { name: 'Русская версия' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
})

test('/en/anime: английское название, факты, «Watch episode 1» и русская страница', async ({ page }) => {
  await page.goto('/en/anime/1-cowboy-bebop')
  await expect(page.getByRole('heading', { level: 1, name: 'Cowboy Bebop' })).toBeVisible()
  await expect(page.locator('main')).toContainText('TV series')
  await expect(page.getByRole('link', { name: 'Watch episode 1' })).toHaveAttribute('href', '/watch/1/1')
  await expect(page.getByRole('link', { name: 'Страница на русском' })).toHaveAttribute('href', '/anime/1-cowboy-bebop')
  await expect(page).toHaveTitle('Cowboy Bebop (1998) — watch anime online free | Anime Life')
})

test.describe('Worker: английская версия', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

  /** HTMLRewriter в Node нет: заглушка запоминает, что Worker вставил в head, #root и <html lang>. */
  async function render(path: string) {
    const g = globalThis as Record<string, unknown>
    const saved = { fetch: g.fetch, caches: g.caches, rw: g.HTMLRewriter }
    const out = { head: '', root: '', lang: '' }
    g.fetch = async (url: string) => {
      const u = new URL(String(url))
      return Response.json(shikimoriFixture(u.pathname.replace(/^\/api/, ''), u.searchParams))
    }
    g.caches = { default: { match: async () => undefined, put: async () => undefined } }
    g.HTMLRewriter = class {
      handlers: [string, { element: (el: unknown) => void }][] = []
      on(selector: string, handler: { element: (el: unknown) => void }) {
        this.handlers.push([selector, handler])
        return this
      }
      transform(res: Response) {
        for (const [selector, h] of this.handlers) {
          h.element({
            append: (html: string) => selector === 'head' && (out.head += html),
            setInnerContent: (html: string) => selector === '#root' && (out.root = html),
            setAttribute: (name: string, value: string) => selector === 'html' && name === 'lang' && (out.lang = value),
            remove: () => undefined,
          })
        }
        return new Response(res.body, res)
      }
    }
    try {
      const assets = { fetch: async () => new Response('<!doctype html><div id="root"></div>', { headers: { 'Content-Type': 'text/html' } }) }
      const res = await worker.fetch(new Request(`https://animelife.top${path}`, { headers: { 'User-Agent': 'curl/8.5.0' } }), { ASSETS: assets }, { waitUntil: () => undefined })
      return { status: res.status, location: res.headers.get('Location'), ...out }
    } finally {
      Object.assign(g, { fetch: saved.fetch, caches: saved.caches, HTMLRewriter: saved.rw })
    }
  }

  test('страница тайтла по-английски: 301 на адрес с названием, lang, hreflang и текст для поисковиков', async () => {
    expect(await render('/en/anime/1')).toMatchObject({ status: 301, location: 'https://animelife.top/en/anime/1-cowboy-bebop' })
    const page = await render('/en/anime/1-cowboy-bebop')
    expect(page.status).toBe(200)
    expect(page.lang).toBe('en')
    expect(page.root).toContain('<h1>Cowboy Bebop</h1>')
    expect(page.root).toContain('href="/anime/1-cowboy-bebop"')
    expect(page.head).toContain('hreflang="ru" href="https://animelife.top/anime/1-cowboy-bebop"')
    expect(page.head).toContain('hreflang="en" href="https://animelife.top/en/anime/1-cowboy-bebop"')
    // Русская страница ссылается на английскую.
    const ru = await render('/anime/1-cowboy-bebop')
    expect(ru.lang).toBe('')
    expect(ru.head).toContain('hreflang="en" href="https://animelife.top/en/anime/1-cowboy-bebop"')
    const home = await render('/en')
    expect(home.status).toBe(200)
    expect(home.root).toContain('Popular anime')
  })

  test('английские адреса есть в карте сайта', async () => {
    const ctx = { waitUntil: () => undefined }
    const pages = await (await worker.fetch(new Request('https://animelife.top/sitemap-pages.xml', { headers: { 'User-Agent': 'curl/8.5.0' } }), {}, ctx)).text()
    expect(pages).toContain('<loc>https://animelife.top/en</loc>')
  })

  test('тексты: заголовок до 75 знаков, описание по фактам', () => {
    const a = { id: 52991, name: 'Sousou no Frieren', english: ["Frieren: Beyond Journey's End"], kind: 'tv', score: '9.25', status: 'released', episodes: 28, episodes_aired: 28, aired_on: '2023-09-29', genres: [{ name: 'Adventure' }, { name: 'Drama' }], studios: [{ name: 'Madhouse' }] }
    expect(enTitle(a)).toBe("Frieren: Beyond Journey's End (2023) — watch anime online free | Anime Life")
    expect(enDescription(a)).toBe(
      "Frieren: Beyond Journey's End (Sousou no Frieren) is a 2023 TV series by Madhouse, 28 episodes. Genres: Adventure, Drama. Rated 9.25 on Shikimori. Watch it online free on Anime Life with Russian dubs or subtitles.",
    )
    expect(enDescription({ ...a, kind: 'ova', aired_on: null, studios: [], genres: [], score: '0', episodes: 2 })).toMatch(/^Frieren: Beyond Journey's End \(Sousou no Frieren\) is an OVA, 2 episodes\. Watch/)
  })
})

import { expect, test } from '@playwright/test'
import worker from '../worker/index.js'

// Подборки «Лучшие …» и темы для поисковиков без JavaScript: список из Shikimori по оценке или по genre_v2.
// HTMLRewriter в Node нет: заглушка запоминает, что Worker вставил в #root и head (как в person-seo.spec.ts).

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

const LIST = [
  { id: 41457, name: 'Kaguya-sama 3', russian: 'Госпожа Кагуя 3', kind: 'tv', status: 'released', episodes: 12, aired_on: '2022-04-09', image: { original: '/x.jpg' } },
]

async function render(path: string) {
  const g = globalThis as Record<string, unknown>
  const saved = { fetch: g.fetch, caches: g.caches, rw: g.HTMLRewriter }
  const out = { head: '', root: '', urls: [] as string[] }
  g.fetch = async (url: string) => {
    out.urls.push(String(url))
    const p = new URL(String(url)).pathname
    if (p === '/api/animes') return Response.json(LIST)
    if (p === '/api/graphql') return Response.json({ data: { animes: [] } })
    return Response.json([])
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
          setAttribute: () => undefined,
          remove: () => undefined,
        })
      }
      return new Response(res.body, res)
    }
  }
  try {
    const assets = { fetch: async () => new Response('<!doctype html><div id="root"></div>', { headers: { 'Content-Type': 'text/html' } }) }
    const res = await worker.fetch(new Request(`https://animelife.top${path}`, { headers: { 'User-Agent': 'curl/8.5.0' } }), { ASSETS: assets }, { waitUntil: () => undefined })
    return { status: res.status, ...out }
  } finally {
    Object.assign(g, { fetch: saved.fetch, caches: saved.caches, HTMLRewriter: saved.rw })
  }
}

test('«Лучшие романтические аниме»: h1, крошки к жанру, список по оценке', async () => {
  const page = await render('/best/romance')
  expect(page.status).toBe(200)
  expect(page.root).toContain('<h1>Лучшие романтические аниме</h1>')
  expect(page.root).toContain('<a href="/genre/romance">Аниме в жанре «Романтика»</a>')
  expect(page.root).toContain('Госпожа Кагуя 3')
  expect(page.head).toContain('content="Лучшие романтические аниме — топ по оценкам зрителей | Anime Life"')
  expect(page.head).toContain('"name":"Аниме в жанре «Романтика»","item":"https://animelife.top/genre/romance"')
  const list = page.urls.find((u) => u.includes('/api/animes?'))!
  expect(list).toContain('order=ranked')
  expect(list).toContain('genre=22')
})

test('тема «исекай»: запрос по genre_v2, ссылка на лучшие; лучшие за год; незнакомая тема — 404', async () => {
  const theme = await render('/theme/isekai')
  expect(theme.root).toContain('<h1>Аниме про исекай и попаданцев</h1>')
  expect(theme.root).toContain('<a href="/best/isekai">Лучшие аниме про исекай и попаданцев</a>')
  const list = theme.urls.find((u) => u.includes('/api/animes?'))!
  expect(list).toContain('genre_v2=130')
  expect(list).not.toContain('themeId')
  const year = await render('/best/2024?page=2')
  expect(year.root).toContain('<h1>Лучшие аниме 2024 года, страница 2</h1>')
  expect(year.urls.find((u) => u.includes('/api/animes?'))).toContain('page=2')
  expect((await render('/theme/nope')).status).toBe(404)
  expect((await render('/best/2099')).status).toBe(404)
})

test('карта сайта: темы и подборки лучших', async () => {
  const g = globalThis as Record<string, unknown>
  const saved = g.caches
  g.caches = { default: { match: async () => undefined, put: async () => undefined } }
  try {
    const res = await worker.fetch(new Request('https://animelife.top/sitemap-pages.xml', { headers: { 'User-Agent': 'curl/8.5.0' } }), { ASSETS: { fetch: async () => new Response('') } }, { waitUntil: () => undefined })
    const xml = await res.text()
    for (const p of ['/theme/isekai', '/best/isekai', '/best/romance', '/best/2024']) expect(xml).toContain(`<loc>https://animelife.top${p}</loc>`)
  } finally {
    g.caches = saved
  }
})

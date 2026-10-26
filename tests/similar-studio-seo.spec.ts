import { expect, test } from '@playwright/test'
import worker from '../worker/index.js'

// Страницы студий (/studio/mappa) и «Аниме, похожие на …» (/similar/<id>-<slug>) для поисковиков без JavaScript.
// Заглушки fetch и HTMLRewriter — как в landing-seo.spec.ts.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

const LIST = [
  { id: 41457, name: 'Kaguya-sama 3', russian: 'Госпожа Кагуя 3', kind: 'tv', status: 'released', episodes: 12, aired_on: '2022-04-09', image: { original: '/x.jpg' } },
]
const FRIEREN = {
  id: 52991,
  name: 'Sousou no Frieren',
  russian: 'Провожающая в последний путь Фрирен',
  kind: 'tv',
  status: 'released',
  episodes: 28,
  aired_on: '2023-09-29',
  image: { original: '/f.jpg' },
  genres: [{ name: 'Adventure', russian: 'Приключения' }, { name: 'Drama', russian: 'Драма' }],
  studios: [{ id: 11, name: 'Madhouse' }],
}

async function render(path: string, similarCount = 8) {
  const g = globalThis as Record<string, unknown>
  const saved = { fetch: g.fetch, caches: g.caches, rw: g.HTMLRewriter }
  const out = { head: '', root: '', urls: [] as string[] }
  g.fetch = async (url: string) => {
    out.urls.push(String(url))
    const p = new URL(String(url)).pathname
    if (p === '/api/animes') return Response.json(LIST)
    if (p === '/api/animes/52991') return Response.json(FRIEREN)
    if (p === '/api/animes/52991/similar') return Response.json(Array.from({ length: similarCount }, (_, i) => ({ ...LIST[0], id: 100 + i, russian: `Похожее ${i + 1}` })))
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
    return { status: res.status, location: res.headers.get('Location'), ...out }
  } finally {
    Object.assign(g, { fetch: saved.fetch, caches: saved.caches, HTMLRewriter: saved.rw })
  }
}

test('страница студии: h1, вводный текст с работами, фильтр studio, страницы, неизвестная — 404', async () => {
  const page = await render('/studio/mappa')
  expect(page.status).toBe(200)
  expect(page.root).toContain('<h1>Аниме студии MAPPA</h1>')
  expect(page.root).toContain('«Магическую битву»')
  expect(page.root).toContain('<a href="/studio/ufotable">ufotable</a>')
  expect(page.urls.find((u) => u.includes('/api/animes?'))).toContain('studio=569')
  expect(page.head).toContain('https://animelife.top/studio/mappa')
  const second = await render('/studio/mappa?page=2')
  expect(second.root).toContain('<h1>Аниме студии MAPPA, страница 2</h1>')
  expect((await render('/studio/nope')).status).toBe(404)
})

test('похожие: h1, список со ссылками, крошки через тайтл; адрес без названия — 301; мало похожих — 404', async () => {
  const page = await render('/similar/52991-sousou-no-frieren')
  expect(page.status).toBe(200)
  expect(page.root).toContain('<h1>Аниме, похожие на «Провожающая в последний путь Фрирен»</h1>')
  expect(page.root).toContain('<a href="/anime/100-kaguya-sama-3">Похожее 1</a>')
  expect(page.root).toContain('<a href="/anime/52991-sousou-no-frieren">Провожающая в последний путь Фрирен</a>')
  expect(page.head).toContain('"@type":"ItemList"')
  expect(page.head).toContain('Что посмотреть после «Провожающая в последний путь Фрирен»: 8 аниме')
  const short = await render('/similar/52991')
  expect(short.status).toBe(301)
  expect(short.location).toBe('https://animelife.top/similar/52991-sousou-no-frieren')
  expect((await render('/similar/52991-sousou-no-frieren', 3)).status).toBe(404)
})

test('страница тайтла: студия ведёт на её страницу, есть ссылка на все похожие', async () => {
  const page = await render('/anime/52991-sousou-no-frieren')
  expect(page.root).toContain('<a href="/studio/madhouse">студия Madhouse</a>')
  expect(page.root).toContain('<a href="/similar/52991-sousou-no-frieren">Все аниме, похожие на «Провожающая в последний путь Фрирен»</a>')
})

test('карта сайта: страницы студий', async () => {
  const g = globalThis as Record<string, unknown>
  const saved = g.caches
  g.caches = { default: { match: async () => undefined, put: async () => undefined } }
  try {
    const res = await worker.fetch(new Request('https://animelife.top/sitemap-pages.xml', { headers: { 'User-Agent': 'curl/8.5.0' } }), { ASSETS: { fetch: async () => new Response('') } }, { waitUntil: () => undefined })
    const xml = await res.text()
    for (const p of ['/studio/mappa', '/studio/kyoto-animation', '/studio/studio-ghibli']) expect(xml).toContain(`<loc>https://animelife.top${p}</loc>`)
  } finally {
    g.caches = saved
  }
})

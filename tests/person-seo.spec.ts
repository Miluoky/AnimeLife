import { expect, test } from '@playwright/test'
import worker from '../worker/index.js'

// Текст страниц для поисковиков без JavaScript: сэйю (/person/), персонажи и сэйю на странице тайтла и персонажа.
// HTMLRewriter в Node нет: заглушка запоминает, что Worker вставил в #root и head.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

const ANIME = { id: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп', kind: 'tv', status: 'released', episodes: 26, episodes_aired: 0, aired_on: '1998-04-03', image: { original: '/x.jpg' }, genres: [], studios: [] }
const ROLES = [
  { roles: ['Main'], character: { id: 1, name: 'Spike Spiegel', russian: 'Спайк Шпигель' }, person: null },
  { roles: ['Supporting'], character: { id: 9, name: 'Extra', russian: 'Массовка' }, person: null },
  { roles: ['Director'], character: null, person: { id: 1870, name: 'Shinichiro Watanabe', russian: 'Синъитиро Ватанабэ' } },
  { roles: ['Producer'], character: null, person: { id: 5, name: 'Someone', russian: null } },
]
const PERSON = {
  id: 869,
  name: 'Saori Hayami',
  russian: 'Саори Хаями',
  japanese: '早見 沙織',
  job_title: 'Сэйю',
  birth_on: { day: 29, month: 5, year: 1991 },
  website: 'https://hayamisaoriofficial.com/',
  image: { original: '/p.jpg' },
  roles: [{ characters: [{ id: 183429, name: 'Momo Ryuuju', russian: 'Момо Рюдзю' }], animes: [{ id: 43608, name: 'Kaguya-sama 3', russian: 'Госпожа Кагуя 3', score: '9.0' }] }],
  works: [{ anime: { id: 43608, name: 'Kaguya-sama 3', russian: 'Госпожа Кагуя 3', kind: 'tv', aired_on: '2022-04-09' }, role: 'Сэйю' }],
}
const CHARACTER = { id: 1, name: 'Spike Spiegel', russian: 'Спайк Шпигель', description: 'Охотник за головами.', image: { original: '/c.jpg' }, animes: [ANIME], seyu: [{ id: 2, name: 'Kouichi Yamadera', russian: 'Коити Ямадэра' }] }

async function render(path: string) {
  const g = globalThis as Record<string, unknown>
  const saved = { fetch: g.fetch, caches: g.caches, rw: g.HTMLRewriter }
  const out = { head: '', root: '' }
  g.fetch = async (url: string) => {
    const p = new URL(String(url)).pathname
    if (p === '/api/people/869') return Response.json(PERSON)
    if (p === '/api/characters/1') return Response.json(CHARACTER)
    if (p === '/api/animes/1/roles') return Response.json(ROLES)
    if (p === '/api/animes/1') return Response.json(ANIME)
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

test('страница сэйю: имя, роли со ссылками на персонажа и тайтл, Person с датой рождения', async () => {
  const page = await render('/person/869')
  expect(page.status).toBe(200)
  expect(page.root).toContain('<h1>Саори Хаями</h1>')
  expect(page.root).toContain('<a href="/character/183429">Момо Рюдзю</a> — <a href="/anime/43608-kaguya-sama-3">Госпожа Кагуя 3</a>')
  expect(page.root).toContain('дата рождения 29 мая 1991')
  expect(page.head).toContain('"birthDate":"1991-05-29"')
  expect(page.head).toContain('"jobTitle":"Сэйю"')
})

test('тайтл: главные персонажи и режиссёр ссылками, они же в schema.org', async () => {
  const page = await render('/anime/1-cowboy-bebop')
  expect(page.root).toContain('<h2>Главные персонажи</h2><ul><li><a href="/character/1">Спайк Шпигель</a></li></ul>')
  expect(page.root).not.toContain('Массовка')
  expect(page.root).toContain('Режиссёр: <a href="/person/1870">Синъитиро Ватанабэ</a>')
  expect(page.root).not.toContain('Someone')
  expect(page.head).toContain('"director":[{"@type":"Person","name":"Синъитиро Ватанабэ","url":"https://animelife.top/person/1870"}]')
})

test('персонаж: ссылка на сэйю', async () => {
  const page = await render('/character/1')
  expect(page.root).toContain('Озвучивает: <a href="/person/2">Коити Ямадэра</a>')
})

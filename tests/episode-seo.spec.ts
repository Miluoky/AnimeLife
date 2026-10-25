import { expect, test } from '@playwright/test'
import worker from '../worker/index.js'

// Разметка страницы серии для поиска: TVEpisode с VideoObject (кадр, дата, длительность), у фильма — VideoObject.
// HTMLRewriter в Node нет: заглушка запоминает, что Worker вставил в #root и head (как в person-seo.spec.ts).

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

const BASE = { genres: [{ name: 'Action', russian: 'Экшен' }], studios: [], image: { original: '/system/animes/original/1.jpg' }, rating: 'r', duration: 24 }
const BEBOP = { ...BASE, id: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп', kind: 'tv', status: 'released', episodes: 26, episodes_aired: 0, aired_on: '1998-04-03', released_on: '1999-04-24' }
const ONGOING = { ...BASE, id: 2, name: 'New Show', russian: 'Новинка', kind: 'tv', status: 'ongoing', episodes: 12, episodes_aired: 4, aired_on: '2026-10-01', released_on: null, image: { original: '/assets/globals/missing_original.jpg' } }
const MOVIE = { ...BASE, id: 3, name: 'Kimi no Na wa.', russian: 'Твоё имя', kind: 'movie', status: 'released', episodes: 1, aired_on: '2016-08-26', released_on: '2016-08-26', duration: 106, rating: 'pg_13' }

const ld = (head: string) => JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1].replace(/\\u003c/g, '<'))['@graph']

async function render(path: string) {
  const g = globalThis as Record<string, unknown>
  const saved = { fetch: g.fetch, caches: g.caches, rw: g.HTMLRewriter }
  const out = { head: '', root: '' }
  g.fetch = async (url: string) => {
    const p = new URL(String(url)).pathname
    if (p === '/api/animes/1') return Response.json(BEBOP)
    if (p === '/api/animes/2') return Response.json(ONGOING)
    if (p === '/api/animes/3') return Response.json(MOVIE)
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

test('серия сериала: TVEpisode с датой, кадром и VideoObject', async () => {
  const page = await render('/watch/1/3')
  expect(page.status).toBe(200)
  const ep = ld(page.head).find((n: { '@type': string }) => n['@type'] === 'TVEpisode')
  expect(ep).toMatchObject({
    name: 'Ковбой Бибоп: 3 серия',
    episodeNumber: 3,
    url: 'https://animelife.top/watch/1/3',
    image: 'https://shikimori.io/system/animes/original/1.jpg',
    datePublished: '1998-04-17',
    partOfSeries: { '@type': 'TVSeries', name: 'Ковбой Бибоп', numberOfEpisodes: 26 },
    potentialAction: { '@type': 'WatchAction', target: 'https://animelife.top/watch/1/3' },
  })
  expect(ep.video).toMatchObject({
    '@type': 'VideoObject',
    name: 'Ковбой Бибоп: 3 серия',
    thumbnailUrl: ['https://shikimori.io/system/animes/original/1.jpg'],
    uploadDate: '1998-04-17',
    duration: 'PT24M',
    isFamilyFriendly: true,
    url: 'https://animelife.top/watch/1/3',
  })
  expect(ep.video.description).toContain('3 серию из 26')
  // По неделе на серию от премьеры (конец показа позже, поэтому не мешает).
  const last = ld((await render('/watch/1/26')).head).find((n: { '@type': string }) => n['@type'] === 'TVEpisode')
  expect(last.datePublished).toBe('1998-09-25')
})

test('без кадра VideoObject не ставим; фильм — VideoObject с длительностью', async () => {
  const ongoing = ld((await render('/watch/2/2')).head).find((n: { '@type': string }) => n['@type'] === 'TVEpisode')
  expect(ongoing.video).toBeUndefined()
  expect(ongoing.datePublished).toBe('2026-10-08')
  const movie = ld((await render('/watch/3/1')).head)
  const video = movie.find((n: { '@type': string }) => n['@type'] === 'VideoObject')
  expect(video).toMatchObject({ name: 'Твоё имя — смотреть онлайн', uploadDate: '2016-08-26', duration: 'PT106M' })
  expect(movie.some((n: { '@type': string }) => n['@type'] === 'TVEpisode')).toBe(false)
})

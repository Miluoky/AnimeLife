/**
 * Cache API (caches.default) for bot SEO HTML: normalized URL key, TTL by page kind.
 * Worker still runs on HIT (one invocation) but skips Shikimori + HTML assembly.
 */
import { pageParam } from '../src/data/seo.ts'

const HOUR = 3600
export const SEO_TTL_TITLE = HOUR
export const SEO_TTL_LANDING = 6 * HOUR

// Совпадает с PRIVATE в worker/index.js — не кэшируем то, что noindex.
const PRIVATE =
  /^\/(?:together\/|recap|collections\/(?:my|new)|c\/[^/]+\/edit|manga\/\d+\/(?:chapter\/|upload)|account|auth\/|library|my-list|watching|moderation|admin\/)/

// Комнаты, профили, клубы, подборки — меняются без предупреждения.
const VOLATILE = /^\/(?:together\/|u\/|club\/|c\/)/

const PAGED = /^\/(?:catalog$|genre\/|theme\/|best\/|studio\/|type\/|year\/|voice\/|trope\/)/

const TITLE_PATH =
  /^\/(?:en\/anime\/\d{1,10}(?:-[a-z0-9-]{0,80})?|anime\/\d{1,10}(?:-[a-z0-9-]{0,80})?|watch\/\d{1,10}\/\d{1,5}|similar\/\d{1,10}(?:-[a-z0-9-]{0,80})?|character\/\d{1,10}|person\/\d{1,10}|manga\/\d{1,10})$/

/** Посадочные и списки: обновляются реже, дольше TTL. */
const LANDING_PATH =
  /^\/(?:|en|catalog|ongoing|genre\/|theme\/|best\/|studio\/|type\/|year\/|voice\/|trope\/)/

export function seoFreshSeconds(pathname) {
  if (TITLE_PATH.test(pathname)) return SEO_TTL_TITLE
  if (LANDING_PATH.test(pathname) || pathname === '/' || pathname === '/en') return SEO_TTL_LANDING
  return SEO_TTL_TITLE
}

/** Сколько ещё можно отдавать устаревшую копию, пока в фоне собирается новая. */
export function seoKeepSeconds(pathname) {
  return seoFreshSeconds(pathname) * 2
}

export function isSeoCacheable(pathname, searchParams) {
  if (pathname.startsWith('/api/')) return false
  if (PRIVATE.test(pathname) || VOLATILE.test(pathname)) return false
  if (pathname === '/catalog' && searchParams.has('q')) return false
  if (PAGED.test(pathname)) {
    if (pathname === '/catalog' && [...searchParams.keys()].some((k) => k !== 'page')) return false
  } else if (searchParams.toString()) return false
  return true
}

/**
 * Нормализованный pathname+search для ключа кэша (без origin).
 * page=1 и лишние query у непостраничных путей отбрасываются.
 */
export function normalizedPathSearch(url) {
  const path = url.pathname.replace(/(.)\/+$/, '$1') || '/'
  if (!PAGED.test(path)) return path
  if (path === '/catalog' && url.searchParams.has('q')) return null
  if (path === '/catalog' && [...url.searchParams.keys()].some((k) => k !== 'page')) return null
  const page = pageParam(url.searchParams.get('page'))
  return path + (page > 1 ? `?page=${page}` : '')
}

/** Ключ Cache API: нормализованный URL + версия index.html (инвалидация после выкладки). */
export function seoCacheRequest(origin, pathSearch, version) {
  const v = (version || 'x').replace(/[^\w-]/g, '')
  return new Request(`${origin}/__seo/${v}${pathSearch}`)
}

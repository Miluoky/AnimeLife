import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Anime Life'
// Совпадает с <title> в index.html.
const DEFAULT_TITLE = 'Смотреть аниме онлайн бесплатно с русской озвучкой | Anime Life'
const DEFAULT_DESCRIPTION =
  'Аниме онлайн бесплатно с русской озвучкой: онгоинги, каталог по жанрам и годам, расписание новых серий и «Мой список» с синхронизацией.'
const DEFAULT_IMAGE = 'https://animelife.top/og-image.png'
const DEFAULT_TYPE = 'website'
const DEFAULT_TWITTER_CARD = 'summary_large_image'

// Основной адрес сайта: копии (GitHub Pages, старые домены) называют канонической страницу на нём.
const ORIGIN = 'https://animelife.top'

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

/**
 * Канонический адрес: путь без слэша на конце и без параметров, кроме ?page=N у списков.
 * Совпадает с canonicalFor в worker/index.js (line 77, 1059-1063).
 */
export function getCanonicalUrl(pathname = '/', search = '') {
  const path = pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(search)
  const page = Number(params.get('page'))
  const keep =
    /^\/(?:catalog$|genre\/|theme\/|best\/|studio\/|type\/|year\/)/.test(path) &&
    Number.isInteger(page) &&
    page > 1 &&
    (path !== '/catalog' || [...params.keys()].every((k) => k === 'page'))
  return ORIGIN + path + (keep ? `?page=${page}` : '')
}

/**
 * Заголовок вкладки и описание страницы: видно в истории браузера, закладках и у поисковиков,
 * которые выполняют JavaScript. Для превью ссылок в мессенджерах то же самое подставляет worker/index.js.
 * Синхронизирует OpenGraph (og:title, og:description, og:image, og:url, og:type)
 * и Twitter Cards (twitter:card, twitter:title, twitter:description, twitter:image) в клиентском DOM при SPA-переходах.
 * При размонтировании восстанавливает значения по умолчанию.
 */
export function usePageMeta(title?: string, description?: string, image?: string, type?: string) {
  useEffect(() => {
    if (!title && !description && !image && !type) return

    const fullTitle = title ? (title.endsWith(SITE) ? title : `${title} | ${SITE}`) : DEFAULT_TITLE
    const fullDesc = description ? description.slice(0, 200) : DEFAULT_DESCRIPTION
    const fullImage = image
      ? image.startsWith('http')
        ? image
        : `${ORIGIN}${image.startsWith('/') ? '' : '/'}${image}`
      : DEFAULT_IMAGE
    const fullType = type || DEFAULT_TYPE
    const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const currentUrl =
      canonicalLink?.href ||
      (typeof window !== 'undefined' ? getCanonicalUrl(window.location.pathname, window.location.search) : `${ORIGIN}/`)

    if (title) {
      document.title = fullTitle
    }
    setMetaTag('name', 'description', fullDesc)
    setMetaTag('property', 'og:title', fullTitle)
    setMetaTag('property', 'og:description', fullDesc)
    setMetaTag('property', 'og:image', fullImage)
    setMetaTag('property', 'og:url', currentUrl)
    setMetaTag('property', 'og:type', fullType)
    setMetaTag('name', 'twitter:card', DEFAULT_TWITTER_CARD)
    setMetaTag('name', 'twitter:title', fullTitle)
    setMetaTag('name', 'twitter:description', fullDesc)
    setMetaTag('name', 'twitter:image', fullImage)

    return () => {
      document.title = DEFAULT_TITLE
      setMetaTag('name', 'description', DEFAULT_DESCRIPTION)
      setMetaTag('property', 'og:title', DEFAULT_TITLE)
      setMetaTag('property', 'og:description', DEFAULT_DESCRIPTION)
      setMetaTag('property', 'og:image', DEFAULT_IMAGE)
      setMetaTag('property', 'og:url', `${ORIGIN}/`)
      setMetaTag('property', 'og:type', DEFAULT_TYPE)
      setMetaTag('name', 'twitter:card', DEFAULT_TWITTER_CARD)
      setMetaTag('name', 'twitter:title', DEFAULT_TITLE)
      setMetaTag('name', 'twitter:description', DEFAULT_DESCRIPTION)
      setMetaTag('name', 'twitter:image', DEFAULT_IMAGE)
    }
  }, [title, description, image, type])
}

/**
 * Канонический адрес текущей страницы, без подпапки сборки и слэша на конце. Из параметров остаётся только ?page=N
 * у списков (в каталоге — если других фильтров нет): так же считает canonicalFor в worker/index.js.
 */
export function useCanonical() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    // Worker убирает ссылку со страниц вне поиска (комнаты, 404): там её и не нужно ставить.
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) return
    link.href = getCanonicalUrl(pathname, search)
  }, [pathname, search])
}

/**
 * Динамическая вставка / обновление микроразметки Schema.org (JSON-LD) при переходах в SPA.
 * Управляет тегом <script id="app-jsonld" type="application/ld+json">.
 * Если передан null или при размонтировании компонента, тег удаляется.
 */
export function useJsonLd(schema?: Record<string, any> | null) {
  const serialized = schema ? JSON.stringify(schema) : null
  useEffect(() => {
    let script = document.getElementById('app-jsonld') as HTMLScriptElement | null
    if (!serialized) {
      if (script) script.remove()
      return
    }
    if (!script) {
      script = document.createElement('script')
      script.id = 'app-jsonld'
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = serialized.replace(/</g, '\\u003c')
    return () => {
      const el = document.getElementById('app-jsonld')
      if (el) el.remove()
    }
  }, [serialized])
}

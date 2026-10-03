import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Anime Life'
// Совпадает с <title> в index.html.
const DEFAULT_TITLE = 'Смотреть аниме онлайн бесплатно с русской озвучкой | Anime Life'

/**
 * Заголовок вкладки и описание страницы: видно в истории браузера, закладках и у поисковиков,
 * которые выполняют JavaScript. Для превью ссылок в мессенджерах то же самое подставляет worker/index.js.
 * Готовый заголовок из шаблонов src/data/seo.ts (уже с названием сайта) ставится как есть.
 */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    if (!title) return
    document.title = title.endsWith(SITE) ? title : `${title} | ${SITE}`
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prev = meta?.content
    if (meta && description) meta.content = description.slice(0, 200)
    return () => {
      document.title = DEFAULT_TITLE
      if (meta && prev) meta.content = prev
    }
  }, [title, description])
}

// Основной адрес сайта: копии (GitHub Pages, старые домены) называют канонической страницу на нём.
const ORIGIN = 'https://animelife.top'

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
    const path = pathname.replace(/\/+$/, '') || '/'
    const params = new URLSearchParams(search)
    const page = Number(params.get('page'))
    const keep =
      /^\/(?:catalog$|genre\/|type\/|year\/)/.test(path) &&
      Number.isInteger(page) &&
      page > 1 &&
      (path !== '/catalog' || [...params.keys()].every((k) => k === 'page'))
    link.href = ORIGIN + path + (keep ? `?page=${page}` : '')
  }, [pathname, search])
}

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Anime Life'
const DEFAULT_TITLE = 'Anime Life — смотреть аниме онлайн'

/**
 * Заголовок вкладки и описание страницы: видно в истории браузера, закладках и у поисковиков,
 * которые выполняют JavaScript. Для превью ссылок в мессенджерах то же самое подставляет worker/index.js.
 */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    if (!title) return
    document.title = `${title} — ${SITE}`
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

/** Канонический адрес текущей страницы, без подпапки сборки, параметров и слэша на конце. */
export function useCanonical() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Worker убирает ссылку со страниц вне поиска (комнаты, 404): там её и не нужно ставить.
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (link) link.href = ORIGIN + (pathname.replace(/\/+$/, '') || '/')
  }, [pathname])
}

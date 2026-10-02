import { useEffect } from 'react'

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

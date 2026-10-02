import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => unknown }

/**
 * Переход на страницу с анимацией View Transitions без тяжёлого data router.
 * Если передать селектор, этот элемент внутри ссылки «перелетает» в элемент с тем же
 * view-transition-name на новой странице (постер карточки в шапку тайтла).
 */
export function useMorphLink(to: string, morphSelector?: string) {
  const navigate = useNavigate()
  return (e: MouseEvent<HTMLAnchorElement>) => {
    const doc = document as ViewTransitionDoc
    const calm =
      document.documentElement.dataset.calm === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || calm || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const el = morphSelector ? e.currentTarget.querySelector<HTMLElement>(morphSelector) : null
    if (el) el.style.viewTransitionName = 'poster'
    doc.startViewTransition(() => {
      if (el) el.style.viewTransitionName = ''
      flushSync(() => navigate(to))
    })
  }
}

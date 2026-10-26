import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready?: Promise<void> }
}

/** Анимации выключены системой или переключателем «Без анимаций» в профиле. */
export const calm = () =>
  document.documentElement.dataset.calm === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Адрес страницы без того, что меняется внутри неё: серии одного тайтла — одна страница плеера.
 * По нему React решает, пересоздавать ли страницу, а прокрутка и объёмный переход — нужны ли они.
 */
export const pageScope = (path: string) => path.replace(/^(\/watch\/[^/]+)\/.*$/, '$1')

/**
 * Переходы между страницами через View Transitions без тяжёлого data router: перехватываем
 * клики по внутренним ссылкам и меняем страницу внутри document.startViewTransition.
 * Постер карточки (элемент с data-morph внутри ссылки) «перелетает» в шапку тайтла,
 * где у постера тот же view-transition-name. Где API нет (Safari до 18), страница
 * просто мягко появляется CSS-анимацией .page.
 */
export function useViewTransitions() {
  const navigate = useNavigate()
  useEffect(() => {
    const doc = document as ViewTransitionDoc
    if (!doc.startViewTransition) return
    // Объёмные переходы (страница уходит вглубь, постер переворачивается в полёте): стили отдельным файлом.
    void import('./vt3d.css')
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || calm()) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target || link.hasAttribute('download') || link.origin !== location.origin) return
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      if (!link.pathname.startsWith(base)) return
      const to = link.pathname.slice(base.length) + link.search + link.hash
      if (to === location.pathname.slice(base.length) + location.search + location.hash) return
      // Другая серия того же тайтла: плеер меняет видео на месте, переход страницы здесь лишний.
      if (pageScope(link.pathname) === pageScope(location.pathname)) return
      // Вкладка в фоне: снимок страницы не снять, переход всё равно сорвётся.
      if (document.visibilityState !== 'visible') return
      e.preventDefault()
      const morph = link.querySelector<HTMLElement>('[data-morph]')
      // С тайтла на тайтл (карточка в «Связанном»): постер в шапке уходящей страницы тоже зовётся poster,
      // а два одинаковых имени срывают переход. На время снимка гасим его и возвращаем после смены страницы:
      // React мог оставить тот же элемент шапки для нового тайтла.
      const held = morph ? [...document.querySelectorAll<HTMLElement>('.title-head__poster')].filter((el) => el.style.viewTransitionName === 'poster') : []
      held.forEach((el) => (el.style.viewTransitionName = 'none'))
      if (morph) morph.style.viewTransitionName = 'poster'
      const root = document.documentElement
      root.classList.add('vt')
      const transition = doc.startViewTransition!(() => {
        if (morph) morph.style.viewTransitionName = ''
        flushSync(() => navigate(to))
        held.forEach((el) => (el.style.viewTransitionName = 'poster'))
      })
      // Переход сорвался (сменился размер окна и т. п.): страница уже сменилась, просто без анимации.
      transition.ready?.catch(() => undefined)
      void transition.finished.catch(() => undefined).finally(() => root.classList.remove('vt'))
    }
    // Ловим раньше обработчика ссылок React Router: он увидит defaultPrevented и не перейдёт второй раз.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navigate])
}

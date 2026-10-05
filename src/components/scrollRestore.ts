import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const STORE = 'anime.scroll.v1'
/** Сколько ждём, пока догрузятся полки и сетка, прежде чем бросить попытки вернуть прокрутку. */
const RESTORE_MS = 4000

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/**
 * Кнопка «назад» в браузере возвращает туда, где зритель был: на ту же высоту главной, каталога или
 * подборки. Браузер сам этого не умеет, потому что страница дорисовывается после перехода
 * (полки и сетка грузятся отдельно), поэтому позицию запоминаем по записи истории и
 * докручиваем до неё, пока страница не станет достаточно длинной. Новый переход начинается сверху.
 */
export function useScrollRestore() {
  const location = useLocation()
  const type = useNavigationType()
  const positions = useRef<Record<string, number>>(load())
  const key = useRef(location.key)
  const lastPath = useRef<string>()

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const onScroll = () => {
      positions.current[key.current] = window.scrollY
    }
    // Записи истории живут и после перезагрузки вкладки, поэтому позиции храним в sessionStorage.
    const save = () => {
      try {
        sessionStorage.setItem(STORE, JSON.stringify(positions.current))
      } catch {
        /* приватный режим: помним только до перезагрузки */
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', save)
    }
  }, [])

  // До отрисовки кадра: иначе событие прокрутки от новой, более короткой страницы перезапишет
  // позицию прошлой записи истории.
  useLayoutEffect(() => {
    key.current = location.key
    const samePath = lastPath.current === location.pathname
    lastPath.current = location.pathname
    const target = type === 'POP' ? positions.current[location.key] : undefined
    if (target === undefined) {
      // Смена фильтров в адресе той же страницы не должна бросать наверх.
      if (!samePath) window.scrollTo(0, 0)
      return
    }
    let stop = false
    const cancel = () => (stop = true)
    const started = performance.now()
    const tick = () => {
      if (stop || performance.now() - started > RESTORE_MS) return done()
      const reachable = document.documentElement.scrollHeight - window.innerHeight >= target - 2
      if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
      // Когда до позиции можно докрутить, ещё немного держим её: выше могут догрузиться полки.
      if (reachable && performance.now() - started > 600) return done()
      frame = requestAnimationFrame(tick)
    }
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
    const done = () => events.forEach((e) => window.removeEventListener(e, cancel))
    events.forEach((e) => window.addEventListener(e, cancel, { passive: true }))
    let frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      done()
    }
  }, [location.key])
}

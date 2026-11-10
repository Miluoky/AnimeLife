/**
 * Объёмный наклон карточек за курсором (редизайн «Витрина в глубину»).
 * Один общий обработчик на весь документ: карточка под курсором получает
 * CSS-переменные --rx/--ry (наклон) и --gx/--gy (где блик), остальное делает CSS.
 * Только мышь: на телефонах и при «меньше движения» не подключается.
 */
import './tilt.css'

const SELECTOR = '.poster-card__img, [data-tilt]'
/** Мягкий наклон ≤4° (раньше 9°) — дешевле для compositor на витрине. */
const MAX_DEG = 4

let started = false

const isPlayback = () => /^\/(watch|together)(\/|$)/.test(location.pathname)

/** lite / спокойный режим / скрытая вкладка — без 3D-наклона. */
const muted = () =>
  document.documentElement.dataset.lite === '1' ||
  document.documentElement.dataset.calm === '1' ||
  document.hidden

export function startTilt() {
  if (started) return
  const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
  if (!motion.matches) return
  started = true
  let current: HTMLElement | null = null
  let frame = 0
  let last: PointerEvent | null = null

  const reset = (el: HTMLElement) => {
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
    el.style.removeProperty('--gx')
    el.style.removeProperty('--gy')
  }

  const clearCurrent = () => {
    if (current) {
      reset(current)
      current = null
    }
  }

  const apply = () => {
    frame = 0
    const e = last
    if (!e) return
    // На /watch|/together наклон не нужен: pointermove + rAF рядом с iframe лишняя нагрузка.
    if (isPlayback() || muted()) {
      clearCurrent()
      return
    }
    const target = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR) ?? null
    if (current && current !== target) reset(current)
    current = target
    if (!target) return
    const r = target.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    target.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX_DEG).toFixed(2)}deg`)
    target.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX_DEG).toFixed(2)}deg`)
    target.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`)
    target.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`)
  }

  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      // Не ставим rAF на playback — иначе каждый move будит main thread рядом с видео.
      if (isPlayback()) {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        last = null
        clearCurrent()
        return
      }
      // lite/calm/hidden: без rAF, сброс текущего наклона.
      if (muted()) {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        last = null
        clearCurrent()
        return
      }
      last = e
      if (!frame) frame = requestAnimationFrame(apply)
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => current && reset(current))
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      last = null
      clearCurrent()
    }
  })
}

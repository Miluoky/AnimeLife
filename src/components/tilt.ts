/**
 * Объёмный наклон карточек за курсором (редизайн «Витрина в глубину»).
 * Один общий обработчик на весь документ: карточка под курсором получает
 * CSS-переменные --rx/--ry (наклон) и --gx/--gy (где блик), остальное делает CSS.
 * Только мышь: на телефонах и при «меньше движения» не подключается.
 */
import './tilt.css'

const SELECTOR = '.poster-card__img, [data-tilt]'
const MAX_DEG = 9

export function startTilt() {
  const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
  if (!motion.matches) return
  let current: HTMLElement | null = null
  let frame = 0
  let last: PointerEvent | null = null

  const reset = (el: HTMLElement) => {
    el.style.removeProperty('--rx')
    el.style.removeProperty('--ry')
    el.style.removeProperty('--gx')
    el.style.removeProperty('--gy')
  }

  const apply = () => {
    frame = 0
    const e = last
    if (!e) return
    // Настройка «Спокойный режим» в оформлении выключает наклон на лету.
    const target = document.documentElement.dataset.calm === '1' ? null : (e.target as Element | null)?.closest<HTMLElement>(SELECTOR) ?? null
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
      last = e
      if (!frame) frame = requestAnimationFrame(apply)
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => current && reset(current))
}

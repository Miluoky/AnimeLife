import { useEffect, useState } from 'react'
import { ArrowUpIcon } from './Icons'

const SHOW_AFTER = 1200

/** Круглая кнопка «Наверх»: появляется, когда страницу прокрутили больше чем на пару экранов. */
export default function BackToTop() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SHOW_AFTER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!shown) return null
  const top = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
  }
  return (
    <button type="button" className="back-to-top" aria-label="Наверх" onClick={top}>
      <ArrowUpIcon />
    </button>
  )
}

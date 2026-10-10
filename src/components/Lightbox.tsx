import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BackIcon, CloseIcon, NextIcon } from './Icons'
import './lightbox.css'

interface Props {
  label: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  children: React.ReactNode
}

/** Полноэкранный просмотр кадра или видео. Esc закрывает, стрелки листают. */
export default function Lightbox({ label, onClose, onPrev, onNext, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onPrev?.()
      else if (e.key === 'ArrowRight') onNext?.()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose, onPrev, onNext])

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="lightbox__body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <button type="button" className="icon-btn lightbox__close" aria-label="Закрыть" onClick={onClose}>
        <CloseIcon />
      </button>
      {onPrev && (
        <button
          type="button"
          className="icon-btn lightbox__nav lightbox__nav--prev"
          aria-label="Предыдущий"
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
        >
          <BackIcon />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          className="icon-btn lightbox__nav lightbox__nav--next"
          aria-label="Следующий"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
        >
          <NextIcon />
        </button>
      )}
    </div>,
    document.body,
  )
}

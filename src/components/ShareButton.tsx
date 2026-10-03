import { toast } from '../data/toast'
import { ShareIcon } from './Icons'

/** «Поделиться»: системное меню на телефоне, на компьютере ссылка копируется. */
export default function ShareButton({ title, path, className = 'btn btn--ghost' }: { title: string; path: string; className?: string }) {
  const share = async () => {
    const url = `${location.origin}${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Ссылка скопирована')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }
  return (
    <button type="button" className={className} onClick={share} aria-label="Поделиться" title="Поделиться">
      <ShareIcon />
    </button>
  )
}

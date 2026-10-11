import { useEffect, useState } from 'react'
import { CloseIcon } from './Icons'
import { inTelegramApp } from '../data/tgApp'
import { type InstallPromptEvent, isIosSafari, isStandalone } from './install'
import './install.css'

const DISMISS_KEY = 'install-banner-hidden-until'
const HIDE_FOR = 14 * 24 * 60 * 60 * 1000

function hiddenByUser() {
  try {
    return Date.now() < Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  } catch {
    return false
  }
}

function hideForAWhile() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + HIDE_FOR))
  } catch {
    // Без хранилища баннер просто появится снова при следующем заходе.
  }
}

export default function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Внутри Telegram Mini App установка не нужна: сайт и так открыт как приложение.
    if (isStandalone() || hiddenByUser() || inTelegramApp) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
      setOpen(true)
    }
    const onInstalled = () => setOpen(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // Баннер грузится отдельной частью: событие могло прийти раньше, его поймал main.tsx.
    const early = (window as Window & { __installPrompt?: Event }).__installPrompt
    if (early) onPrompt(early)
    if (isIosSafari() && window.matchMedia('(max-width: 900px)').matches) {
      setIos(true)
      setOpen(true)
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!open) return null

  const close = () => {
    hideForAWhile()
    setOpen(false)
  }

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === 'accepted') setOpen(false)
    else close()
  }

  return (
    <div className="install-banner" role="dialog" aria-label="Установить приложение">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={44} height={44} />
      <div className="install-banner__text">
        <strong>Anime Life на телефоне</strong>
        {ios ? (
          <span>
            Нажмите «Поделиться» <ShareGlyph /> внизу Safari, затем «На экран Домой».
          </span>
        ) : (
          <span>Иконка на главном экране и запуск без браузера.</span>
        )}
      </div>
      {!ios && (
        <button type="button" className="btn btn--accent install-banner__btn" onClick={install}>
          Установить
        </button>
      )}
      <button type="button" className="icon-btn install-banner__close" aria-label="Скрыть" onClick={close}>
        <CloseIcon />
      </button>
    </div>
  )
}

function ShareGlyph() {
  return (
    <svg className="install-banner__share" viewBox="0 0 24 24" width="16" height="16" aria-label="значок «Поделиться»">
      <path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

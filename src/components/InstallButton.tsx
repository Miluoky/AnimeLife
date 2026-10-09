import { useEffect, useState } from 'react'
import { type InstallPromptEvent, isIosSafari, isStandalone } from './install'

/** Кнопка «Установить» на странице /app. Где браузер не даёт ставить из кнопки, остаётся подсказка из текста страницы. */
export default function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [state, setState] = useState<'idle' | 'installed' | 'ios'>('idle')

  useEffect(() => {
    if (isStandalone()) return setState('installed')
    if (isIosSafari()) setState('ios')
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setState('installed')
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // Событие могло прийти до загрузки страницы: его ловит main.tsx.
    const early = (window as Window & { __installPrompt?: Event }).__installPrompt
    if (early) onPrompt(early)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    try {
      await prompt.prompt()
      if ((await prompt.userChoice).outcome === 'accepted') setState('installed')
    } catch {
      // Окно установки уже показывали (например, баннер): браузер повторно не откроет, остаётся меню браузера.
    }
    setPrompt(null)
  }

  if (state === 'installed') return <p className="legal__install muted">Anime Life уже установлено на этом устройстве.</p>
  if (state === 'ios') return <p className="legal__install muted">В Safari: «Поделиться», затем «На экран Домой».</p>
  if (!prompt) return <p className="legal__install muted">Если кнопки нет, установите через меню браузера, как написано выше.</p>
  return (
    <p className="legal__install">
      <button type="button" className="btn btn--accent" onClick={install}>
        Установить Anime Life
      </button>
    </p>
  )
}

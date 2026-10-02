import { useEffect, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '../api/appwrite'

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let script: Promise<TurnstileApi> | undefined

function loadTurnstile() {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    el.async = true
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    el.onerror = () => {
      script = undefined
      reject(new Error('turnstile'))
    }
    document.head.appendChild(el)
  })
  return script
}

export const captchaEnabled = !!TURNSTILE_SITE_KEY

/**
 * Проверка «не робот» от Cloudflare. Обычно проходит сама, без картинок.
 * Токен одноразовый: после отправки формы виджет пересоздаётся через key.
 */
export default function Turnstile({ onToken }: { onToken: (token: string | undefined) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  callback.current = onToken

  useEffect(() => {
    if (!captchaEnabled || !box.current) return
    let id: string | undefined
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return
        id = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          language: 'ru',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(undefined),
          'error-callback': () => callback.current(undefined),
        })
      })
      .catch(() => callback.current(undefined))
    return () => {
      cancelled = true
      if (id) window.turnstile?.remove(id)
    }
  }, [])

  if (!captchaEnabled) return null
  return <div ref={box} className="turnstile" />
}

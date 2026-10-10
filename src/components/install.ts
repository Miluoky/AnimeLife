/** Установка сайта как приложения (PWA): общее для баннера (InstallBanner) и страницы /app (InstallButton). */

/** Событие Chrome/Android, которое позволяет показать системное окно «Установить приложение». */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// На iPhone нет кнопки установки: Safari умеет только «На экран Домой» через меню «Поделиться».
export const isIosSafari = () => {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(ua)
}

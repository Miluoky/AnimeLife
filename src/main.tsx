import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './fonts.css'
import './styles.css'

// Окно «Установить приложение» Chrome предлагает один раз и рано: сохраняем событие для баннера,
// который грузится позже отдельной частью.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as Window & { __installPrompt?: Event }).__installPrompt = e
})

// Битые постеры: вместо значка «картинка не загрузилась» показываем подложку карточки.
// События error и load у картинок не всплывают, поэтому слушаем их на фазе захвата.
document.addEventListener(
  'error',
  (e) => {
    if (e.target instanceof HTMLImageElement) e.target.classList.add('img--broken')
  },
  true,
)
document.addEventListener(
  'load',
  (e) => {
    if (e.target instanceof HTMLImageElement) e.target.classList.remove('img--broken')
  },
  true,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Пуши и SDK Appwrite не нужны для первого экрана: подключаем их после загрузки, отдельной частью.
const initPush = () => {
  void import('./data/telegramNotify').then((m) => m.initTelegramNotify())
  return import('./data/push').then((m) => m.initPush())
}

// Приложение на телефоне: service worker кэширует сайт, чтобы он открывался быстро и без сети.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined)
      .finally(() => void initPush())
  })
} else {
  void initPush()
}

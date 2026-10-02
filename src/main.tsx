import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './fonts.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Пуши и SDK Appwrite не нужны для первого экрана: подключаем их после загрузки, отдельной частью.
const initPush = () => import('./data/push').then((m) => m.initPush())

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

/**
 * Сайт открыт как Telegram Mini App (кнопка «Смотреть» у бота @AnimeLifeAuth_bot).
 * Telegram передаёт данные запуска в хэше адреса (#tgWebAppData=...). Сохраняем их там, где их ищет
 * скрипт Telegram (sessionStorage '__telegram__initParams'), и убираем хэш из адреса: роутер
 * и ссылки «Поделиться» его не ждут. Остальное (src/data/telegramMiniApp.ts) грузится отдельной частью.
 */
const PARAMS_KEY = '__telegram__initParams'

function detect() {
  try {
    if (/tgWebApp/.test(window.location.hash)) {
      const params: Record<string, string> = {}
      new URLSearchParams(window.location.hash.slice(1)).forEach((v, k) => (params[k] = v))
      sessionStorage.setItem(PARAMS_KEY, JSON.stringify(params))
      history.replaceState(history.state, '', window.location.pathname + window.location.search)
      return true
    }
    return !!sessionStorage.getItem(PARAMS_KEY)
  } catch {
    return false
  }
}

export const inTelegramApp = typeof window !== 'undefined' && detect()

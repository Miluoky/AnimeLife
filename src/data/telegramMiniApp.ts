/**
 * Режим Telegram Mini App: скрипт Telegram, цвета шапки под тему сайта, системная кнопка «Назад»,
 * внешние ссылки через Telegram и вход в аккаунт без кнопок: функция social-login проверяет
 * подпись данных запуска (initData) токеном бота и выдаёт одноразовый токен для аккаунта tg_<id>.
 * Документация: https://core.telegram.org/bots/webapps
 */

interface WebApp {
  initData: string
  initDataUnsafe: { start_param?: string }
  version: string
  ready(): void
  expand(): void
  isVersionAtLeast(v: string): boolean
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  disableVerticalSwipes?(): void
  openLink(url: string): void
  openTelegramLink(url: string): void
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp }
  }
}

const SCRIPT = 'https://telegram.org/js/telegram-web-app.js'

function loadScript() {
  return new Promise<WebApp>((resolve, reject) => {
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp)
    const s = document.createElement('script')
    s.src = SCRIPT
    s.onload = () => (window.Telegram?.WebApp ? resolve(window.Telegram.WebApp) : reject(new Error('no WebApp')))
    s.onerror = reject
    document.head.append(s)
  })
}

/** Цвет фона страницы в виде #rrggbb: шапка и низ Telegram сливаются с сайтом. */
function pageColor() {
  const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g)
  if (!rgb || rgb.length < 3) return '#0a0a0c'
  return '#' + rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

function paint(app: WebApp) {
  const color = pageColor()
  try {
    app.setHeaderColor(color)
    app.setBackgroundColor(color)
    app.setBottomBarColor?.(color)
  } catch {
    // старый клиент Telegram не умеет менять цвета
  }
}

/** React Router хранит номер шага истории в history.state.idx: «Назад» нужна со второго шага. */
function syncBackButton(app: WebApp) {
  const idx = (history.state as { idx?: number } | null)?.idx ?? 0
  if (idx > 0) app.BackButton.show()
  else app.BackButton.hide()
}

function watchNavigation(onChange: () => void) {
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      onChange()
    }
  }
  window.addEventListener('popstate', onChange)
}

/** Ссылка из бота вида t.me/<бот>/<app>?startapp=anime_123 или watch_123_5 открывает нужную страницу. */
export function startPath(param: string | undefined) {
  const m = param?.match(/^(anime|watch|manga)_(\d+)(?:_(\d+))?$/)
  if (!m) return null
  if (m[1] === 'watch') return `/watch/${m[2]}/${m[3] ?? 1}`
  return `/${m[1]}/${m[2]}`
}

function openStartParam(app: WebApp) {
  const path = startPath(app.initDataUnsafe.start_param)
  if (!path || window.location.pathname !== '/') return
  history.replaceState(history.state, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
}

// Внутри Telegram переход на чужой сайт увёл бы зрителя из приложения: открываем такие ссылки через Telegram.
function routeExternalLinks(app: WebApp) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || a.origin === window.location.origin || !/^https?:$/.test(a.protocol)) return
    e.preventDefault()
    if (a.hostname === 't.me') app.openTelegramLink(a.href)
    else app.openLink(a.href)
  })
}

async function signIn(app: WebApp) {
  if (!app.initData) return
  const { account } = await import('../api/appwrite')
  try {
    await account.get()
    return
  } catch (e) {
    // Входим только когда сервер точно ответил «не вошёл», а не при сбое сети.
    if (!(e instanceof Error && 'code' in e && e.code === 401)) return
  }
  const { signInWithTelegramApp } = await import('./socialAuth')
  await signInWithTelegramApp(app.initData)
}

export async function initTelegramMiniApp() {
  document.documentElement.dataset.tg = '1'
  const app = await loadScript()
  app.ready()
  app.expand()
  // Прокрутка вниз не должна сворачивать приложение (Bot API 7.7+).
  if (app.isVersionAtLeast('7.7')) app.disableVerticalSwipes?.()
  paint(app)
  // Тема сайта могла поменяться в настройках оформления.
  new MutationObserver(() => paint(app)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  app.BackButton.onClick(() => history.back())
  watchNavigation(() => syncBackButton(app))
  syncBackButton(app)
  routeExternalLinks(app)
  openStartParam(app)
  await signIn(app).catch(() => undefined)
}

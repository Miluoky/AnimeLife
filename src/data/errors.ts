import { beacon, live } from './analytics'

/**
 * Ошибки JavaScript у посетителей уходят в функцию community (error-report), а администратор
 * видит их в /admin/analytics. Только на настоящем сайте, не больше пяти за загрузку страницы,
 * одинаковые — один раз. Шум не шлём: обрывы сети, расширения браузера, ResizeObserver.
 */

const MAX_PER_PAGE = 5
const sent = new Set<string>()

const NOISE = /ResizeObserver loop|^Script error\.?$|Failed to fetch|Load failed|NetworkError|network error|AbortError|The operation was aborted|dynamically imported module|Importing a module script failed|Unable to preload CSS/i

/** Браузер и система одной строкой: «Chrome 129 / Android». */
function browser() {
  const ua = navigator.userAgent
  const name = /YaBrowser\/(\d+)/.exec(ua)?.[0] ?? /Edg\/(\d+)/.exec(ua)?.[0] ?? /OPR\/(\d+)/.exec(ua)?.[0] ?? /Firefox\/(\d+)/.exec(ua)?.[0] ?? /Chrome\/(\d+)/.exec(ua)?.[0] ?? (/Safari/.test(ua) ? /Version\/(\d+)/.exec(ua)?.[0]?.replace('Version', 'Safari') : undefined) ?? 'Другой'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return `${name.replace('/', ' ')}${os ? ` / ${os}` : ''}`
}

/** Версия сайта — имя основного файла сборки (index-<хэш>.js). */
const release = () => document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src.split('/').pop() ?? ''

export function reportError(error: unknown, source = '') {
  const err = error instanceof Error ? error : undefined
  const message = (err ? `${err.name}: ${err.message}` : String(error)).slice(0, 500)
  // __reportErrors включает отправку в тестах (tests/errors.spec.ts): там адрес не animelife.top.
  if (!(live() || (window as Window & { __reportErrors?: boolean }).__reportErrors) || sent.size >= MAX_PER_PAGE || NOISE.test(message)) return
  const stack = err?.stack ?? ''
  // Ошибки из расширений браузера к сайту не относятся.
  if (/(chrome|moz|safari)-extension:\/\//.test(stack + source)) return
  const key = message + source
  if (sent.has(key)) return
  sent.add(key)
  beacon({ action: 'error-report', message, source: source.slice(0, 300), stack: stack.slice(0, 2000), path: location.pathname, browser: browser(), release: release() })
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    // Ошибки загрузки картинок и скриптов тоже приходят сюда, у них нет error.
    if (!e.error && !e.message) return
    reportError(e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '')
  })
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}

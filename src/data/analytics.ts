import { APPWRITE_ENDPOINT, APPWRITE_PROJECT, COMMUNITY_FUNCTION } from '../api/config'

const SESSION_KEY = 'animelife.analytics.session'
/** Отметка «я ещё здесь» раз в 2 минуты и только пока вкладка видна: онлайн — кто отмечался за 5 минут. */
const HEARTBEAT = 120_000

function sessionId() {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved && /^[a-f0-9-]{20,64}$/i.test(saved)) return saved
    const next = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return undefined
  }
}

/** Считаем только настоящий сайт: локальная сборка и тесты статистику не портят. */
const live = () => typeof location !== 'undefined' && /(^|\.)animelife\.top$/.test(location.hostname)

/**
 * Отметка просмотра — обычный запрос к функции, без SDK Appwrite: SDK тяжёлый,
 * а гостю на первом экране он не нужен (см. tests/smoke.spec.ts).
 */
function beacon(body: object) {
  void fetch(`${APPWRITE_ENDPOINT}/functions/${COMMUNITY_FUNCTION}/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': APPWRITE_PROJECT },
    body: JSON.stringify({ body: JSON.stringify(body), async: true, method: 'POST' }),
    keepalive: true,
  }).catch(() => undefined)
}

/** Устройство по ширине экрана и типу указателя: этого хватает для «телефон / планшет / компьютер». */
function device() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const width = Math.min(screen.width, screen.height)
  return coarse ? (width >= 600 ? 'tablet' : 'mobile') : 'desktop'
}

// Откуда пришли, отправляем только с первой страницы после входа на сайт.
let entry: { referrer: string; utm: string } | undefined = {
  referrer: typeof document !== 'undefined' ? document.referrer : '',
  utm: typeof location !== 'undefined' ? new URLSearchParams(location.search).get('utm_source') ?? '' : '',
}

export function trackPage(path: string) {
  const id = live() ? sessionId() : undefined
  if (!id) return
  let stopped = false
  let timer = 0
  const send = (pageview: boolean) => {
    if (stopped) return
    const extra = pageview && entry ? { device: device(), ...entry } : {}
    if (pageview) entry = undefined
    beacon({ action: 'analytics-track', sessionId: id, path, pageview, ...extra })
  }
  const schedule = () => {
    window.clearInterval(timer)
    if (document.visibilityState === 'visible') timer = window.setInterval(() => send(false), HEARTBEAT)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') send(false)
    schedule()
  }
  // Первая отметка — когда страница уже показана, чтобы не мешать загрузке.
  const first = window.setTimeout(() => send(true), 1500)
  schedule()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopped = true
    window.clearTimeout(first)
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

export interface AnalyticsPoint {
  at: string
  views: number
  episodes: number
  visitors: number
  newVisitors: number
}

export interface AnalyticsStats {
  online: number
  onlinePages: { name: string; count: number }[]
  visitors: { today: number; week: number; month: number; all: number }
  newVisitors: { today: number; week: number; month: number }
  views: { today: number; week: number; month: number }
  episodes: { today: number; week: number; month: number }
  users: { all: number; week: number }
  hours: AnalyticsPoint[]
  days: AnalyticsPoint[]
  devices: { name: string; count: number }[]
  sources: { name: string; count: number }[]
  popular: { path: string; views: number }[]
  generatedAt: string
}

export const loadAnalyticsStats = () => import('./community').then((m) => m.callCommunity<AnalyticsStats>({ action: 'analytics-stats' }))

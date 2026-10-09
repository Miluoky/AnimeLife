import { APPWRITE_ENDPOINT, APPWRITE_PROJECT, COMMUNITY_FUNCTION } from '../api/config'

const SESSION_KEY = 'animelife.analytics.session'
const HEARTBEAT = 60_000

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

export function trackPage(path: string) {
  const id = live() ? sessionId() : undefined
  if (!id) return
  let stopped = false
  const send = (pageview: boolean) => {
    if (!stopped) beacon({ action: 'analytics-track', sessionId: id, path, pageview })
  }
  // Первая отметка — когда страница уже показана, чтобы не мешать загрузке.
  const first = window.setTimeout(() => send(true), 1500)
  const timer = window.setInterval(() => send(false), HEARTBEAT)
  return () => {
    stopped = true
    window.clearTimeout(first)
    window.clearInterval(timer)
  }
}

export interface AnalyticsStats {
  online: number
  visitors: { today: number; week: number; month: number; all: number }
  popular: { path: string; views: number }[]
  generatedAt: string
}

export const loadAnalyticsStats = () => import('./community').then((m) => m.callCommunity<AnalyticsStats>({ action: 'analytics-stats' }))
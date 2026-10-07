import { callCommunity } from './community'

const SESSION_KEY = 'animelife.analytics.session'
const HEARTBEAT = 60_000

function sessionId() {
  const saved = localStorage.getItem(SESSION_KEY)
  if (saved && /^[a-f0-9-]{20,64}$/i.test(saved)) return saved
  const next = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, next)
  return next
}

export function trackPage(path: string) {
  const id = sessionId()
  let stopped = false
  const send = (pageview: boolean) => {
    if (stopped) return
    void callCommunity({ action: 'analytics-track', sessionId: id, path, pageview }).catch(() => undefined)
  }
  send(true)
  const timer = window.setInterval(() => send(false), HEARTBEAT)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

export interface AnalyticsStats {
  online: number
  visitors: { today: number; week: number; month: number; all: number }
  popular: { path: string; views: number }[]
  generatedAt: string
}

export const loadAnalyticsStats = () => callCommunity<AnalyticsStats>({ action: 'analytics-stats' })
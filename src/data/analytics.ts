const SESSION_KEY = 'animelife.analytics.session'
/**
 * Heartbeat отключён: каждый тик = вызов Worker и лимит Cloudflare.
 * Онлайн в админке — по pageview за сессию; при необходимости включить > 0.
 */
const HEARTBEAT = 0

/** События, которые можно слить в один вызов Worker. */
const BATCH_ACTIONS = new Set(['analytics-track', 'quality-track', 'error-report'])
/** Интервал сброса очереди (с). */
const FLUSH_MS = 20_000
const MAX_BATCH = 40

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
export const live = () => typeof location !== 'undefined' && /(^|\.)animelife\.top$/.test(location.hostname)

type BeaconBody = Record<string, unknown> & { action?: string }

let queue: BeaconBody[] = []
let flushTimer = 0
let flushListeners = false

/** Тесты (quality/errors) ждут отправку сразу, без ожидания интервала. */
const instantBeacon = () =>
  typeof window !== 'undefined' &&
  (!!(window as Window & { __reportQuality?: boolean }).__reportQuality ||
    !!(window as Window & { __reportErrors?: boolean }).__reportErrors)

function post(body: object) {
  void fetch('/api/core/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'include',
  }).catch(() => undefined)
}

function ensureFlushListeners() {
  if (flushListeners || typeof document === 'undefined') return
  flushListeners = true
  const onHide = () => flushBeacons()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide()
  })
  window.addEventListener('pagehide', onHide)
}

export function flushBeacons() {
  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = 0
  }
  if (!queue.length) return
  const items = queue.splice(0, MAX_BATCH)
  if (items.length === 1) {
    post(items[0])
    return
  }
  post({ action: 'analytics-batch', items })
  if (queue.length) scheduleFlush()
}

function scheduleFlush() {
  ensureFlushListeners()
  if (flushTimer || !queue.length) return
  flushTimer = window.setTimeout(() => {
    flushTimer = 0
    flushBeacons()
  }, FLUSH_MS)
}

/** Отметка просмотра и прочие метрики — POST на `/api/core/action` (пакетом, если можно). */
export function beacon(body: BeaconBody) {
  const action = String(body.action ?? '')
  if (!BATCH_ACTIONS.has(action)) {
    post(body)
    return
  }
  queue.push(body)
  if (instantBeacon()) {
    flushBeacons()
    return
  }
  scheduleFlush()
}

/** Устройство по ширине экрана и типу указателя: этого хватает для «телефон / планшет / компьютер». */
export function device() {
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
    if (HEARTBEAT > 0 && document.visibilityState === 'visible') {
      timer = window.setInterval(() => send(false), HEARTBEAT)
    }
  }
  const onVisibility = () => {
    if (HEARTBEAT > 0 && document.visibilityState === 'visible') send(false)
    schedule()
  }
  // Первая отметка — когда страница уже показана, чтобы не мешать загрузке.
  const first = window.setTimeout(() => send(true), 1500)
  schedule()
  if (HEARTBEAT > 0) document.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopped = true
    window.clearTimeout(first)
    window.clearInterval(timer)
    if (HEARTBEAT > 0) document.removeEventListener('visibilitychange', onVisibility)
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
  visitors: {
    today: number
    week: number
    month: number
    all: number
    /** уникальные за календарные сутки/период по Москве (сумма дневных счётчиков; week/month — визит-дни) */
    todayMsk?: number
    weekMsk?: number
    monthMsk?: number
  }
  newVisitors: { today: number; week: number; month: number }
  views: { today: number; week: number; month: number }
  episodes: { today: number; week: number; month: number }
  users: { all: number; week: number }
  hours: AnalyticsPoint[]
  days: AnalyticsPoint[]
  devices: { name: string; count: number }[]
  sources: { name: string; count: number }[]
  popular: { path: string; views: number }[]
  /** воронка новичков за 30 дней; нет у ответа старой функции */
  funnel?: {
    visitors: number
    titles: number
    episodes: number
    day1: { of: number; back: number }
    day7: { of: number; back: number }
  }
  /** размер выборки для устройств/источников */
  sample?: { sessions: number; capped: boolean; cohort: number }
  generatedAt: string
}

export const loadAnalyticsStats = () => import('./community').then((m) => m.callCommunity<AnalyticsStats>({ action: 'analytics-stats' }))

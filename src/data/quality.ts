import { useEffect, useRef } from 'react'
import { beacon, device, live } from './analytics'
import { onPlayerTime } from './playerTime'
import { clsOf, inpOf, type Shift } from './vitals'

/**
 * Как сайт работает у настоящих зрителей: скорость загрузки (LCP, CLS, INP) и плеер.
 * Замеры уходят в функцию community (quality-track), администратор видит сводку в /admin/analytics.
 * Только на animelife.top; __reportQuality включает отправку в тестах (tests/quality.spec.ts).
 */

const enabled = () => live() || !!(window as Window & { __reportQuality?: boolean }).__reportQuality

function observe(type: string, onEntries: (list: PerformanceEntry[]) => void, extra: object = {}) {
  try {
    const po = new PerformanceObserver((list) => onEntries(list.getEntries()))
    po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
  } catch {
    // Старый Safari не знает layout-shift и event: такие замеры просто не шлём.
  }
}

let watching = false

/**
 * Замер скорости первой загрузки страницы. Отправляем один раз, когда вкладку прячут или закрывают:
 * к этому времени LCP окончательный, а CLS и INP накоплены за всё время на странице.
 */
export function watchVitals() {
  if (watching || !enabled() || typeof PerformanceObserver === 'undefined') return
  watching = true
  // Страница открылась в фоне: её LCP — время до показа, а не скорость сайта.
  const hiddenAtStart = document.visibilityState === 'hidden'
  let lcp: number | undefined
  const shifts: Shift[] = []
  const interactions = new Map<number, number>()
  observe('largest-contentful-paint', (list) => {
    const entry = list[list.length - 1]
    if (entry) lcp = entry.startTime
  })
  observe('layout-shift', (list) => shifts.push(...(list as unknown as Shift[])))
  observe(
    'event',
    (list) => {
      for (const e of list as (PerformanceEntry & { interactionId?: number })[]) {
        if (e.interactionId) interactions.set(e.interactionId, Math.max(interactions.get(e.interactionId) ?? 0, e.duration))
      }
    },
    { durationThreshold: 40 },
  )
  let sent = false
  const send = () => {
    if (sent || document.visibilityState !== 'hidden') return
    sent = true
    const cls = clsOf(shifts)
    beacon({
      action: 'quality-track',
      kind: 'vitals',
      device: device(),
      lcp: hiddenAtStart || lcp === undefined ? undefined : Math.round(lcp),
      cls: Math.round(cls * 1000) / 1000,
      inp: inpOf([...interactions.values()]),
    })
  }
  document.addEventListener('visibilitychange', send)
  window.addEventListener('pagehide', send)
}

/**
 * Здоровье плеера на странице серии. Источник «запустился», когда время видео пошло вперёд,
 * «сбой» — когда он сообщил, что серию показать не может (onUnavailable). Итог серии — один раз:
 * пошла с первого источника, после автопереключения или так и не пошла.
 * Возвращает функцию, которую страница зовёт при сбое источника.
 */
export function usePlayerHealth(episodeKey: string | undefined, source: string | undefined) {
  const sourceRef = useRef(source)
  sourceRef.current = source
  const state = useRef({ fails: 0, started: false })
  useEffect(() => {
    if (!episodeKey || !enabled()) return
    const s = { fails: 0, started: false }
    state.current = s
    let last = -1
    const off = onPlayerTime((t) => {
      if (s.started) return
      if (last >= 0 && t > last) {
        s.started = true
        if (sourceRef.current) beacon({ action: 'quality-track', kind: 'player', source: sourceRef.current, ok: true })
        beacon({ action: 'quality-track', kind: 'episode', result: s.fails ? 'switched' : 'first' })
      }
      last = t
    })
    // Ушли со страницы, а серия так и не пошла после сбоя: это провал. Без сбоя — просто не стали смотреть.
    const finish = () => {
      if (s.started || !s.fails) return
      s.started = true
      beacon({ action: 'quality-track', kind: 'episode', result: 'failed' })
    }
    window.addEventListener('pagehide', finish)
    return () => {
      off()
      window.removeEventListener('pagehide', finish)
      finish()
    }
  }, [episodeKey])
  return () => {
    const s = state.current
    if (!enabled() || s.started) return
    s.fails++
    if (sourceRef.current) beacon({ action: 'quality-track', kind: 'player', source: sourceRef.current, ok: false })
  }
}

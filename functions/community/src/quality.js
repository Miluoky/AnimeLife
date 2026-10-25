import { DB, UserError, query } from './util.js'
import { bump, buckets, requireAdmin, startOfDay } from './analytics.js'

/**
 * Как сайт работает у настоящих зрителей (план развития, неделя 3).
 * Скорость (Core Web Vitals: LCP, CLS, INP) — по одной отметке с загрузки страницы, плеер — запуск или сбой источника
 * и итог серии: пошла с первого источника, после автопереключения или не пошла вовсе.
 * Счётчики лежат в analytics_stats (period quality, строка на день и метрику): good / mid / poor и сумма значений.
 */

const DEVICES = new Set(['mobile', 'tablet', 'desktop'])
const SOURCES = new Set(['kodik', 'alloha', 'anilibria', 'animevost', 'anixart', 'embed'])
const EPISODE = { first: 'good', switched: 'mid', failed: 'poor' }
const DAY = 24 * 60 * 60 * 1000

/** Пороги Google «хорошо / нужно улучшить»: LCP и INP в мс, CLS — доля сдвига. Выше второго — «плохо». */
export const VITALS = { lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500] }
/** Верхняя граница, выше которой значение — мусор (вкладка висела в фоне и т. п.), а не замер. */
const MAX = { lcp: 60_000, cls: 10, inp: 30_000 }

export function grade(metric, value) {
  const [good, mid] = VITALS[metric]
  return value <= good ? 'good' : value <= mid ? 'mid' : 'poor'
}

const valid = (metric, value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX[metric]

const row = (now, metric) => [`q${buckets(now).day}-${metric}`, { period: 'quality', at: startOfDay(now), label: metric }]

export async function qualityTrack(api, body, now = Date.now()) {
  const jobs = []
  if (body.kind === 'vitals') {
    const device = DEVICES.has(body.device) ? body.device : 'desktop'
    for (const metric of Object.keys(VITALS)) {
      const value = body[metric]
      if (!valid(metric, value)) continue
      // CLS храним в тысячных: колонка целочисленная.
      jobs.push([`${metric}-${device}`, { [grade(metric, value)]: 1, total: Math.round(metric === 'cls' ? value * 1000 : value) }])
    }
  } else if (body.kind === 'player' && SOURCES.has(body.source)) {
    jobs.push([`src-${body.source}`, { [body.ok ? 'good' : 'poor']: 1 }])
  } else if (body.kind === 'episode' && Object.hasOwn(EPISODE, body.result)) {
    jobs.push(['episode', { [EPISODE[body.result]]: 1 }])
  }
  if (!jobs.length) throw new UserError('Неверные данные замера.')
  await Promise.all(jobs.map(([metric, add]) => {
    const [id, base] = row(now, metric)
    return bump(api, id, base, add)
  }))
  return { ok: true }
}

/** Сводка за 7 дней: по каждой метрике — сколько хорошо / средне / плохо и среднее значение. */
export function summarize(rows) {
  const out = {}
  for (const r of rows) {
    const m = (out[r.label] ??= { good: 0, mid: 0, poor: 0, total: 0 })
    for (const key of ['good', 'mid', 'poor', 'total']) m[key] += Number(r[key] ?? 0)
  }
  return out
}

export async function qualityStats(api, req, now = Date.now()) {
  await requireAdmin(api, req)
  const result = await api('GET', `${DB}/analytics_stats/rows?${[
    { method: 'equal', attribute: 'period', values: ['quality'] },
    { method: 'greaterThanEqual', attribute: 'at', values: [startOfDay(now - 6 * DAY)] },
    { method: 'limit', values: [500] },
  ].map(query).join('&')}`)
  return { days: 7, metrics: summarize(result.json.rows ?? []) }
}

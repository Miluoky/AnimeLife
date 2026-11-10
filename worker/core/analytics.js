/**
 * Аналитика, качество и ошибки клиента (бывший Appwrite Function community).
 */

import { err, json } from './auth.js'
import { sha256Hex } from './crypto.js'

const SESSION_RE = /^[a-f0-9-]{20,64}$/i
const PATH_RE = /^\/[a-zA-Z0-9а-яА-ЯёЁ/_?=&.:%-]{0,300}$/
const DEVICES = new Set(['mobile', 'tablet', 'desktop'])
const MSK = 3 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ONLINE_WINDOW = 5 * 60 * 1000
const MAX_KINDS_PER_DAY = 200

const QUALITY_SOURCES = new Set(['kodik', 'alloha', 'anilibria', 'animevost', 'anixart', 'embed'])
const EPISODE = { first: 'good', switched: 'mid', failed: 'poor' }
const VITALS = { lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500] }
const VITAL_MAX = { lcp: 60_000, cls: 10, inp: 30_000 }

export const dayNumber = (ms) => Math.floor((ms + MSK) / DAY)

export function buckets(ms) {
  const iso = new Date(ms + MSK).toISOString()
  const day = iso.slice(0, 10).replace(/-/g, '')
  return { hour: day + iso.slice(11, 13), day, month: day.slice(0, 6) }
}

const startOf = (ms, unit) => new Date(Math.floor((ms + MSK) / unit) * unit - MSK).toISOString()
export const startOfDay = (ms) => startOf(ms, DAY)

const monthStart = (ms) => {
  const msk = new Date(ms + MSK)
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), 1) - MSK).toISOString()
}

async function digest(text) {
  return (await sha256Hex(text)).slice(0, 32)
}

export function sourceOf(referrer, utm) {
  const tag = String(utm ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40)
  if (tag) return tag
  let host = ''
  try {
    host = new URL(String(referrer ?? '')).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'direct'
  }
  if (!host || /(^|\.)animelife\.top$/.test(host)) return 'direct'
  if (/(^|\.)(yandex\.[a-z]+|ya\.ru)$/.test(host)) return 'yandex'
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google'
  if (/(^|\.)(t\.me|telegram\.org)$/.test(host)) return 'telegram'
  if (/(^|\.)(vk\.com|vk\.ru|vkontakte\.ru)$/.test(host)) return 'vk'
  if (/(^|\.)(bing\.com|duckduckgo\.com|mail\.ru)$/.test(host)) return host.split('.').slice(-2, -1)[0]
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube'
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok'
  return host.slice(0, 40)
}

function requireAdmin(session) {
  if (!session) return err('Войдите в аккаунт администратора.', 401)
  if (!(session.user.labels || []).includes('admin')) return err('Недостаточно прав.', 403)
  return null
}

const STAT_COLS = ['views', 'episodes', 'visitors', 'newVisitors', 'good', 'mid', 'poor', 'total']

async function bump(env, id, base, add) {
  const inc = Object.fromEntries(STAT_COLS.map((k) => [k, Math.max(0, Number(add[k] ?? 0) || 0)]))
  if (!STAT_COLS.some((k) => inc[k] > 0)) return
  const row = await env.DB.prepare('SELECT id FROM analytics_stats WHERE id = ?').bind(id).first()
  if (!row) {
    await env.DB.prepare(
      `INSERT INTO analytics_stats (id, period, at, label, views, episodes, visitors, newVisitors, good, mid, poor, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        base.period,
        base.at,
        base.label ?? null,
        inc.views,
        inc.episodes,
        inc.visitors,
        inc.newVisitors,
        inc.good,
        inc.mid,
        inc.poor,
        inc.total,
      )
      .run()
    return
  }
  const sets = []
  const vals = []
  for (const k of STAT_COLS) {
    if (inc[k] > 0) {
      sets.push(`${k} = ${k} + ?`)
      vals.push(inc[k])
    }
  }
  if (!sets.length) return
  await env.DB.prepare(`UPDATE analytics_stats SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals, id)
    .run()
}

function grade(metric, value) {
  const [good, mid] = VITALS[metric]
  return value <= good ? 'good' : value <= mid ? 'mid' : 'poor'
}

function validVital(metric, value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= VITAL_MAX[metric]
}

const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
    .slice(0, max)

export function funnelOf(rows, today) {
  const ready = (days) => rows.filter((row) => row.firstDay <= today - days)
  const day1 = ready(1)
  const day7 = ready(7)
  return {
    visitors: rows.length,
    titles: rows.filter((row) => Number(row.titles) > 0).length,
    episodes: rows.filter((row) => Number(row.episodes) > 0).length,
    day1: { of: day1.length, back: day1.filter((row) => row.ret1).length },
    day7: { of: day7.length, back: day7.filter((row) => row.ret7).length },
  }
}

const top = (map, limit) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }))

async function countSince(env, col, iso) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM analytics WHERE ${col} >= ?`).bind(iso).first()
  return r?.n ?? 0
}

async function analyticsTrack(env, body, now = Date.now()) {
  const sessionId = String(body.sessionId ?? '')
  const path = String(body.path ?? '').slice(0, 300)
  if (!SESSION_RE.test(sessionId) || !PATH_RE.test(path)) return err('Неверные данные посещения.', 400)
  const pageview = !!body.pageview
  const episode = pageview && /^\/watch\//.test(path)
  const title = pageview && /^\/(?:en\/)?anime\//.test(path)
  const id = `a${await digest(sessionId)}`
  const existing = await env.DB.prepare('SELECT * FROM analytics WHERE id = ?').bind(id).first()
  const fresh = !existing
  const last = existing?.last_seen ? Date.parse(existing.last_seen) : 0
  const at = buckets(now)
  const was = last ? buckets(last) : undefined
  const device = DEVICES.has(body.device) ? body.device : 'desktop'
  const today = dayNumber(now)
  const firstDay = fresh ? today : existing.first_day
  const gap = Number.isInteger(firstDay) ? today - firstDay : -1

  const views = Math.min(1_000_000, Number(existing?.views ?? 0) + (pageview ? 1 : 0))
  const episodes = Math.min(1_000_000, Number(existing?.episodes ?? 0) + (episode ? 1 : 0))
  const titles = Math.min(1_000_000, Number(existing?.titles ?? 0) + (title ? 1 : 0))
  const ret1 = existing?.ret1 ? 1 : gap === 1 ? 1 : 0
  const ret7 = existing?.ret7 ? 1 : gap >= 7 && gap <= 13 ? 1 : 0
  const lastSeen = new Date(now).toISOString()
  const src = existing?.source || sourceOf(body.referrer, body.utm)
  const dev = existing?.device || device
  const created = fresh ? now : existing.created_at

  if (fresh) {
    await env.DB.prepare(
      `INSERT INTO analytics (id, session_id, path, last_seen, views, episodes, titles, device, source, first_day, ret1, ret7, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, await digest(sessionId), path, lastSeen, views, episodes, titles, dev, src, firstDay, ret1, ret7, created)
      .run()
  } else {
    await env.DB.prepare(
      `UPDATE analytics SET path = ?, last_seen = ?, views = ?, episodes = ?, titles = ?, device = ?, source = ?, ret1 = ?, ret7 = ? WHERE id = ?`,
    )
      .bind(path, lastSeen, views, episodes, titles, dev, src, ret1, ret7, id)
      .run()
  }

  const count = (sameBucket) => ({
    views: pageview ? 1 : 0,
    episodes: episode ? 1 : 0,
    visitors: sameBucket ? 0 : 1,
    newVisitors: fresh ? 1 : 0,
  })
  await Promise.all([
    bump(env, `h${at.hour}`, { period: 'hour', at: startOf(now, HOUR) }, count(was?.hour === at.hour)),
    bump(env, `d${at.day}`, { period: 'day', at: startOf(now, DAY) }, count(was?.day === at.day)),
    pageview &&
      bump(
        env,
        `p${at.month}${(await digest(path)).slice(0, 20)}`,
        { period: 'page', at: startOf(now, DAY), label: path },
        { views: 1 },
      ),
  ])
  return json({ ok: true })
}

async function analyticsStats(env, session, now = Date.now()) {
  const denied = requireAdmin(session)
  if (denied) return denied

  const sinceIso = (ms) => new Date(now - ms).toISOString()
  const sinceCreated = (ms) => Date.now() - ms
  const today0 = dayNumber(now)

  const [
    online,
    today,
    week,
    month30,
    all,
    newToday,
    newWeek,
    newMonth,
    usersAll,
    usersWeek,
    counters,
    pages,
    sessions,
    cohort,
  ] = await Promise.all([
    countSince(env, 'last_seen', sinceIso(ONLINE_WINDOW)),
    countSince(env, 'last_seen', sinceIso(DAY)),
    countSince(env, 'last_seen', sinceIso(7 * DAY)),
    countSince(env, 'last_seen', sinceIso(30 * DAY)),
    env.DB.prepare('SELECT COUNT(*) AS n FROM analytics').first().then((r) => r?.n ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS n FROM analytics WHERE created_at >= ?').bind(sinceCreated(DAY)).first().then((r) => r?.n ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS n FROM analytics WHERE created_at >= ?').bind(sinceCreated(7 * DAY)).first().then((r) => r?.n ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS n FROM analytics WHERE created_at >= ?').bind(sinceCreated(30 * DAY)).first().then((r) => r?.n ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first().then((r) => r?.n ?? 0),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').bind(sinceCreated(7 * DAY)).first().then((r) => r?.n ?? 0),
    env.DB.prepare(
      `SELECT * FROM analytics_stats WHERE period IN ('hour', 'day') AND at >= ? ORDER BY at ASC LIMIT 2000`,
    )
      .bind(startOf(now - 30 * DAY, DAY))
      .all()
      .then((r) => r.results || []),
    env.DB.prepare(
      `SELECT label, views FROM analytics_stats WHERE period = 'page' AND at >= ? ORDER BY views DESC LIMIT 12`,
    )
      .bind(monthStart(now))
      .all()
      .then((r) => r.results || []),
    env.DB.prepare(
      `SELECT device, source, path, last_seen AS lastSeen FROM analytics WHERE last_seen >= ? LIMIT 12000`,
    )
      .bind(sinceIso(30 * DAY))
      .all()
      .then((r) => r.results || []),
    env.DB.prepare(
      `SELECT first_day AS firstDay, titles, episodes, ret1, ret7 FROM analytics WHERE first_day >= ? LIMIT 12000`,
    )
      .bind(today0 - 30)
      .all()
      .then((r) =>
        (r.results || []).map((row) => ({
          firstDay: row.firstDay,
          titles: row.titles,
          episodes: row.episodes,
          ret1: !!row.ret1,
          ret7: !!row.ret7,
        })),
      ),
  ])

  const point = (row) => ({
    at: row.at,
    views: Number(row.views ?? 0),
    episodes: Number(row.episodes ?? 0),
    visitors: Number(row.visitors ?? 0),
    newVisitors: Number(row.newVisitors ?? 0),
  })
  const hourFrom = startOf(now - 23 * HOUR, HOUR)
  const hours = counters.filter((row) => row.period === 'hour' && row.at >= hourFrom).map(point)
  const days = counters.filter((row) => row.period === 'day').map(point)
  const todayKey = startOf(now, DAY)
  const todayRow = days.find((row) => row.at === todayKey)
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
  const last = (n) => days.filter((row) => row.at >= startOf(now - (n - 1) * DAY, DAY))
  const weekDays = last(7)
  const monthDays = last(30)

  const devices = new Map()
  const sources = new Map()
  const live = new Map()
  for (const row of sessions) {
    devices.set(row.device || 'desktop', (devices.get(row.device || 'desktop') ?? 0) + 1)
    sources.set(row.source || 'direct', (sources.get(row.source || 'direct') ?? 0) + 1)
    if (Date.parse(row.lastSeen) >= now - ONLINE_WINDOW) live.set(row.path, (live.get(row.path) ?? 0) + 1)
  }

  return json({
    online,
    onlinePages: top(live, 8),
    funnel: funnelOf(cohort, today0),
    visitors: {
      today,
      week,
      month: month30,
      all,
      todayMsk: todayRow?.visitors ?? 0,
      weekMsk: sum(weekDays, 'visitors'),
      monthMsk: sum(monthDays, 'visitors'),
    },
    newVisitors: { today: newToday, week: newWeek, month: newMonth },
    views: { today: todayRow?.views ?? 0, week: sum(weekDays, 'views'), month: sum(monthDays, 'views') },
    episodes: { today: todayRow?.episodes ?? 0, week: sum(weekDays, 'episodes'), month: sum(monthDays, 'episodes') },
    users: { all: usersAll, week: usersWeek },
    hours,
    days,
    devices: top(devices, 3),
    sources: top(sources, 10),
    popular: pages.map((row) => ({ path: row.label, views: Number(row.views ?? 0) })),
    sample: { sessions: sessions.length, capped: sessions.length >= 12_000, cohort: cohort.length },
    generatedAt: new Date(now).toISOString(),
  })
}

function summarizeQuality(rows) {
  const out = {}
  for (const r of rows) {
    const m = (out[r.label] ??= { good: 0, mid: 0, poor: 0, total: 0 })
    for (const key of ['good', 'mid', 'poor', 'total']) m[key] += Number(r[key] ?? 0)
  }
  return out
}

async function qualityTrack(env, body, now = Date.now()) {
  const jobs = []
  if (body.kind === 'vitals') {
    const device = DEVICES.has(body.device) ? body.device : 'desktop'
    for (const metric of Object.keys(VITALS)) {
      const value = body[metric]
      if (!validVital(metric, value)) continue
      jobs.push([
        `${metric}-${device}`,
        { [grade(metric, value)]: 1, total: Math.round(metric === 'cls' ? value * 1000 : value) },
      ])
    }
  } else if (body.kind === 'player' && QUALITY_SOURCES.has(body.source)) {
    jobs.push([`src-${body.source}`, { [body.ok ? 'good' : 'poor']: 1 }])
  } else if (body.kind === 'episode' && Object.hasOwn(EPISODE, body.result)) {
    jobs.push(['episode', { [EPISODE[body.result]]: 1 }])
  }
  if (!jobs.length) return err('Неверные данные замера.', 400)
  await Promise.all(
    jobs.map(async ([metric, add]) => {
      const id = `q${buckets(now).day}-${metric}`
      const base = { period: 'quality', at: startOfDay(now), label: metric }
      return bump(env, id, base, add)
    }),
  )
  return json({ ok: true })
}

async function qualityStats(env, session, now = Date.now()) {
  const denied = requireAdmin(session)
  if (denied) return denied
  const rows = await env.DB.prepare(
    `SELECT label, good, mid, poor, total FROM analytics_stats WHERE period = 'quality' AND at >= ? LIMIT 500`,
  )
    .bind(startOfDay(now - 6 * DAY))
    .all()
  return json({ days: 7, metrics: summarizeQuality(rows.results || []) })
}

async function errorReport(env, body, now = Date.now()) {
  const message = clean(body.message, 500).trim()
  if (message.length < 3) return json({ ok: false })
  const source = clean(body.source, 300)
  const id = `e${(await digest(`${message}|${source.replace(/:\d+$/, '')}`)).slice(0, 30)}`
  const fresh = {
    path: clean(body.path, 300),
    browser: clean(body.browser, 60),
    release: clean(body.release, 40),
    last: now,
  }
  const existing = await env.DB.prepare('SELECT id FROM client_errors WHERE id = ?').bind(id).first()
  if (existing) {
    await env.DB.prepare(
      'UPDATE client_errors SET count = count + 1, path = ?, browser = ?, release = ?, last = ? WHERE id = ?',
    )
      .bind(fresh.path, fresh.browser, fresh.release, fresh.last, id)
      .run()
    return json({ ok: true })
  }
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM client_errors WHERE first > ?')
    .bind(now - DAY)
    .first()
  if ((today?.n ?? 0) >= MAX_KINDS_PER_DAY) return json({ ok: false })
  await env.DB.prepare(
    `INSERT INTO client_errors (id, message, source, stack, path, browser, release, count, first, last)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(
      id,
      message,
      source,
      clean(body.stack, 2000),
      fresh.path,
      fresh.browser,
      fresh.release,
      now,
      now,
    )
    .run()
  return json({ ok: true })
}

function rowError(r) {
  return {
    $id: r.id,
    message: r.message,
    source: r.source || undefined,
    stack: r.stack || undefined,
    path: r.path || undefined,
    browser: r.browser || undefined,
    release: r.release || undefined,
    count: r.count,
    first: r.first,
    last: r.last,
  }
}

async function errorList(env, session) {
  const denied = requireAdmin(session)
  if (denied) return denied
  const rows = await env.DB.prepare('SELECT * FROM client_errors ORDER BY last DESC LIMIT 50').all()
  return json({ errors: (rows.results || []).map(rowError) })
}

async function errorClear(env, session, body) {
  const denied = requireAdmin(session)
  if (denied) return denied
  const id = String(body.id ?? '')
  if (!/^e[a-f0-9]{30}$/.test(id)) return err('Ошибка не найдена.', 404)
  await env.DB.prepare('DELETE FROM client_errors WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

async function analyticsBatch(env, body, now = Date.now()) {
  const raw = body.items
  if (!Array.isArray(raw) || !raw.length) return err('Пустой пакет метрик.', 400)
  const items = raw.slice(0, 50)
  for (const item of items) {
    const action = String(item?.action || '')
    if (action === 'analytics-track') await analyticsTrack(env, item, now)
    else if (action === 'quality-track') await qualityTrack(env, item, now)
    else if (action === 'error-report') await errorReport(env, item, now)
  }
  return json({ ok: true, n: items.length })
}

export async function handleAnalyticsAction(env, session, body) {
  const action = String(body?.action || '')
  const now = Date.now()

  if (action === 'analytics-batch') return analyticsBatch(env, body, now)
  if (action === 'analytics-track') return analyticsTrack(env, body, now)
  if (action === 'analytics-stats') return analyticsStats(env, session, now)
  if (action === 'quality-track') return qualityTrack(env, body, now)
  if (action === 'quality-stats') return qualityStats(env, session, now)
  if (action === 'error-report') return errorReport(env, body, now)
  if (action === 'error-list') return errorList(env, session)
  if (action === 'error-clear') return errorClear(env, session, body)

  return null
}

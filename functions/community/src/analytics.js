import { DB, UserError, hash, query } from './util.js'

/**
 * Статистика посещений для администратора.
 * Таблица analytics — одна строка на браузер (ключ сессии из localStorage): последняя страница, время, устройство,
 * откуда пришёл впервые. Таблица analytics_stats — счётчики по часам (h2026100918), дням (d20261009)
 * и страницам за месяц (p202610…). Время считаем по Москве: так понятнее, когда «вечерний поток».
 * Таблицы создаёт functions/community/setup-analytics.mjs (запускается при выкладке функции).
 */

const SESSION_RE = /^[a-f0-9-]{20,64}$/i
const PATH_RE = /^\/[a-zA-Z0-9а-яА-ЯёЁ/_?=&.:%-]{0,300}$/
const DEVICES = new Set(['mobile', 'tablet', 'desktop'])
const MSK = 3 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Номер дня по Москве: для воронки «вернулся на следующий день / через неделю». */
export const dayNumber = (ms) => Math.floor((ms + MSK) / DAY)

/** Онлайн — кто был активен последние 5 минут (вкладка открыта и видна, отметка раз в 2 минуты). */
const ONLINE_WINDOW = 5 * 60 * 1000

export async function requireAdmin(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт администратора.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || !(user.json.labels ?? []).includes('admin')) throw new UserError('Недостаточно прав.')
}

/** Ключи периодов по московскому времени: 2026100918 (час), 20261009 (день), 202610 (месяц). */
export function buckets(ms) {
  const iso = new Date(ms + MSK).toISOString()
  const day = iso.slice(0, 10).replace(/-/g, '')
  return { hour: day + iso.slice(11, 13), day, month: day.slice(0, 6) }
}

/** Начало часа или дня по Москве как ISO-время — для колонки at и выборок за период. */
const startOf = (ms, unit) => new Date(Math.floor((ms + MSK) / unit) * unit - MSK).toISOString()
export const startOfDay = (ms) => startOf(ms, DAY)

/** Первое число текущего месяца по Москве. */
const monthStart = (ms) => {
  const msk = new Date(ms + MSK)
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), 1) - MSK).toISOString()
}

/** Откуда пришёл человек: поисковик, соцсеть, другой сайт или напрямую. */
export function sourceOf(referrer, utm) {
  const tag = String(utm ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
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

/** Прибавить к счётчикам строки; если строки ещё нет, создать её с этими значениями. */
export async function bump(api, id, base, add) {
  const columns = Object.entries(add).filter(([, value]) => value > 0)
  if (!columns.length) return
  const increment = () =>
    Promise.all(columns.map(([column, value]) => api('PATCH', `${DB}/analytics_stats/rows/${id}/${column}/increment`, { value })))
  const results = await increment()
  if (results.every((result) => result.status !== 404)) return
  try {
    await api('POST', `${DB}/analytics_stats/rows`, { rowId: id, data: { ...base, ...Object.fromEntries(columns) } })
  } catch {
    // Строку одновременно создал другой запрос: тогда просто прибавляем ещё раз.
    await increment()
  }
}

export async function analyticsTrack(api, body, now = Date.now()) {
  const sessionId = String(body.sessionId ?? '')
  const path = String(body.path ?? '').slice(0, 300)
  if (!SESSION_RE.test(sessionId) || !PATH_RE.test(path)) throw new UserError('Неверные данные посещения.')
  const pageview = !!body.pageview
  const episode = pageview && /^\/watch\//.test(path)
  const title = pageview && /^\/(?:en\/)?anime\//.test(path)
  const id = `a${hash(sessionId)}`
  const existing = await api('GET', `${DB}/analytics/rows/${id}`)
  const fresh = existing.status === 404
  const row = fresh ? {} : existing.json
  const last = row.lastSeen ? Date.parse(row.lastSeen) : 0
  const at = buckets(now)
  const was = last ? buckets(last) : undefined
  const device = DEVICES.has(body.device) ? body.device : 'desktop'
  // Воронка считается только по браузерам, впервые пришедшим после её запуска: у старых нет firstDay.
  const today = dayNumber(now)
  const firstDay = fresh ? today : row.firstDay
  const gap = Number.isInteger(firstDay) ? today - firstDay : -1

  await api('PUT', `${DB}/analytics/rows/${id}`, {
    data: {
      sessionId: hash(sessionId),
      path,
      lastSeen: new Date(now).toISOString(),
      views: Math.min(1_000_000, Number(row.views ?? 0) + (pageview ? 1 : 0)),
      episodes: Math.min(1_000_000, Number(row.episodes ?? 0) + (episode ? 1 : 0)),
      titles: Math.min(1_000_000, Number(row.titles ?? 0) + (title ? 1 : 0)),
      firstDay: Number.isInteger(firstDay) ? firstDay : null,
      // Вернулся на следующий день после первого визита; через неделю — в любой из дней с 7-го по 13-й.
      ret1: !!row.ret1 || gap === 1,
      ret7: !!row.ret7 || (gap >= 7 && gap <= 13),
      device: row.device || device,
      source: row.source || sourceOf(body.referrer, body.utm),
    },
  })

  const count = (sameBucket) => ({
    views: pageview ? 1 : 0,
    episodes: episode ? 1 : 0,
    visitors: sameBucket ? 0 : 1,
    newVisitors: fresh ? 1 : 0,
  })
  await Promise.all([
    bump(api, `h${at.hour}`, { period: 'hour', at: startOf(now, HOUR) }, count(was?.hour === at.hour)),
    bump(api, `d${at.day}`, { period: 'day', at: startOf(now, DAY) }, count(was?.day === at.day)),
    pageview && bump(api, `p${at.month}${hash(path).slice(0, 20)}`, { period: 'page', at: startOf(now, DAY), label: path }, { views: 1 }),
  ])
  return { ok: true }
}

async function countRows(api, table, queries) {
  const result = await api('GET', `${DB}/${table}/rows?${[...queries, { method: 'limit', values: [1] }].map(query).join('&')}`)
  return result.json.total ?? 0
}

/** Все строки по фильтру, страницами по 500 (с верхней границей, чтобы не тянуть лишнее). */
async function allRows(api, table, queries, max) {
  const rows = []
  while (rows.length < max) {
    const page = [...queries, { method: 'limit', values: [500] }]
    if (rows.length) page.push({ method: 'cursorAfter', values: [rows.at(-1).$id] })
    const result = await api('GET', `${DB}/${table}/rows?${page.map(query).join('&')}`)
    const found = result.json.rows ?? []
    rows.push(...found)
    if (found.length < 500) break
  }
  return rows
}

/**
 * Воронка новичков за 30 дней: зашёл → открыл тайтл → запустил серию → вернулся на следующий день → через неделю.
 * Возврат считаем только у тех, у кого этот день уже наступил: пришедший сегодня ещё не мог вернуться завтра.
 */
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

export async function analyticsStats(api, req, now = Date.now()) {
  await requireAdmin(api, req)
  const since = (ms) => ({ attribute: 'lastSeen', values: [new Date(now - ms).toISOString()] })
  const gte = (q) => ({ method: 'greaterThanEqual', ...q })
  const created = (ms) => gte({ attribute: '$createdAt', values: [new Date(now - ms).toISOString()] })

  const today0 = dayNumber(now)
  const [online, today, week, month30, all, newToday, newWeek, newMonth, users, usersWeek, counters, pages, sessions, cohort] = await Promise.all([
    countRows(api, 'analytics', [gte(since(ONLINE_WINDOW))]),
    countRows(api, 'analytics', [gte(since(DAY))]),
    countRows(api, 'analytics', [gte(since(7 * DAY))]),
    countRows(api, 'analytics', [gte(since(30 * DAY))]),
    countRows(api, 'analytics', []),
    countRows(api, 'analytics', [created(DAY)]),
    countRows(api, 'analytics', [created(7 * DAY)]),
    countRows(api, 'analytics', [created(30 * DAY)]),
    api('GET', `/users?${query({ method: 'limit', values: [1] })}`).then((r) => r.json.total ?? 0),
    api('GET', `/users?${[created(7 * DAY), { method: 'limit', values: [1] }].map(query).join('&')}`).then((r) => r.json.total ?? 0),
    allRows(api, 'analytics_stats', [
      { method: 'equal', attribute: 'period', values: ['hour', 'day'] },
      gte({ attribute: 'at', values: [startOf(now - 30 * DAY, DAY)] }),
      { method: 'orderAsc', attribute: 'at' },
    ], 2000),
    api('GET', `${DB}/analytics_stats/rows?${[
      { method: 'equal', attribute: 'period', values: ['page'] },
      gte({ attribute: 'at', values: [monthStart(now)] }),
      { method: 'orderDesc', attribute: 'views' },
      { method: 'limit', values: [12] },
    ].map(query).join('&')}`).then((r) => r.json.rows ?? []),
    allRows(api, 'analytics', [gte(since(30 * DAY)), { method: 'select', values: ['device', 'source', 'path', 'lastSeen'] }], 5000),
    allRows(api, 'analytics', [
      gte({ attribute: 'firstDay', values: [today0 - 30] }),
      { method: 'select', values: ['firstDay', 'titles', 'episodes', 'ret1', 'ret7'] },
    ], 5000),
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
  const todayRow = days.find((row) => row.at === startOf(now, DAY))
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
  const last = (n) => days.filter((row) => row.at >= startOf(now - (n - 1) * DAY, DAY))

  const devices = new Map()
  const sources = new Map()
  const live = new Map()
  for (const row of sessions) {
    devices.set(row.device || 'desktop', (devices.get(row.device || 'desktop') ?? 0) + 1)
    sources.set(row.source || 'direct', (sources.get(row.source || 'direct') ?? 0) + 1)
    if (Date.parse(row.lastSeen) >= now - ONLINE_WINDOW) live.set(row.path, (live.get(row.path) ?? 0) + 1)
  }

  return {
    online,
    onlinePages: top(live, 8),
    funnel: funnelOf(cohort, today0),
    visitors: { today, week, month: month30, all },
    newVisitors: { today: newToday, week: newWeek, month: newMonth },
    views: { today: todayRow?.views ?? 0, week: sum(last(7), 'views'), month: sum(days, 'views') },
    episodes: { today: todayRow?.episodes ?? 0, week: sum(last(7), 'episodes'), month: sum(days, 'episodes') },
    users: { all: users, week: usersWeek },
    hours,
    days,
    devices: top(devices, 3),
    sources: top(sources, 10),
    popular: pages.map((row) => ({ path: row.label, views: Number(row.views ?? 0) })),
    generatedAt: new Date(now).toISOString(),
  }
}

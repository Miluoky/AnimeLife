// Создаёт закрытые таблицы аналитики (сессии и счётчики) для функции community.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-analytics.mjs

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const KEY = process.env.APPWRITE_API_KEY

if (!KEY) {
  console.error('Задайте APPWRITE_API_KEY.')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: body && JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status >= 300 && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${json.message ?? ''}`)
  return { status: res.status, json }
}

const tables = [
  {
    // Ошибки JavaScript у посетителей: одна строка на одинаковую ошибку (src/errors.js).
    id: 'client_errors',
    name: 'Client Errors',
    columns: [
      ['string', { key: 'message', size: 500, required: true }],
      ['string', { key: 'source', size: 300, required: false }],
      ['string', { key: 'stack', size: 2000, required: false }],
      ['string', { key: 'path', size: 300, required: false }],
      ['string', { key: 'browser', size: 60, required: false }],
      ['string', { key: 'release', size: 40, required: false }],
      ['integer', { key: 'count', required: false, default: 0, min: 0 }],
      ['integer', { key: 'first', required: true }],
      ['integer', { key: 'last', required: true }],
    ],
    indexes: [{ key: 'last_desc', type: 'key', columns: ['last'], orders: ['DESC'] }],
  },
  {
    id: 'analytics',
    name: 'Analytics Sessions',
    columns: [
      ['string', { key: 'sessionId', size: 64, required: true }],
      ['string', { key: 'path', size: 300, required: true }],
      ['datetime', { key: 'lastSeen', required: true }],
      ['integer', { key: 'views', required: false, default: 0, min: 0, max: 1_000_000 }],
      ['integer', { key: 'episodes', required: false, default: 0, min: 0, max: 1_000_000 }],
      ['string', { key: 'device', size: 16, required: false }],
      ['string', { key: 'source', size: 64, required: false }],
      // Воронка новичков: сколько раз открывал тайтлы, день первого визита (по Москве), вернулся ли через день и неделю.
      ['integer', { key: 'titles', required: false, default: 0, min: 0, max: 1_000_000 }],
      ['integer', { key: 'firstDay', required: false, min: 0, max: 1_000_000 }],
      ['boolean', { key: 'ret1', required: false, default: false }],
      ['boolean', { key: 'ret7', required: false, default: false }],
    ],
    indexes: [
      { key: 'last_seen', type: 'key', columns: ['lastSeen'], orders: ['DESC'] },
      { key: 'first_day', type: 'key', columns: ['firstDay'], orders: ['ASC'] },
      { key: 'path_views', type: 'key', columns: ['path', 'views'], orders: ['ASC', 'DESC'] },
    ],
  },
  {
    // Счётчики по часам, дням и страницам за месяц (functions/community/src/analytics.js).
    id: 'analytics_stats',
    name: 'Analytics Counters',
    columns: [
      ['string', { key: 'period', size: 8, required: true }],
      ['datetime', { key: 'at', required: true }],
      ['string', { key: 'label', size: 300, required: false }],
      ['integer', { key: 'views', required: false, default: 0, min: 0 }],
      ['integer', { key: 'episodes', required: false, default: 0, min: 0 }],
      ['integer', { key: 'visitors', required: false, default: 0, min: 0 }],
      ['integer', { key: 'newVisitors', required: false, default: 0, min: 0 }],
    ],
    indexes: [
      { key: 'period_at', type: 'key', columns: ['period', 'at'], orders: ['ASC', 'ASC'] },
      { key: 'period_views', type: 'key', columns: ['period', 'views'], orders: ['ASC', 'DESC'] },
    ],
  },
]
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureTable(table) {
  const tablePath = `/tablesdb/${DATABASE}/tables/${table.id}`
  const existing = await api('GET', tablePath)
  if (existing.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, {
      tableId: table.id,
      name: table.name,
      permissions: [],
      rowSecurity: false,
      enabled: true,
    })
    console.log(`Таблица ${table.id} создана.`)
  } else {
    console.log(`Таблица ${table.id} уже есть.`)
  }

  for (const [type, body] of table.columns) {
    const column = await api('GET', `${tablePath}/columns/${body.key}`)
    if (column.status !== 404) continue
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`Колонка ${table.id}.${body.key} создана.`)
  }
  for (let attempt = 0; ; attempt++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((column) => column.status !== 'available')
    if (!pending.length) break
    if (pending.some((column) => column.status === 'failed')) throw new Error('Не все колонки создались.')
    if (attempt > 60) throw new Error('Колонки создаются слишком долго, запустите скрипт позже.')
    await pause(1000)
  }

  for (const index of table.indexes) {
    const found = await api('GET', `${tablePath}/indexes/${index.key}`)
    if (found.status !== 404) continue
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`Индекс ${table.id}.${index.key} создан.`)
  }
}

for (const table of tables) await ensureTable(table)
console.log('Готово.')

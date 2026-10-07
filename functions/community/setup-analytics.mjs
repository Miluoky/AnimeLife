// Создаёт закрытую таблицу аналитики для функции community.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-analytics.mjs

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const TABLE = 'analytics'
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

const tablePath = `/tablesdb/${DATABASE}/tables/${TABLE}`
const columns = [
  ['string', { key: 'sessionId', size: 64, required: true }],
  ['string', { key: 'path', size: 300, required: true }],
  ['datetime', { key: 'lastSeen', required: true }],
  ['integer', { key: 'views', required: false, default: 0, min: 0, max: 1_000_000 }],
]
const indexes = [
  { key: 'last_seen', type: 'key', columns: ['lastSeen'], orders: ['DESC'] },
  { key: 'path_views', type: 'key', columns: ['path', 'views'], orders: ['ASC', 'DESC'] },
]
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureTable() {
  const existing = await api('GET', tablePath)
  if (existing.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, {
      tableId: TABLE,
      name: 'Analytics Sessions',
      permissions: [],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Таблица analytics создана.')
  } else {
    console.log('Таблица analytics уже есть.')
  }
}

async function ensureColumns() {
  for (const [type, body] of columns) {
    const existing = await api('GET', `${tablePath}/columns/${body.key}`)
    if (existing.status !== 404) continue
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`Колонка ${body.key} создана.`)
  }
  for (let attempt = 0; ; attempt++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((column) => column.status !== 'available')
    if (!pending.length) return
    if (pending.some((column) => column.status === 'failed')) throw new Error('Не все колонки создались.')
    if (attempt > 60) throw new Error('Колонки создаются слишком долго, запустите скрипт позже.')
    await pause(1000)
  }
}

async function ensureIndexes() {
  for (const index of indexes) {
    const existing = await api('GET', `${tablePath}/indexes/${index.key}`)
    if (existing.status !== 404) continue
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`Индекс ${index.key} создан.`)
  }
}

await ensureTable()
await ensureColumns()
await ensureIndexes()
console.log('Готово.')
// Создаёт публично читаемую таблицу общего чата; запись остаётся только через функцию community.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-community-chat.mjs

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const TABLE = 'community_chat'
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
  ['string', { key: 'userId', size: 36, required: true }],
  ['string', { key: 'name', size: 64, required: true }],
  ['string', { key: 'text', size: 500, required: true }],
  ['integer', { key: 'at', required: true }],
]
const indexes = [
  { key: 'at_desc', type: 'key', columns: ['at'], orders: ['DESC'] },
  { key: 'user_at', type: 'key', columns: ['userId', 'at'], orders: ['ASC', 'DESC'] },
]
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const table = await api('GET', tablePath)
  if (table.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, {
      tableId: TABLE,
      name: 'Community Chat',
      permissions: ['read("any")'],
      rowSecurity: false,
      enabled: true,
    })
    console.log(`Таблица ${TABLE} создана.`)
  } else {
    console.log(`Таблица ${TABLE} уже есть.`)
  }

  for (const [type, body] of columns) {
    const existing = await api('GET', `${tablePath}/columns/${body.key}`)
    if (existing.status !== 404) continue
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`Колонка ${body.key} создана.`)
  }

  for (let attempt = 0; ; attempt++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((column) => column.status !== 'available')
    if (!pending.length) break
    if (pending.some((column) => column.status === 'failed')) throw new Error('Не все колонки создались.')
    if (attempt > 60) throw new Error('Колонки создаются слишком долго, запустите скрипт позже.')
    await pause(1000)
  }

  for (const index of indexes) {
    const existing = await api('GET', `${tablePath}/indexes/${index.key}`)
    if (existing.status !== 404) continue
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`Индекс ${index.key} создан.`)
  }
  console.log('Готово.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
// Создаёт таблицу takedowns (жалобы правообладателей и обратная связь) в базе anime через REST API TablesDB.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-takedowns.mjs
// Ключу нужны права tables.*, columns.* и indexes.* (read и write). Повторный запуск ничего не ломает: что уже есть, пропускается.
// Права на таблицу пустые, как у push и sent: сайт её не видит, читает и пишет только функция community.

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const TABLE = 'takedowns'
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

// Колонки: путь типа в API и тело запроса. Строки с запасом под проверки функции (src/takedowns.js).
const COLUMNS = [
  ['enum', { key: 'kind', elements: ['takedown', 'contact'], required: true }],
  ['string', { key: 'name', size: 200, required: true }],
  ['string', { key: 'email', size: 254, required: true }],
  ['string', { key: 'links', size: 4000, required: false }],
  ['string', { key: 'message', size: 5000, required: true }],
  // У обязательной колонки не бывает значения по умолчанию, поэтому status необязательный с 'new'.
  ['enum', { key: 'status', elements: ['new', 'done', 'rejected'], required: false, default: 'new' }],
  // Время отправки в миллисекундах, как at в comments и rooms.
  ['integer', { key: 'createdAt', required: true }],
  ['string', { key: 'ipHash', size: 64, required: false }],
  ['string', { key: 'userId', size: 36, required: false }],
]

// Индексы под запросы функции: список по статусу и ограничения по IP, email и общему числу за час.
const INDEXES = [
  { key: 'status_created', type: 'key', columns: ['status', 'createdAt'], orders: ['ASC', 'DESC'] },
  { key: 'ip_created', type: 'key', columns: ['ipHash', 'createdAt'], orders: ['ASC', 'DESC'] },
  { key: 'email_created', type: 'key', columns: ['email', 'createdAt'], orders: ['ASC', 'DESC'] },
  { key: 'created', type: 'key', columns: ['createdAt'], orders: ['DESC'] },
]

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const table = await api('GET', tablePath)
  if (table.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, {
      tableId: TABLE,
      name: 'Takedowns',
      permissions: [],
      rowSecurity: false,
      enabled: true,
    })
    console.log(`Таблица ${TABLE} создана.`)
  } else {
    console.log(`Таблица ${TABLE} уже есть.`)
  }

  for (const [type, body] of COLUMNS) {
    const existing = await api('GET', `${tablePath}/columns/${body.key}`)
    if (existing.status !== 404) {
      console.log(`  колонка ${body.key}: уже есть`)
      continue
    }
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`  колонка ${body.key}: создана (${type})`)
  }

  // Колонки создаются в фоне: индексы можно строить, когда все стали available.
  for (let i = 0; ; i++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((c) => c.status !== 'available')
    if (!pending.length) break
    if (pending.some((c) => c.status === 'failed')) throw new Error(`Колонки не создались: ${pending.map((c) => c.key).join(', ')}`)
    if (i > 60) throw new Error('Колонки создаются слишком долго, запустите скрипт ещё раз позже.')
    await pause(1000)
  }

  for (const index of INDEXES) {
    const existing = await api('GET', `${tablePath}/indexes/${index.key}`)
    if (existing.status !== 404) {
      console.log(`  индекс ${index.key}: уже есть`)
      continue
    }
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`  индекс ${index.key}: создан`)
  }
  console.log('Готово.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})

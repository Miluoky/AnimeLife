// Таблицы стены профиля (ProfileWall): profile_wall и profile_wall_likes.
// Скрипт пропускает то, что уже есть в базе anime.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-profile-wall.mjs

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

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureTable(tableId, name, permissions) {
  const path = `/tablesdb/${DATABASE}/tables/${tableId}`
  const table = await api('GET', path)
  if (table.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, {
      tableId,
      name,
      permissions,
      rowSecurity: false,
      enabled: true,
    })
    console.log(`Таблица ${tableId} создана.`)
  } else {
    console.log(`Таблица ${tableId} уже есть.`)
  }
  return `/tablesdb/${DATABASE}/tables/${tableId}`
}

async function ensureColumns(tablePath, definitions) {
  for (const [type, body] of definitions) {
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
}

async function ensureIndexes(tablePath, definitions) {
  for (const index of definitions) {
    const existing = await api('GET', `${tablePath}/indexes/${index.key}`)
    if (existing.status !== 404) continue
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`Индекс ${index.key} создан.`)
  }
}

const str = (key, size, required = true) => ['string', { key, size, required }]
const int = (key, required = true) => ['integer', { key, required, ...(required ? {} : { default: 0 }) }]
const bool = (key) => ['boolean', { key, required: false, default: false }]
const idx = (key, columns, orders = columns.map(() => 'ASC')) => ({ key, type: 'key', columns, orders })
const PUBLIC = ['read("any")']

const TABLES = [
  {
    id: 'profile_wall',
    name: 'Profile Wall',
    permissions: PUBLIC,
    columns: [
      str('profileId', 36),
      str('userId', 36),
      str('name', 64),
      str('avatarUrl', 500, false),
      str('frame', 32, false),
      str('text', 1000),
      int('at'),
      int('likes', false),
      str('replyToName', 64, false),
      bool('hidden'),
    ],
    indexes: [
      idx('profile_at', ['profileId', 'at'], ['ASC', 'DESC']),
      idx('user_at', ['userId', 'at'], ['ASC', 'DESC']),
    ],
  },
  {
    id: 'profile_wall_likes',
    name: 'Profile Wall Likes',
    permissions: [],
    columns: [
      str('commentId', 36),
      str('userId', 36),
      int('at'),
    ],
    indexes: [
      idx('comment_id', ['commentId']),
      idx('user_id', ['userId']),
    ],
  },
]

for (const t of TABLES) {
  const tablePath = await ensureTable(t.id, t.name, t.permissions)
  await ensureColumns(tablePath, t.columns)
  await ensureIndexes(tablePath, t.indexes)
}

console.log('Схема ProfileWall в порядке.')

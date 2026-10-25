// Таблицы социальной части (social.js): подписки и лента, приглашения друзей (invites.js), уведомления (notifications.js), ответы в комментариях, подборки зрителей, клубы, оценки серий, связь с Shikimori,
// и колонки опыта в профилях для топа зрителей. Скрипт пропускает то, что уже есть.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-social.mjs

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
    id: 'follows',
    name: 'Follows',
    permissions: PUBLIC,
    columns: [str('followerId', 36), str('followeeId', 36), int('at')],
    indexes: [idx('follower', ['followerId']), idx('followee', ['followeeId'])],
  },
  {
    id: 'activity',
    name: 'Activity',
    permissions: PUBLIC,
    columns: [
      str('userId', 36),
      str('name', 64),
      str('kind', 16),
      str('animeId', 12),
      str('title', 200, false),
      str('poster', 500, false),
      str('status', 16, false),
      int('value', false),
      int('at'),
    ],
    indexes: [idx('user_at', ['userId', 'at'], ['ASC', 'DESC']), idx('at_desc', ['at'], ['DESC'])],
  },
  {
    id: 'user_collections',
    name: 'User Collections',
    permissions: PUBLIC,
    columns: [
      str('ownerId', 36),
      str('ownerName', 64),
      str('title', 80),
      str('about', 500, false),
      str('items', 60000),
      int('count', false),
      str('cover', 500, false),
      int('likes', false),
      int('at'),
      int('updatedAt'),
      bool('hidden'),
    ],
    indexes: [idx('owner', ['ownerId']), idx('likes_desc', ['likes'], ['DESC']), idx('updated_desc', ['updatedAt'], ['DESC'])],
  },
  {
    id: 'collection_likes',
    name: 'Collection Likes',
    permissions: [],
    columns: [str('collectionId', 36), str('userId', 36), int('at')],
    indexes: [idx('collection', ['collectionId']), idx('user', ['userId'])],
  },
  {
    id: 'clubs',
    name: 'Clubs',
    permissions: PUBLIC,
    columns: [
      str('ownerId', 36),
      str('ownerName', 64),
      str('title', 60),
      str('about', 500, false),
      int('members', false),
      int('posts', false),
      int('at'),
      int('lastAt'),
    ],
    indexes: [idx('owner', ['ownerId']), idx('last_desc', ['lastAt'], ['DESC']), idx('members_desc', ['members'], ['DESC'])],
  },
  {
    id: 'club_members',
    name: 'Club Members',
    permissions: PUBLIC,
    columns: [str('clubId', 36), str('userId', 36), int('at')],
    indexes: [idx('club', ['clubId']), idx('user', ['userId'])],
  },
  {
    id: 'club_posts',
    name: 'Club Posts',
    permissions: PUBLIC,
    columns: [str('clubId', 36), str('userId', 36), str('name', 64), str('text', 2000), int('at'), bool('hidden'), int('reports', false)],
    indexes: [idx('club_at', ['clubId', 'at'], ['ASC', 'DESC']), idx('user_at', ['userId', 'at'], ['ASC', 'DESC'])],
  },
  {
    id: 'social_reports',
    name: 'Social Reports',
    permissions: [],
    columns: [str('targetId', 36), str('userId', 36), int('at')],
    indexes: [idx('target', ['targetId'])],
  },
  {
    id: 'episode_votes',
    name: 'Episode Votes',
    permissions: [],
    columns: [str('animeId', 12), int('episode'), str('userId', 36), int('score'), int('at')],
    indexes: [idx('anime_episode', ['animeId', 'episode'])],
  },
  {
    id: 'episode_scores',
    name: 'Episode Scores',
    permissions: PUBLIC,
    columns: [str('animeId', 12), int('episode'), int('sum', false), int('votes', false), ['float', { key: 'avg', required: false, default: 0 }]],
    indexes: [idx('anime_episode', ['animeId', 'episode']), idx('anime_avg', ['animeId', 'avg'], ['ASC', 'DESC'])],
  },
  {
    // Колокольчик на сайте (src/notifications.js): читается только через функцию.
    id: 'notifications',
    name: 'Notifications',
    permissions: [],
    columns: [
      str('userId', 36),
      str('kind', 16),
      str('actorId', 36),
      str('actorName', 64),
      str('text', 200, false),
      str('link', 300),
      int('at'),
      bool('read'),
    ],
    indexes: [idx('user_at', ['userId', 'at'], ['ASC', 'DESC']), idx('user_read', ['userId', 'read'])],
  },
  {
    id: 'shiki_links',
    name: 'Shikimori Links',
    permissions: [],
    columns: [int('shikiId'), str('nickname', 64, false), str('access', 200), str('refresh', 200), int('expiresAt')],
    indexes: [],
  },
  {
    // «Позови друга» (invites.js): строка = ID приглашённого, читает только функция.
    id: 'invites',
    name: 'Invites',
    permissions: [],
    columns: [str('inviterId', 36), str('name', 64), int('at')],
    indexes: [idx('inviter', ['inviterId'])],
  },
]

async function main() {
  for (const t of TABLES) {
    const path = await ensureTable(t.id, t.name, t.permissions)
    await ensureColumns(path, t.columns)
    await ensureIndexes(path, t.indexes)
  }
  // Профили уже есть: добавляем опыт для топа зрителей.
  const profiles = `/tablesdb/${DATABASE}/tables/profiles`
  await ensureColumns(profiles, [int('xp', false), int('weekXp', false), int('weekKey', false), int('monthXp', false), int('monthKey', false)])
  await ensureIndexes(profiles, [
    idx('xp_desc', ['xp'], ['DESC']),
    idx('week_xp', ['weekKey', 'weekXp'], ['ASC', 'DESC']),
    idx('month_xp', ['monthKey', 'monthXp'], ['ASC', 'DESC']),
  ])
  // Ответы в обсуждении серий: на какой комментарий и чьё имя показать.
  await ensureColumns(`/tablesdb/${DATABASE}/tables/comments`, [str('replyTo', 36, false), str('replyName', 64, false)])
  console.log('Готово.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

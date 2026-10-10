// Создаёт всё для глав манги, которые загружают команды переводчиков: таблицу manga_chapters в базе anime
// и хранилище картинок manga-pages. Запуск: APPWRITE_API_KEY=... node functions/community/setup-manga.mjs
// Ключу нужны права tables.*, columns.*, indexes.* и buckets.* (read и write). Повторный запуск ничего не ломает.
//
// Кто что может (права Appwrite, функция community не участвует):
// - читать главы и картинки может любой посетитель;
// - добавлять — только аккаунты с меткой translator (команды переводчиков) или admin; метку ставит админ в Appwrite;
// - менять и удалять — автор (права на строку и файлы он ставит себе при загрузке) и admin.

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const TABLE = 'manga_chapters'
const BUCKET = 'manga-pages'
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

const PERMISSIONS = [
  'read("any")',
  'create("label:translator")',
  'create("label:admin")',
  'update("label:admin")',
  'delete("label:admin")',
]

const tablePath = `/tablesdb/${DATABASE}/tables/${TABLE}`

const COLUMNS = [
  // id тайтла на Shikimori
  ['string', { key: 'mangaId', size: 16, required: true }],
  ['string', { key: 'lang', size: 8, required: true }],
  // номер главы строкой: бывают 10.5
  ['string', { key: 'num', size: 16, required: true }],
  ['string', { key: 'title', size: 200, required: false }],
  ['string', { key: 'team', size: 100, required: true }],
  // id файлов в хранилище manga-pages по порядку страниц
  ['string', { key: 'pages', size: 40, required: true, array: true }],
  ['string', { key: 'userId', size: 36, required: true }],
  ['integer', { key: 'createdAt', required: true }],
]

const INDEXES = [{ key: 'manga_lang', type: 'key', columns: ['mangaId', 'lang'], orders: ['ASC', 'ASC'] }]

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function table() {
  const existing = await api('GET', tablePath)
  if (existing.status === 404) {
    await api('POST', `/tablesdb/${DATABASE}/tables`, { tableId: TABLE, name: 'Manga chapters', permissions: PERMISSIONS, rowSecurity: true, enabled: true })
    console.log(`Таблица ${TABLE} создана.`)
  } else {
    console.log(`Таблица ${TABLE} уже есть.`)
  }
  for (const [type, body] of COLUMNS) {
    if ((await api('GET', `${tablePath}/columns/${body.key}`)).status !== 404) continue
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`  колонка ${body.key}: создана (${type})`)
  }
  for (let i = 0; ; i++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((c) => c.status !== 'available')
    if (!pending.length) break
    if (pending.some((c) => c.status === 'failed')) throw new Error(`Колонки не создались: ${pending.map((c) => c.key).join(', ')}`)
    if (i > 60) throw new Error('Колонки создаются слишком долго, запустите скрипт ещё раз позже.')
    await pause(1000)
  }
  for (const index of INDEXES) {
    if ((await api('GET', `${tablePath}/indexes/${index.key}`)).status !== 404) continue
    await api('POST', `${tablePath}/indexes`, index)
    console.log(`  индекс ${index.key}: создан`)
  }
}

async function bucket() {
  if ((await api('GET', `/storage/buckets/${BUCKET}`)).status !== 404) {
    console.log(`Хранилище ${BUCKET} уже есть.`)
    return
  }
  await api('POST', '/storage/buckets', {
    bucketId: BUCKET,
    name: 'Manga pages',
    permissions: PERMISSIONS,
    fileSecurity: true,
    enabled: true,
    // Страница манги в PNG бывает до 5–8 МБ.
    maximumFileSize: 15 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
    compression: 'none',
    encryption: false,
    antivirus: true,
  })
  console.log(`Хранилище ${BUCKET} создано.`)
}

table()
  .then(bucket)
  .then(() => console.log('Готово.'))
  .catch((e) => {
    console.error(e.message)
    process.exit(1)
  })

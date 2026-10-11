// Копия базы Appwrite: все таблицы базы anime (комментарии, отзывы, списки, профили, комнаты…)
// и аккаунты с настройками (в них лежат «Мой список» и история старых версий).
// Запускает workflow backup.yml раз в сутки; там папка шифруется и сохраняется артефактом на 30 дней.
// Запуск у себя: APPWRITE_API_KEY=... node scripts/backup-appwrite.mjs backup-dir
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const DATABASE = 'anime'
const KEY = process.env.APPWRITE_API_KEY
const OUT = process.argv[2] || 'backup'
const PAGE = 500

if (!KEY) {
  console.error('Задайте APPWRITE_API_KEY.')
  process.exit(1)
}

const q = (x) => `queries[]=${encodeURIComponent(JSON.stringify(x))}`

async function api(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT + path, { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY } }).catch(() => undefined)
    if (res?.ok) return res.json()
    if (attempt >= 4) throw new Error(`GET ${path}: ${res?.status ?? 'нет сети'} ${(await res?.text().catch(() => '')) ?? ''}`.slice(0, 300))
    await new Promise((r) => setTimeout(r, attempt * 2000))
  }
}

/** Все строки списка постранично через курсор: так не упираемся в лимит offset. */
async function all(path, key) {
  const out = []
  let cursor
  for (;;) {
    const queries = [q({ method: 'limit', values: [PAGE] }), ...(cursor ? [q({ method: 'cursorAfter', values: [cursor] })] : [])]
    const json = await api(`${path}${path.includes('?') ? '&' : '?'}${queries.join('&')}`)
    const items = json[key] ?? []
    out.push(...items)
    if (items.length < PAGE) return out
    cursor = items.at(-1).$id
  }
}

function save(name, items) {
  writeFileSync(`${OUT}/${name}.jsonl.gz`, gzipSync(items.map((x) => JSON.stringify(x)).join('\n')))
}

mkdirSync(OUT, { recursive: true })
const summary = { at: new Date().toISOString(), database: DATABASE, tables: {} }

const tables = await all(`/tablesdb/${DATABASE}/tables`, 'tables')
save('_tables', tables)
for (const t of tables) {
  const rows = await all(`/tablesdb/${DATABASE}/tables/${t.$id}/rows`, 'rows')
  save(`table-${t.$id}`, rows)
  summary.tables[t.$id] = rows.length
  console.log(`${t.$id}: ${rows.length}`)
}

const users = await all('/users', 'users')
save('users', users)
summary.users = users.length
console.log(`users: ${users.length}`)

writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
const total = Object.values(summary.tables).reduce((a, b) => a + b, 0)
console.log(`Готово: таблиц ${tables.length}, строк ${total}, аккаунтов ${users.length}.`)
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Копия базы ${summary.at}\n\nАккаунтов: ${users.length}\n\n| Таблица | Строк |\n|---|---|\n${Object.entries(summary.tables)
      .map(([k, v]) => `| ${k} | ${v} |`)
      .join('\n')}\n`,
    { flag: 'a' },
  )
}

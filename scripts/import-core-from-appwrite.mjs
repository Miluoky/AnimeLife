#!/usr/bin/env node
/**
 * Готовит данные для D1 из бэкапа Appwrite (scripts/backup-appwrite.mjs).
 *
 *   node scripts/import-core-from-appwrite.mjs ./backup ./core-import
 *
 * Пароли Appwrite несовместимы (другой алгоритм) — в users.password_hash пишем NULL,
 * пользователь ставит новый пароль или входит через OAuth после переноса oauth.
 * Списки и prefs переносятся как есть.
 */
import { createReadStream, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

const SRC = process.argv[2] || 'backup'
const OUT = process.argv[3] || 'core-import'

if (!existsSync(SRC)) {
  console.error(`Нет папки бэкапа: ${SRC}`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

async function* rows(file) {
  const path = join(SRC, file)
  if (!existsSync(path)) return
  const stream = createReadStream(path).pipe(createGunzip())
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    yield JSON.parse(line)
  }
}

function esc(s) {
  return String(s ?? '').replace(/'/g, "''")
}

function sqlStr(s) {
  if (s == null) return 'NULL'
  return `'${esc(s)}'`
}

const usersSql = []
const listsSql = []
const profilesSql = []
let users = 0
let lists = 0
let profiles = 0

// Пользователи из Users API бэкапа
for await (const u of rows('users.jsonl.gz')) {
  const id = u.$id
  const email = (u.email || `${id}@imported.local`).toLowerCase()
  const name = u.name || email.split('@')[0]
  const prefs = JSON.stringify(u.prefs || {})
  const labels = JSON.stringify(u.labels || [])
  const status = u.status === false ? 0 : 1
  const created = Date.parse(u.$createdAt || u.registration) || Date.now()
  const updated = Date.parse(u.$updatedAt) || created
  usersSql.push(
    `INSERT OR REPLACE INTO users (id, email, name, password_hash, labels, prefs, status, email_verified, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(email)}, ${sqlStr(name)}, NULL, ${sqlStr(labels)}, ${sqlStr(prefs)}, ${status}, 0, ${created}, ${updated});`,
  )
  users++
}

for await (const row of rows('table-lists.jsonl.gz')) {
  const userId = row.$id || row.userId
  const data = typeof row.data === 'string' ? row.data : JSON.stringify(row.data ?? [])
  const updated = Number(row.updatedAt) || Date.parse(row.$updatedAt) || Date.now()
  listsSql.push(
    `INSERT OR REPLACE INTO lists (user_id, data, updated_at) VALUES (${sqlStr(userId)}, ${sqlStr(data)}, ${updated});`,
  )
  lists++
}

for await (const row of rows('table-profiles.jsonl.gz')) {
  const userId = row.$id || row.userId
  const name = row.name || ''
  const about = row.about || ''
  const summary = typeof row.summary === 'string' ? row.summary : JSON.stringify(row.summary ?? {})
  const xp = Number(row.xp) || 0
  const level = Number(row.level) || 1
  const hidden = row.hidden ? 1 : 0
  const updated = Date.parse(row.$updatedAt) || Date.now()
  profilesSql.push(
    `INSERT OR REPLACE INTO profiles (user_id, name, about, summary, xp, level, hidden, updated_at) VALUES (${sqlStr(userId)}, ${sqlStr(name)}, ${sqlStr(about)}, ${sqlStr(summary)}, ${xp}, ${level}, ${hidden}, ${updated});`,
  )
  profiles++
}

writeFileSync(join(OUT, '01-users.sql'), usersSql.join('\n') + '\n')
writeFileSync(join(OUT, '02-lists.sql'), listsSql.join('\n') + '\n')
writeFileSync(join(OUT, '03-profiles.sql'), profilesSql.join('\n') + '\n')
writeFileSync(
  join(OUT, 'README.txt'),
  `Импорт ${new Date().toISOString()}
users=${users} lists=${lists} profiles=${profiles}

1) npx wrangler d1 execute anime_core --remote --file=worker/core/schema.sql
2) npx wrangler d1 execute anime_core --remote --file=${OUT}/01-users.sql
3) npx wrangler d1 execute anime_core --remote --file=${OUT}/02-lists.sql
4) npx wrangler d1 execute anime_core --remote --file=${OUT}/03-profiles.sql

Пароли не перенесены — нужен сброс или OAuth.
Файлы в бэкапе: ${readdirSync(SRC).join(', ')}
`,
)

console.log(`Готово: ${OUT} (users=${users}, lists=${lists}, profiles=${profiles})`)

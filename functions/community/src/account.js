import { DB, UserError, listRows } from './util.js'

/**
 * Свои данные без писем в поддержку (152-ФЗ): выгрузить всё, что сайт хранит об аккаунте,
 * и удалить аккаунт вместе с этими данными. Общие счётчики (оценки серий, лайки) остаются
 * обезличенными цифрами.
 */

/** Где лежат данные пользователя: таблица и колонка с его id ($id — строка с id пользователя). */
const OWNED = [
  ['lists', '$id'],
  ['profiles', '$id'],
  ['shiki_links', '$id'],
  ['reviews', 'userId'],
  ['comments', 'userId'],
  ['votes', 'userId'],
  ['community_chat', 'userId'],
  ['messages', 'userId'],
  ['members', 'userId'],
  ['activity', 'userId'],
  ['user_collections', 'ownerId'],
  ['collection_likes', 'userId'],
  ['clubs', 'ownerId'],
  ['club_members', 'userId'],
  ['club_posts', 'userId'],
  ['follows', 'followerId'],
  ['follows', 'followeeId'],
  ['episode_votes', 'userId'],
  ['notifications', 'userId'],
  ['push', 'userId'],
]

/** Поля, которые в выгрузку не идут: токены и ключи подписок. */
const SECRET_FIELDS = ['access', 'refresh', 'p256dh', 'auth']

async function signedIn(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

async function rowsOf(api, table, column, userId) {
  if (column === '$id') {
    const row = await api('GET', `${DB}/${table}/rows/${userId}`)
    return row.status === 200 ? [row.json] : []
  }
  const out = []
  for (let offset = 0; offset < 20_000; offset += 100) {
    const page = await listRows(api, table, [
      { method: 'equal', attribute: column, values: [userId] },
      { method: 'limit', values: [100] },
      { method: 'offset', values: [offset] },
    ]).catch(() => [])
    out.push(...page)
    if (page.length < 100) break
  }
  return out
}

const strip = (row) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET_FIELDS.includes(k) && !k.startsWith('$') || k === '$id' || k === '$createdAt'))

export async function accountExport(api, req) {
  const user = await signedIn(api, req)
  const tables = {}
  for (const [table, column] of OWNED) {
    const rows = await rowsOf(api, table, column, user.$id)
    if (rows.length) tables[`${table}${column === 'followeeId' ? ' (подписчики)' : ''}`] = rows.map(strip)
  }
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.$id, name: user.name, email: user.email, registered: user.registration ?? user.$createdAt, prefs: user.prefs ?? {} },
    tables,
  }
}

export async function accountDelete(api, req, body) {
  const user = await signedIn(api, req)
  if (String(body.confirm ?? '').trim().toUpperCase() !== 'УДАЛИТЬ') throw new UserError('Чтобы удалить аккаунт, введите слово УДАЛИТЬ.')
  // Подборки и клубы владельца уходят вместе с лайками, участниками и записями в них.
  for (const col of await rowsOf(api, 'user_collections', 'ownerId', user.$id)) {
    for (const like of await rowsOf(api, 'collection_likes', 'collectionId', col.$id)) await api('DELETE', `${DB}/collection_likes/rows/${like.$id}`)
  }
  for (const club of await rowsOf(api, 'clubs', 'ownerId', user.$id)) {
    for (const table of ['club_members', 'club_posts']) {
      for (const row of await rowsOf(api, table, 'clubId', club.$id)) await api('DELETE', `${DB}/${table}/rows/${row.$id}`)
    }
  }
  let removed = 0
  for (const [table, column] of OWNED) {
    for (const row of await rowsOf(api, table, column, user.$id)) {
      await api('DELETE', `${DB}/${table}/rows/${row.$id}`)
      removed++
    }
  }
  // Удалить сам аккаунт функция может, только если ей выдано право users.write. Если нет — сайт
  // после ответа сам отключит аккаунт (account.updateStatus), войти в него больше нельзя.
  const accountDeleted = await api('DELETE', `/users/${user.$id}`).then(
    () => true,
    () => false,
  )
  return { ok: true, removed, accountDeleted }
}

export const accountActions = {
  'account-export': accountExport,
  'account-delete': accountDelete,
}

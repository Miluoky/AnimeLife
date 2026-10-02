import { DB, UserError } from './util.js'

/**
 * Списки и профили.
 *   list-init  создать строку списка пользователя в таблице lists (ID строки = ID пользователя).
 *              Дальше сайт пишет в неё сам: право на чтение и правку есть только у владельца.
 *              Строку создаёт функция, чтобы никто не занял чужой ID заранее.
 */

async function signedIn(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

export async function listInit(api, req) {
  const user = await signedIn(api, req)
  const row = await api('GET', `${DB}/lists/rows/${user.$id}`)
  if (row.status === 404) {
    await api('POST', `${DB}/lists/rows`, {
      rowId: user.$id,
      data: { data: '[]', updatedAt: 0 },
      permissions: [`read("user:${user.$id}")`, `update("user:${user.$id}")`],
    })
  }
  return { ok: true }
}

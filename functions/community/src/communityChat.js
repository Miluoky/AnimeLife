import { DB, UserError, listRows } from './util.js'

const TABLE = 'community_chat'
const MAX_TEXT = 500
const MESSAGES_PER_10S = 5
const MESSAGE_TTL = 7 * 24 * 60 * 60 * 1000

async function signedIn(api, req, action) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError(`Войдите, чтобы ${action}.`)
  const result = await api('GET', `/users/${userId}`)
  if (result.status === 404 || result.json.status === false) throw new UserError('Аккаунт не найден.')
  return result.json
}

export async function communityChatSend(api, req, body) {
  const user = await signedIn(api, req, 'писать в общий чат')
  const message = String(body.text ?? '').trim().replace(/\s+/g, ' ')
  if (!message) throw new UserError('Напишите сообщение.')
  if (message.length > MAX_TEXT) throw new UserError(`Сообщение длиннее ${MAX_TEXT} символов.`)

  const now = Date.now()
  const recent = await listRows(api, TABLE, [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'greaterThan', attribute: 'at', values: [now - 10_000] },
    { method: 'limit', values: [MESSAGES_PER_10S] },
  ])
  if (recent.length >= MESSAGES_PER_10S) throw new UserError('Не так быстро: подождите пару секунд.')

  const row = await api('POST', `${DB}/${TABLE}/rows`, {
    rowId: 'unique()',
    data: {
      userId: user.$id,
      name: (user.name || 'Зритель').slice(0, 64),
      text: message,
      at: now,
    },
  })
  return { message: row.json }
}

export async function communityChatDelete(api, req, body) {
  const user = await signedIn(api, req, 'удалять сообщения')
  const messageId = String(body.messageId ?? '')
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(messageId)) throw new UserError('Сообщение не найдено.')
  const result = await api('GET', `${DB}/${TABLE}/rows/${messageId}`)
  if (result.status === 404) return { ok: true }
  if (result.json.userId !== user.$id && !(user.labels ?? []).includes('admin'))
    throw new UserError('Удалить это сообщение может только его автор или модератор.')
  await api('DELETE', `${DB}/${TABLE}/rows/${messageId}`)
  return { ok: true }
}

export async function cleanCommunityChat(api, now = Date.now()) {
  let deleted = 0
  for (let page = 0; page < 10; page++) {
    const old = await listRows(api, TABLE, [
      { method: 'lessThan', attribute: 'at', values: [now - MESSAGE_TTL] },
      { method: 'limit', values: [100] },
    ])
    await Promise.all(old.map((row) => api('DELETE', `${DB}/${TABLE}/rows/${row.$id}`)))
    deleted += old.length
    if (old.length < 100) break
  }
  return deleted
}
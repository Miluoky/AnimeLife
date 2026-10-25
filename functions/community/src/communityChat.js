import { DB, UserError, hash, listRows } from './util.js'
import { heldReason, rejectSpam } from './automod.js'

const TABLE = 'community_chat'
const REPORTS = 'community_chat_reports'
const MAX_TEXT = 500
const MESSAGES_PER_10S = 5
const REPORTS_PER_10M = 10
const REPORTS_TO_HIDE = 3
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
  rejectSpam(message, recent.map((r) => r.text))
  if (heldReason(message)) throw new UserError('В общем чате нельзя мат и ссылки на чужие сайты.')

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
  await deleteReports(api, messageId)
  await api('DELETE', `${DB}/${TABLE}/rows/${messageId}`)
  return { ok: true }
}

async function getMessage(api, messageId) {
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(String(messageId ?? ''))) throw new UserError('Сообщение не найдено.')
  const result = await api('GET', `${DB}/${TABLE}/rows/${messageId}`)
  if (result.status === 404) throw new UserError('Сообщение не найдено.')
  return result.json
}

async function deleteReports(api, messageId) {
  for (;;) {
    const rows = await listRows(api, REPORTS, [
      { method: 'equal', attribute: 'messageId', values: [messageId] },
      { method: 'limit', values: [100] },
    ])
    await Promise.all(rows.map((row) => api('DELETE', `${DB}/${REPORTS}/rows/${row.$id}`)))
    if (rows.length < 100) return
  }
}

export async function communityChatReport(api, req, body) {
  const user = await signedIn(api, req, 'жаловаться на сообщение')
  const message = await getMessage(api, body.messageId)
  if (message.userId === user.$id) throw new UserError('На своё сообщение жаловаться нельзя.')

  const reportId = `r${hash(`community-chat:${message.$id}:${user.$id}`)}`
  if ((await api('GET', `${DB}/${REPORTS}/rows/${reportId}`)).status !== 404)
    return { ok: true, already: true, hidden: Boolean(message.hidden) }

  const now = Date.now()
  const recent = await listRows(api, REPORTS, [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'greaterThan', attribute: 'at', values: [now - 10 * 60 * 1000] },
    { method: 'limit', values: [REPORTS_PER_10M] },
  ])
  if (recent.length >= REPORTS_PER_10M) throw new UserError('Слишком много жалоб. Попробуйте позже.')

  await api('PUT', `${DB}/${REPORTS}/rows/${reportId}`, {
    data: { messageId: message.$id, userId: user.$id, at: now },
  })
  const reports = await listRows(api, REPORTS, [
    { method: 'equal', attribute: 'messageId', values: [message.$id] },
    { method: 'limit', values: [100] },
  ])
  const hidden = Boolean(message.hidden || (!message.moderated && reports.length >= REPORTS_TO_HIDE))
  await api('PATCH', `${DB}/${TABLE}/rows/${message.$id}`, { data: { reports: reports.length, hidden } })
  return { ok: true, already: false, hidden }
}

async function signedAdmin(api, req) {
  const user = await signedIn(api, req, 'модерировать чат')
  if (!(user.labels ?? []).includes('admin')) throw new UserError('Нужны права модератора.')
  return user
}

export async function communityChatModList(api, req) {
  await signedAdmin(api, req)
  const messages = await listRows(api, TABLE, [
    {
      method: 'or',
      values: [
        { method: 'greaterThan', attribute: 'reports', values: [0] },
        { method: 'equal', attribute: 'hidden', values: [true] },
      ],
    },
    { method: 'orderDesc', attribute: 'reports' },
    { method: 'limit', values: [100] },
  ])
  return { messages }
}

export async function communityChatModAction(api, req, body) {
  await signedAdmin(api, req)
  const message = await getMessage(api, body.messageId)
  if (body.decision === 'delete') {
    await deleteReports(api, message.$id)
    await api('DELETE', `${DB}/${TABLE}/rows/${message.$id}`)
    return { ok: true }
  }
  if (body.decision !== 'hide' && body.decision !== 'show') throw new UserError('Неизвестное действие модератора.')
  const result = await api('PATCH', `${DB}/${TABLE}/rows/${message.$id}`, {
    data: { hidden: body.decision === 'hide', moderated: true },
  })
  return { message: result.json }
}

export async function cleanCommunityChat(api, now = Date.now()) {
  let deleted = 0
  for (let page = 0; page < 10; page++) {
    const old = await listRows(api, TABLE, [
      { method: 'lessThan', attribute: 'at', values: [now - MESSAGE_TTL] },
      { method: 'limit', values: [100] },
    ])
    await Promise.all(
      old.map(async (row) => {
        await deleteReports(api, row.$id)
        await api('DELETE', `${DB}/${TABLE}/rows/${row.$id}`)
      }),
    )
    deleted += old.length
    if (old.length < 100) break
  }
  return deleted
}
import { DB, UserError, hash, listRows } from './util.js'

/**
 * Уведомления на сайте (колокольчик в шапке): ответили на комментарий, отметили отзыв или подборку,
 * подписались, пришёл друг по ссылке-приглашению. Строки пишет только функция, читает их владелец через notif-list.
 * Таблица notifications создаётся в setup-social.mjs.
 */

const KINDS = ['reply', 'review-like', 'ucol-like', 'follow', 'invite']
const KEEP_DAYS = 60
const LIST_LIMIT = 30

async function signedIn(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

/**
 * Записывает уведомление для userId. key делает его одним на событие: повторный лайк после снятия
 * не плодит строки, а поднимает ту же наверх. Ошибка здесь не должна ломать само действие.
 */
export async function notify(api, { userId, kind, actor, text = '', link, key }) {
  if (!userId || userId === actor.$id || !KINDS.includes(kind)) return
  try {
    await api('PUT', `${DB}/notifications/rows/n${hash(`${kind}:${key}`)}`, {
      data: {
        userId,
        kind,
        actorId: actor.$id,
        actorName: (actor.name || 'Зритель').slice(0, 64),
        text: String(text).replace(/\s+/g, ' ').trim().slice(0, 200),
        link: String(link).slice(0, 300),
        at: Date.now(),
        read: false,
      },
    })
  } catch {
    // Уведомление не записалось — само действие всё равно прошло.
  }
}

export async function notifList(api, req) {
  const user = await signedIn(api, req)
  const items = await listRows(api, 'notifications', [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'orderDesc', attribute: 'at' },
    { method: 'limit', values: [LIST_LIMIT] },
  ])
  // Старые уведомления убираем заодно, без отдельного расписания.
  const old = items.filter((n) => n.at < Date.now() - KEEP_DAYS * 86400_000)
  await Promise.all(old.map((n) => api('DELETE', `${DB}/notifications/rows/${n.$id}`)))
  const fresh = items.filter((n) => !old.includes(n))
  return {
    items: fresh.map(({ $id, kind, actorId, actorName, text, link, at, read }) => ({ $id, kind, actorId, actorName, text, link, at, read })),
    unread: fresh.filter((n) => !n.read).length,
  }
}

export async function notifRead(api, req) {
  const user = await signedIn(api, req)
  const unread = await listRows(api, 'notifications', [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'equal', attribute: 'read', values: [false] },
    { method: 'limit', values: [100] },
  ])
  await Promise.all(unread.map((n) => api('PATCH', `${DB}/notifications/rows/${n.$id}`, { data: { read: true } })))
  return { ok: true }
}

export const notificationActions = {
  'notif-list': notifList,
  'notif-read': notifRead,
}

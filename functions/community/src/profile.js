import { DB, UserError, listRows } from './util.js'

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

/*
 *   profile-save {about, summary}  открыть профиль: имя берётся из аккаунта, сводка (счётчики, любимое,
 *                                  достижения) приходит с сайта и проверяется на размер и форму;
 *   profile-hide                   закрыть профиль (строка удаляется);
 *   comment-save {animeId, episode, text, spoiler}  комментарий к серии;
 *   comment-delete {commentId}     убрать комментарий (автор или модератор).
 */

const MAX_SUMMARY = 60000
const COMMENTS_PER_10MIN = 6

export async function profileSave(api, req, body) {
  const user = await signedIn(api, req)
  const summary = typeof body.summary === 'string' ? body.summary : JSON.stringify(body.summary ?? {})
  if (summary.length > MAX_SUMMARY) throw new UserError('Слишком большой профиль.')
  try {
    const parsed = JSON.parse(summary)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
  } catch {
    throw new UserError('Неверные данные профиля.')
  }
  await api('PUT', `${DB}/profiles/rows/${user.$id}`, {
    data: {
      name: (user.name || 'Зритель').slice(0, 64),
      about: String(body.about ?? '').trim().slice(0, 300),
      summary,
      updatedAt: Date.now(),
    },
  })
  return { ok: true }
}

export async function profileHide(api, req) {
  const user = await signedIn(api, req)
  await api('DELETE', `${DB}/profiles/rows/${user.$id}`)
  return { ok: true }
}

export async function commentSave(api, req, body) {
  const user = await signedIn(api, req)
  if (!/^\d{1,10}$/.test(String(body.animeId ?? ''))) throw new UserError('Неизвестный тайтл.')
  const episode = Number(body.episode)
  if (!Number.isInteger(episode) || episode < 1 || episode > 5000) throw new UserError('Неверный номер серии.')
  const text = String(body.text ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (text.length < 2) throw new UserError('Слишком короткий комментарий.')
  if (text.length > 1000) throw new UserError('Комментарий длиннее 1000 символов.')
  const now = Date.now()
  const recent = await listRows(api, 'comments', [
    { method: 'equal', attribute: 'userId', values: [user.$id] },
    { method: 'greaterThan', attribute: 'at', values: [now - 10 * 60 * 1000] },
    { method: 'limit', values: [COMMENTS_PER_10MIN] },
  ])
  if (recent.length >= COMMENTS_PER_10MIN) throw new UserError('Слишком много комментариев подряд, передохните пару минут.')
  const row = await api('POST', `${DB}/comments/rows`, {
    rowId: 'unique()',
    data: {
      animeId: String(body.animeId),
      episode,
      userId: user.$id,
      name: (user.name || 'Зритель').slice(0, 64),
      text,
      spoiler: Boolean(body.spoiler),
      hidden: false,
      at: now,
    },
  })
  return { comment: row.json }
}

export async function commentDelete(api, req, body) {
  const user = await signedIn(api, req)
  if (!/^[a-zA-Z0-9]{1,36}$/.test(String(body.commentId ?? ''))) throw new UserError('Комментарий не найден.')
  const row = await api('GET', `${DB}/comments/rows/${body.commentId}`)
  if (row.status === 404) return { ok: true }
  const isAdmin = (user.labels ?? []).includes('admin')
  if (row.json.userId !== user.$id && !isAdmin) throw new UserError('Убрать можно только свой комментарий.')
  await api('DELETE', `${DB}/comments/rows/${body.commentId}`)
  return { ok: true }
}
